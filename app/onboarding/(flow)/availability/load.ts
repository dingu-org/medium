import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, availabilityRules } from '@/lib/db/schema';
import { DEFAULT_TIMEZONE } from '@/lib/i18n/timezone';
import {
  draftFromRules,
  type AvailabilityDraft,
} from '@/lib/onboarding/availability';

/** The saved rules and timezone as a draft; with no rules, the suggestion. */
export async function loadAvailabilityDraft(
  accountId: string,
): Promise<AvailabilityDraft> {
  const [[account], rules] = await Promise.all([
    db
      .select({ timezone: accounts.timezone })
      .from(accounts)
      .where(eq(accounts.id, accountId)),
    db
      .select({
        weekday: availabilityRules.weekday,
        start: availabilityRules.startTime,
        end: availabilityRules.endTime,
      })
      .from(availabilityRules)
      .where(eq(availabilityRules.accountId, accountId))
      .orderBy(
        asc(availabilityRules.weekday),
        asc(availabilityRules.startTime),
      ),
  ]);
  return draftFromRules(
    rules.map((r) => ({
      weekday: r.weekday,
      start: r.start.slice(0, 5),
      end: r.end.slice(0, 5),
    })),
    account?.timezone ?? DEFAULT_TIMEZONE,
  );
}
