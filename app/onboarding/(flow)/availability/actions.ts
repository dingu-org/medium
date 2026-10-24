'use server';

import { eq } from 'drizzle-orm';
import { instrumentedAction } from '@/lib/actions/instrument';
import { validateWeekly, type WeeklyRule } from '@/lib/availability/rules';
import { db } from '@/lib/db';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import { accounts, availabilityRules } from '@/lib/db/schema';
import { t } from '@/lib/i18n';
import { advanceFrom } from '@/lib/onboarding/flow-state';
import { requireActiveFlowAccount } from '@/lib/onboarding/guard';
import type { StepActionResult } from '@/lib/onboarding/step-result';

export type AvailabilityInput = { timezone: string; rules: WeeklyRule[] };

/**
 * Validates, then replaces every availability rule of the account and sets the
 * timezone in one transaction. The advisory lock serialises a double submit, a
 * retry or a second tab, so the rows are always exactly one writer's set.
 */
export const saveAvailabilityStep = instrumentedAction(
  'onboarding.saveAvailability',
  async (raw: AvailabilityInput): Promise<StepActionResult> => {
    const accountId = await requireActiveFlowAccount();
    const input: Partial<AvailabilityInput> =
      raw && typeof raw === 'object' ? raw : {};
    const v = validateWeekly({ timezone: input.timezone, rules: input.rules });
    if (!v.ok) {
      return {
        ok: false,
        fieldErrors: v.fieldErrors,
        reason: t.onboarding.availability.fixHours,
      };
    }
    await withAdvisoryLock(`onboarding-availability:${accountId}`, () =>
      db.transaction(async (tx) => {
        await tx
          .delete(availabilityRules)
          .where(eq(availabilityRules.accountId, accountId));
        await tx.insert(availabilityRules).values(
          v.rules.map((r) => ({
            accountId,
            weekday: r.weekday,
            startTime: `${r.start}:00`,
            endTime: `${r.end}:00`,
          })),
        );
        await tx
          .update(accounts)
          .set({ timezone: v.timezone })
          .where(eq(accounts.id, accountId));
      }),
    );
    return advanceFrom(accountId, 'availability');
  },
);
