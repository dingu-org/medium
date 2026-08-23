import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages, patients, pts } from '@/lib/db/schema';
import type { InboundMessage } from '@/lib/conversation/types';
import {
  markNonTextNotice,
  nonTextNoticeMessage,
  NON_TEXT_NOTICE_MODEL,
  prepareNonTextNotice,
} from '@/lib/conversation/non-text';
import { DEFAULT_BUSINESS_LABEL_SQ } from '@/lib/conversation/handoff-offer';
import { createServiceClient } from '@/lib/supabase/service';
import { DAY, HOUR, testNow } from '@/tests/support/clock';

// The notice is throttled to one per *local day*, so what these instants need is
// a same-day pair and a next-day one — never a particular calendar date. The PT
// timezone is UTC here, and a 10:30 anchor keeps the +1h partner inside the same
// UTC day.
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
      externalId: `wamid.NONTEXT.${Date.now()}.${seq}`,
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

async function countNotices(): Promise<number> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(eq(messages.ptId, ptId), eq(messages.model, NON_TEXT_NOTICE_MODEL)),
    );
  return rows.length;
}

async function readOfferAnchor(): Promise<string | null> {
  const [row] = await db
    .select({ anchor: conversations.handoffOfferMessageId })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  return row.anchor;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `non-text-${Date.now()}@example.com`,
    password: 'non-text-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  await db.delete(messages).where(eq(messages.ptId, ptId));
  await db.delete(conversations).where(eq(conversations.ptId, ptId));
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db
    .update(pts)
    .set({ timezone: 'UTC', practiceName: 'Studio Bella' })
    .where(eq(pts.id, ptId));

  const [patient] = await db
    .insert(patients)
    .values({ ptId, name: 'Pat', phone: '447700900888', waId: '447700900888' })
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

describe('non-text notice', () => {
  it('answers once and arms the handoff offer against the media message', async () => {
    const inbound = await seedInbound('[mesazh zanor]');
    const result = await prepareNonTextNotice({
      inbound,
      practiceName: 'Studio Bella',
      timezone: 'UTC',
      instant: DAY_ONE,
    });

    expect(result.action).toBe('send');
    if (result.action !== 'send') throw new Error('expected send');
    expect(result.outbound.replyToMessageId).toBe(inbound.id);
    expect(result.outbound.content).toBe(nonTextNoticeMessage('Studio Bella'));
    // The offer is answered only by the message immediately after the one it
    // answered, which is what the anchor makes true.
    expect(await readOfferAnchor()).toBe(inbound.id);
  });

  // A patient who fires off five voice notes in a row is told once, not five
  // times — the second media message gets no second explanatory reply.
  it('sends no second notice for another media message the same day', async () => {
    const first = await seedInbound('[mesazh zanor]');
    await prepareNonTextNotice({
      inbound: first,
      practiceName: 'Studio Bella',
      timezone: 'UTC',
      instant: DAY_ONE,
    });
    await markNonTextNotice({ ptId, conversationId, instant: DAY_ONE });

    const second = await seedInbound('[foto]');
    const repeat = await prepareNonTextNotice({
      inbound: second,
      practiceName: 'Studio Bella',
      timezone: 'UTC',
      instant: new Date(DAY_ONE.getTime() + HOUR),
    });

    expect(repeat).toMatchObject({
      action: 'skip',
      reason: 'already_notified_today',
    });
    expect(await countNotices()).toBe(1);
    // No fresh offer either: the anchor still belongs to the message that was
    // actually answered.
    expect(await readOfferAnchor()).toBe(first.id);
  });

  // Per day rather than once per conversation for good: a conversation row lives
  // as long as the patient does, so a once-ever notice would meet the voice note
  // they send months from now with the very silence this exists to remove.
  it('answers again on a new local day', async () => {
    const first = await seedInbound('[mesazh zanor]');
    await prepareNonTextNotice({
      inbound: first,
      practiceName: 'Studio Bella',
      timezone: 'UTC',
      instant: DAY_ONE,
    });
    await markNonTextNotice({ ptId, conversationId, instant: DAY_ONE });

    const later = await seedInbound('[mesazh zanor]');
    const next = await prepareNonTextNotice({
      inbound: later,
      practiceName: 'Studio Bella',
      timezone: 'UTC',
      instant: new Date(DAY_ONE.getTime() + DAY),
    });

    expect(next.action).toBe('send');
    expect(await countNotices()).toBe(2);
    expect(await readOfferAnchor()).toBe(later.id);
  });

  it('is idempotent for a repeat of the same inbound (retry)', async () => {
    const inbound = await seedInbound('[foto]');
    const a = await prepareNonTextNotice({
      inbound,
      practiceName: 'Studio Bella',
      timezone: 'UTC',
      instant: DAY_ONE,
    });
    const b = await prepareNonTextNotice({
      inbound,
      practiceName: 'Studio Bella',
      timezone: 'UTC',
      instant: DAY_ONE,
    });

    if (a.action !== 'send' || b.action !== 'send') {
      throw new Error('expected both sends before mark');
    }
    expect(b.outbound.id).toBe(a.outbound.id);
    expect(await countNotices()).toBe(1);
  });

  it('falls back to the neutral business label when the practice has no name', async () => {
    const inbound = await seedInbound('[dokument]');
    const result = await prepareNonTextNotice({
      inbound,
      practiceName: null,
      timezone: 'UTC',
      instant: DAY_ONE,
    });

    if (result.action !== 'send') throw new Error('expected send');
    expect(result.outbound.content).toContain(DEFAULT_BUSINESS_LABEL_SQ);
  });
});
