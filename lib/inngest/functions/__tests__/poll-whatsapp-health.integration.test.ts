import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// The outbox->Inngest publish is best-effort and covered by the outbox suite;
// stubbing it keeps these tests free of network retries while still exercising
// the durable `events`/`event_outbox` rows appendBackgroundEvent writes. The
// append itself stays real so the transaction boundary is what is under test.
vi.mock('@/lib/events/outbox', () => ({
  tryPublishOutboxEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/events/background', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/events/background')>();
  return {
    ...actual,
    appendBackgroundEvent: vi.fn(actual.appendBackgroundEvent),
  };
});

import { addDays } from 'date-fns';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventOutbox, events, whatsappConnections } from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { appendBackgroundEvent } from '@/lib/events/background';
import { createServiceClient } from '@/lib/supabase/service';
import { excludeForeignRows } from '@/tests/support/isolation';
import {
  claimTokenExpiryWarnings,
  pollConnectionQuality,
} from '../poll-whatsapp-health';

let accountId = '';
let connectionId = '';
let sequence = 0;

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `wa-health-${Date.now()}@example.com`,
    password: 'wa-health-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

beforeEach(async () => {
  await db.delete(events).where(eq(events.accountId, accountId));
  await db
    .delete(whatsappConnections)
    .where(eq(whatsappConnections.accountId, accountId));
  // `claimTokenExpiryWarnings` is a cron: it sweeps every active connection in
  // the database. Another tenant's connection with a near expiry would be
  // claimed alongside this one — inflating the returned list, and worse,
  // absorbing the one-shot `appendBackgroundEvent` rejection the rollback test
  // arms. Stamp the foreign rows so this suite's connection is the only
  // candidate.
  await excludeForeignRows(whatsappConnections, accountId, {
    expiryWarningSentAt: new Date(),
  });

  const [connection] = await db
    .insert(whatsappConnections)
    .values({
      accountId,
      phoneNumberId: `PNI_HEALTH_${Date.now()}_${++sequence}`,
      wabaId: 'WABA_HEALTH',
      accessTokenEncrypted: await encryptToken('HEALTH_TOKEN'),
      status: 'active',
      qualityRating: 'GREEN',
      tier: 'TIER_250',
    })
    .returning({ id: whatsappConnections.id });
  connectionId = connection.id;
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('pollConnectionQuality', () => {
  it('appends a durable warning when the rating drops', async () => {
    const result = await pollConnectionQuality({
      connectionId,
      getQualityRatingFn: async () => ({
        qualityRating: 'RED',
        tier: 'TIER_1K',
      }),
    });
    expect(result).toMatchObject({
      kind: 'updated',
      qualityRating: 'RED',
      warning: true,
    });

    const [connection] = await db
      .select({ qualityRating: whatsappConnections.qualityRating })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, connectionId));
    expect(connection.qualityRating).toBe('RED');

    const stored = await db
      .select()
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'wa.quality_warning')));
    expect(stored).toHaveLength(1);
    expect(stored[0].payload).toMatchObject({
      accountId,
      connectionId,
      qualityRating: 'RED',
      tier: 'TIER_1K',
    });
    const outbox = await db
      .select({ eventType: eventOutbox.eventType })
      .from(eventOutbox)
      .where(eq(eventOutbox.eventId, stored[0].id));
    expect(outbox).toEqual([{ eventType: 'wa.quality_warning' }]);
  });

  it('still stores the rating but writes no event when nothing changed', async () => {
    await db
      .update(whatsappConnections)
      .set({ qualityRating: 'RED' })
      .where(eq(whatsappConnections.id, connectionId));

    const result = await pollConnectionQuality({
      connectionId,
      getQualityRatingFn: async () => ({
        qualityRating: 'RED',
        tier: 'TIER_10K',
      }),
    });
    expect(result).toMatchObject({ kind: 'updated', warning: false });

    const [connection] = await db
      .select({ tier: whatsappConnections.tier })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, connectionId));
    expect(connection.tier).toBe('TIER_10K');
    expect(
      await db.select().from(events).where(eq(events.accountId, accountId)),
    ).toHaveLength(0);
  });
});

describe('claimTokenExpiryWarnings', () => {
  it('claims once and leaves a durable event behind', async () => {
    await db
      .update(whatsappConnections)
      .set({ tokenExpiresAt: addDays(new Date(), 3) })
      .where(eq(whatsappConnections.id, connectionId));

    const warnings = await claimTokenExpiryWarnings();
    expect(warnings).toEqual([
      expect.objectContaining({ accountId, connectionId, daysRemaining: 3 }),
    ]);

    const stored = await db
      .select()
      .from(events)
      .where(
        and(eq(events.accountId, accountId), eq(events.type, 'wa.connection.expiring')),
      );
    expect(stored).toHaveLength(1);
    expect(stored[0].payload).toMatchObject({ connectionId, daysRemaining: 3 });
    const outbox = await db
      .select({ eventType: eventOutbox.eventType })
      .from(eventOutbox)
      .where(eq(eventOutbox.eventId, stored[0].id));
    expect(outbox).toEqual([{ eventType: 'wa.connection.expiring' }]);

    // The stamp makes the warning one-shot: later runs must find nothing.
    await expect(claimTokenExpiryWarnings()).resolves.toEqual([]);
    expect(
      await db
        .select()
        .from(events)
        .where(
          and(eq(events.accountId, accountId), eq(events.type, 'wa.connection.expiring')),
        ),
    ).toHaveLength(1);
  });

  it('rolls the one-shot claim back when the durable append fails', async () => {
    await db
      .update(whatsappConnections)
      .set({ tokenExpiresAt: addDays(new Date(), 2) })
      .where(eq(whatsappConnections.id, connectionId));
    vi.mocked(appendBackgroundEvent).mockImplementationOnce(() =>
      Promise.reject(new Error('events unavailable')),
    );

    await expect(claimTokenExpiryWarnings()).rejects.toThrow(
      'events unavailable',
    );

    // Stamping without the event would swallow the only pre-expiry heads-up the
    // PT ever gets, so the claim has to roll back with it and the next cron run
    // must be able to retry.
    const [connection] = await db
      .select({
        expiryWarningSentAt: whatsappConnections.expiryWarningSentAt,
      })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, connectionId));
    expect(connection.expiryWarningSentAt).toBeNull();

    const retried = await claimTokenExpiryWarnings();
    expect(retried).toHaveLength(1);
    expect(
      await db
        .select()
        .from(events)
        .where(
          and(eq(events.accountId, accountId), eq(events.type, 'wa.connection.expiring')),
        ),
    ).toHaveLength(1);
  });
});
