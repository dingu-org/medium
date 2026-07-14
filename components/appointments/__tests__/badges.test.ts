import { describe, expect, it } from 'vitest';
import { reminderBadge } from '../badges';
import { t } from '@/lib/i18n';

describe('reminderBadge', () => {
  it('flags a plan-quota skip with dedicated warn copy', () => {
    expect(
      reminderBadge({ status: 'skipped', responseType: null, skippedReason: 'plan_reminder_quota' }),
    ).toEqual({ label: t.reminder.quotaReached, tone: 'warning' });
  });

  it('keeps the neutral generic label for other skips', () => {
    expect(
      reminderBadge({ status: 'skipped', responseType: null, skippedReason: 'short_notice' }),
    ).toEqual({ label: t.reminder.skipped, tone: 'neutral' });
    // No reason still reads as a routine skip, not a cap flag.
    expect(reminderBadge({ status: 'skipped', responseType: null })).toEqual({
      label: t.reminder.skipped,
      tone: 'neutral',
    });
  });
});
