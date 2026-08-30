import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOUR, testNow } from '@/tests/support/clock';
import {
  loadReminderAttempt,
  sendReminderHandler,
  tierLimit,
} from '../send-reminder';

/**
 * `db` is replaced wholesale so "the disabled path never reaches the database"
 * is an assertion rather than a hope: every query builder this module uses is a
 * spy that was never called. The rest of `@/lib/db` (notably `schema`) stays
 * real, so nothing else in the import graph changes shape.
 */
const { dbSpies } = vi.hoisted(() => ({
  dbSpies: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  db: dbSpies as unknown as typeof import('@/lib/db').db,
}));

describe('tierLimit', () => {
  it.each([
    ['TIER_50', 50],
    ['TIER_250', 250],
    ['TIER_1K', 1_000],
    ['TIER_10K', 10_000],
    ['TIER_100K', 100_000],
    ['tier_1k', 1_000],
    [' TIER_1K ', 1_000],
  ] as const)('maps %s to a limit of %i', (tier, limit) => {
    expect(tierLimit(tier)).toBe(limit);
  });

  it.each(['TIER_UNLIMITED', 'UNLIMITED', null, '', 'TIER_UNKNOWN', 'garbage'])(
    'treats %s as uncapped',
    (tier) => {
      expect(tierLimit(tier)).toBeNull();
    },
  );
});

/**
 * The suite runs with `REMINDERS_ENABLED=true` (vitest.config.ts) so the ~35
 * files documenting the feature keep exercising it. These two opt out to prove
 * the kill switch (lib/reminders/flag.ts) actually stops the pipeline.
 */
describe('with reminders disabled', () => {
  const ACCOUNT_ID = '00000000-0000-0000-0000-0000000000a1';
  const APPOINTMENT_ID = '00000000-0000-0000-0000-0000000000b2';

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('skips loadReminderAttempt before it reads the job row', async () => {
    vi.stubEnv('REMINDERS_ENABLED', 'false');
    const now = testNow();

    // A run that was already asleep in `wait-until-reminder` when the flag
    // flipped: it wakes, and the gate answers ahead of the `stale_run` read.
    const state = await loadReminderAttempt({
      accountId: ACCOUNT_ID,
      appointmentId: APPOINTMENT_ID,
      runId: '01JRUNSLEEPINGWHENFLAGFLIPPED',
      scheduledFor: new Date(now.getTime() + HOUR),
      now,
    });

    expect(state).toEqual({ kind: 'skipped', reason: 'reminders_disabled' });
    expect(dbSpies.select).not.toHaveBeenCalled();
    expect(dbSpies.update).not.toHaveBeenCalled();
    expect(dbSpies.transaction).not.toHaveBeenCalled();
  });

  it('returns the handler skip without scheduling a reminder_jobs row', async () => {
    vi.stubEnv('REMINDERS_ENABLED', 'false');
    const now = testNow();

    // Any step at all would mean the gate let the run past it, so every step
    // tool throws: no schedule row, no sleep, no `reminder.skipped` event.
    const step = new Proxy(
      {},
      {
        get: (_target, tool: string) => () => {
          throw new Error(`step.${tool} ran with reminders disabled`);
        },
      },
    );

    const result = await sendReminderHandler({
      event: {
        name: 'appointment.booked',
        ts: now.getTime(),
        data: {
          accountId: ACCOUNT_ID,
          appointmentId: APPOINTMENT_ID,
          startsAt: new Date(now.getTime() + 48 * HOUR).toISOString(),
        },
      },
      runId: '01JRUNBOOKEDWHILEDISABLED',
      step,
    } as unknown as Parameters<typeof sendReminderHandler>[0]);

    expect(result).toEqual({ skipped: 'reminders_disabled' });
    // No row means `reminderBadge(null)` — the appointment shows no reminder
    // chip at all, rather than a "skipped" one.
    expect(dbSpies.insert).not.toHaveBeenCalled();
    expect(dbSpies.select).not.toHaveBeenCalled();
    expect(dbSpies.transaction).not.toHaveBeenCalled();
  });
});
