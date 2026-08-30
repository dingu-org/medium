import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBillingUsageMonitor } from '../billing-usage-monitor';
import { testNowUtc } from '@/tests/support/clock';

/**
 * Unit-level, so the flag can be flipped without reseeding a database. The two
 * halves of the sweep are stubbed at the `@/lib/billing/usage` boundary and the
 * PT scan at the `@/lib/db` boundary; what is under test here is which of those
 * calls the monitor makes, not what they return from Postgres. The wired-up
 * behaviour with reminders ON lives in
 * `lib/billing/__tests__/reminder-usage.integration.test.ts`.
 */
const mocks = vi.hoisted(() => ({
  accountIds: [] as string[],
  getReminderUsage: vi.fn(),
  countScheduledRemindersInMonth: vi.fn(),
  emitReminderPredictiveWarningOnce: vi.fn(),
  emitConversationUsageEventIfCrossed: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    selectDistinct: () => ({
      from: () => ({
        where: async () => mocks.accountIds.map((accountId) => ({ accountId })),
      }),
    }),
  },
}));

vi.mock('@/lib/billing/usage', () => ({
  getReminderUsage: mocks.getReminderUsage,
  countScheduledRemindersInMonth: mocks.countScheduledRemindersInMonth,
  emitReminderPredictiveWarningOnce: mocks.emitReminderPredictiveWarningOnce,
  emitConversationUsageEventIfCrossed: mocks.emitConversationUsageEventIfCrossed,
}));

// Derived, never written down: the month key has to track the calendar or the
// fixture rots the moment the wall clock leaves the month it was written in.
const NOW = testNowUtc({ dayOfMonth: 15 });
const MONTH_KEY = NOW.toISOString().slice(0, 7);

/** used 8 of 10 with 5 more queued — comfortably over the remaining quota. */
const OVER_QUOTA = {
  delivered: 8,
  inFlight: 0,
  used: 8,
  limit: 10,
  remaining: 2,
  monthKey: MONTH_KEY,
};

describe('runBillingUsageMonitor', () => {
  beforeEach(() => {
    mocks.accountIds = ['account-1'];
    mocks.getReminderUsage.mockResolvedValue(OVER_QUOTA);
    mocks.countScheduledRemindersInMonth.mockResolvedValue(5);
    mocks.emitReminderPredictiveWarningOnce.mockResolvedValue(undefined);
    // 80% of the conversation quota crossed — the half that must survive.
    mocks.emitConversationUsageEventIfCrossed.mockResolvedValue('warned');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('warns predictively while reminders are enabled', async () => {
    // vitest.config.ts sets REMINDERS_ENABLED=true for the whole run.
    const result = await runBillingUsageMonitor(NOW);

    expect(result).toEqual({
      ptsScanned: 1,
      reminderWarnings: 1,
      conversationEvents: 1,
    });
    expect(mocks.emitReminderPredictiveWarningOnce).toHaveBeenCalledWith({
      accountId: 'account-1',
      monthKey: MONTH_KEY,
      used: 8,
      limit: 10,
      remaining: 2,
      upcoming: 5,
    });
  });

  it('skips the reminder half when the flag is off, and still meters conversations', async () => {
    vi.stubEnv('REMINDERS_ENABLED', 'false');

    const result = await runBillingUsageMonitor(NOW);

    // Same over-quota fixtures as the enabled case — only the flag changed.
    expect(result.reminderWarnings).toBe(0);
    expect(mocks.getReminderUsage).not.toHaveBeenCalled();
    expect(mocks.countScheduledRemindersInMonth).not.toHaveBeenCalled();
    expect(mocks.emitReminderPredictiveWarningOnce).not.toHaveBeenCalled();

    // The conversation half is untouched: still scanned, still emitting.
    expect(result).toMatchObject({ ptsScanned: 1, conversationEvents: 1 });
    expect(mocks.emitConversationUsageEventIfCrossed).toHaveBeenCalledWith(
      'account-1',
      NOW,
    );
  });

  it('treats an unset flag as off', async () => {
    vi.stubEnv('REMINDERS_ENABLED', undefined);

    const result = await runBillingUsageMonitor(NOW);

    expect(result).toEqual({
      ptsScanned: 1,
      reminderWarnings: 0,
      conversationEvents: 1,
    });
    expect(mocks.emitReminderPredictiveWarningOnce).not.toHaveBeenCalled();
  });

  it('keeps sweeping every PT for conversations with the flag off', async () => {
    vi.stubEnv('REMINDERS_ENABLED', 'false');
    mocks.accountIds = ['account-1', 'account-2', 'account-3'];
    mocks.emitConversationUsageEventIfCrossed
      .mockResolvedValueOnce('reached')
      .mockResolvedValueOnce('none')
      .mockResolvedValueOnce('warned');

    const result = await runBillingUsageMonitor(NOW);

    expect(result).toEqual({
      ptsScanned: 3,
      reminderWarnings: 0,
      conversationEvents: 2,
    });
    expect(mocks.emitConversationUsageEventIfCrossed).toHaveBeenCalledTimes(3);
  });
});
