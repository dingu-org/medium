import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages, patients, pts } from '@/lib/db/schema';
import type { InboundMessage } from '@/lib/conversation/types';
import {
  CAP_HANDOFF_MODEL,
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

let ptId = '';
let patientId = '';
let conversationId = '';
let seq = 0;

async function seedInbound(content: string): Promise<InboundMessage> {
  seq += 1;
  const [row] = await db
    .insert(messages)
    .values({
      ptId,
      conversationId,
      externalId: `wamid.CAP.${Date.now()}.${seq}`,
      role: 'patient',
      channel: 'whatsapp',
      content,
    })
    .returning({ id: messages.id, channel: messages.channel });
  return {
    id: row.id,
    conversationId,
    ptId,
    patientId,
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
    .where(and(eq(messages.ptId, ptId), eq(messages.model, CAP_HANDOFF_MODEL)));
  return rows.length;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `cap-handoff-${Date.now()}@example.com`,
    password: 'cap-handoff-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  await db.delete(messages).where(eq(messages.ptId, ptId));
  await db.delete(conversations).where(eq(conversations.ptId, ptId));
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db.update(pts).set({ timezone: 'UTC' }).where(eq(pts.id, ptId));

  const [patient] = await db
    .insert(patients)
    .values({ ptId, name: 'Pat', phone: '447700900999', waId: '447700900999' })
    .returning({ id: patients.id });
  patientId = patient.id;
  const [conversation] = await db
    .insert(conversations)
    .values({ ptId, patientId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
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

    await markCapHandoff({ ptId, conversationId, instant: day1a });

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
      ptId,
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
