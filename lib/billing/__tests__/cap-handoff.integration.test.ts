import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages, customers, accounts } from '@/lib/db/schema';
import type { InboundMessage } from '@/lib/conversation/types';

const sendPush = vi.hoisted(() => vi.fn());
vi.mock('@/lib/notifications/push', () => ({
  sendPush,
  vapidPublicKey: 'test-key',
}));

import {
  CAP_HANDOFF_MODEL,
  handOffCappedConversation,
  markCapHandoff,
  prepareCapHandoff,
} from '@/lib/billing/cap-handoff';
import { createServiceClient } from '@/lib/supabase/service';
import { DAY, HOUR, testNow } from '@/tests/support/clock';

// The handoff is throttled to one per *local day*, so what these instants need
// is a same-day pair and a next-day one — never a particular calendar date. The
// PT timezone is UTC here, and a 10:30 anchor keeps the +6h partner inside the
// same UTC day.
const DAY_ONE = testNow();

let accountId = '';
let customerId = '';
let conversationId = '';
let seq = 0;

async function seedInbound(content: string): Promise<InboundMessage> {
  seq += 1;
  const [row] = await db
    .insert(messages)
    .values({
      accountId,
      conversationId,
      externalId: `wamid.CAP.${Date.now()}.${seq}`,
      role: 'customer',
      channel: 'whatsapp',
      content,
    })
    .returning({ id: messages.id, channel: messages.channel });
  return {
    id: row.id,
    conversationId,
    accountId,
    customerId,
    content,
    channel: row.channel,
    externalId: null,
    occurredAt: new Date(),
  };
}

async function countHandoffReplies(): Promise<number> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.accountId, accountId), eq(messages.model, CAP_HANDOFF_MODEL)));
  return rows.length;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `cap-handoff-${Date.now()}@example.com`,
    password: 'cap-handoff-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

beforeEach(async () => {
  await db.delete(messages).where(eq(messages.accountId, accountId));
  await db.delete(conversations).where(eq(conversations.accountId, accountId));
  await db.delete(customers).where(eq(customers.accountId, accountId));
  await db.update(accounts).set({ timezone: 'UTC' }).where(eq(accounts.id, accountId));

  const [customer] = await db
    .insert(customers)
    .values({ accountId, name: 'Pat', phone: '447700900999', waId: '447700900999' })
    .returning({ id: customers.id });
  customerId = customer.id;
  const [conversation] = await db
    .insert(conversations)
    .values({ accountId, customerId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;

  sendPush.mockReset();
  sendPush.mockResolvedValue({ sent: 1, removed: 0 });
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('cap handoff', () => {
  it('sends one static handoff, then skips the rest of that local day', async () => {
    const day1a = new Date(DAY_ONE.getTime());
    const day1b = new Date(DAY_ONE.getTime() + 6 * HOUR);

    const inbound1 = await seedInbound('Message one');
    const first = await prepareCapHandoff({
      inbound: inbound1,
      timezone: 'UTC',
      instant: day1a,
    });
    expect(first.action).toBe('send');
    if (first.action !== 'send') throw new Error('expected send');
    expect(first.outbound.replyToMessageId).toBe(inbound1.id);

    await markCapHandoff({ accountId, conversationId, instant: day1a });

    const inbound2 = await seedInbound('Message two same day');
    const second = await prepareCapHandoff({
      inbound: inbound2,
      timezone: 'UTC',
      instant: day1b,
    });
    expect(second).toMatchObject({
      action: 'skip',
      reason: 'already_handed_off_today',
    });

    // Only the first message got a handoff reply; the second did not.
    expect(await countHandoffReplies()).toBe(1);
  });

  it('sends again on a new local day', async () => {
    const inbound1 = await seedInbound('Day one');
    await prepareCapHandoff({
      inbound: inbound1,
      timezone: 'UTC',
      instant: DAY_ONE,
    });
    await markCapHandoff({
      accountId,
      conversationId,
      instant: DAY_ONE,
    });

    const inbound2 = await seedInbound('Day two');
    const next = await prepareCapHandoff({
      inbound: inbound2,
      timezone: 'UTC',
      instant: new Date(DAY_ONE.getTime() + DAY),
    });
    expect(next.action).toBe('send');
    expect(await countHandoffReplies()).toBe(2);
  });

  it('is idempotent for a repeat of the same inbound (retry)', async () => {
    const inbound = await seedInbound('Retry me');
    const a = await prepareCapHandoff({
      inbound,
      timezone: 'UTC',
      instant: DAY_ONE,
    });
    const b = await prepareCapHandoff({
      inbound,
      timezone: 'UTC',
      instant: DAY_ONE,
    });
    if (a.action !== 'send' || b.action !== 'send') {
      throw new Error('expected both sends before mark');
    }
    expect(b.outbound.id).toBe(a.outbound.id);
    expect(await countHandoffReplies()).toBe(1);
  });
});

describe('cap handoff — telling the professional', () => {
  async function readConversation() {
    const [row] = await db
      .select({
        aiActive: conversations.aiActive,
        escalationState: conversations.escalationState,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    return row;
  }

  it('hands the thread to the professional and pushes that a customer is waiting', async () => {
    const result = await handOffCappedConversation({
      accountId,
      conversationId,
      customerId,
    });

    expect(result.flagged).toBe(true);
    // The thread stops looking AI-handled: it is human-owned in exactly the
    // sense the inbox, the chat banner and the Today list already read.
    expect(await readConversation()).toEqual({
      aiActive: false,
      escalationState: 'requested',
    });

    expect(sendPush).toHaveBeenCalledTimes(1);
    const [pushedAccountId, payload] = sendPush.mock.calls[0];
    expect(pushedAccountId).toBe(accountId);
    expect(payload).toMatchObject({
      url: `/chat/${conversationId}`,
      tag: `conversation-${conversationId}-reply`,
    });
    // "A customer wrote", not "a customer asked to speak with you": at the cap
    // the customer asked for nothing.
    expect(payload.title).toBe('Mesazh i ri');
  });

  // The gate compensates its day-fact away when it turns a customer away, so
  // every later message that day hits the cap afresh and the once-a-day handoff
  // throttle returns `skip`. That used to mean silence for everyone; the flag is
  // what keeps the professional seeing a waiting customer.
  it('leaves the professional owning the thread for the rest of a capped day', async () => {
    const first = await seedInbound('Message one');
    await prepareCapHandoff({
      inbound: first,
      timezone: 'UTC',
      instant: DAY_ONE,
    });
    await handOffCappedConversation({ accountId, conversationId, customerId });
    await markCapHandoff({ accountId, conversationId, instant: DAY_ONE });

    const second = await seedInbound('Message two, same day');
    const repeat = await prepareCapHandoff({
      inbound: second,
      timezone: 'UTC',
      instant: new Date(DAY_ONE.getTime() + HOUR),
    });

    expect(repeat).toMatchObject({ action: 'skip' });
    expect(await countHandoffReplies()).toBe(1);
    expect(await readConversation()).toEqual({
      aiActive: false,
      escalationState: 'requested',
    });
  });

  it('is a no-op flag once the thread is already human-owned, and still pushes', async () => {
    await handOffCappedConversation({ accountId, conversationId, customerId });
    const again = await handOffCappedConversation({
      accountId,
      conversationId,
      customerId,
    });

    expect(again.flagged).toBe(false);
    // A customer is waiting either way, and the per-conversation push tag
    // collapses the burst on the device.
    expect(sendPush).toHaveBeenCalledTimes(2);
  });
});
