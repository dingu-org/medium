'use server';

import { eq } from 'drizzle-orm';
import { instrumentedAction } from '@/lib/actions/instrument';
import { db } from '@/lib/db';
import { availabilityRules } from '@/lib/db/schema';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import { advanceFrom } from '@/lib/onboarding/flow-state';
import { requireActiveFlowAccount } from '@/lib/onboarding/guard';
import type { StepActionResult } from '@/lib/onboarding/step-result';

// PLACEHOLDER(MED-121): replaced together with the screen. Inserts Monday to
// Friday 09:00-17:00 (weekday = JS getDay) only when the account has no rules,
// under a lock so a double press cannot insert twice.
export const saveAvailabilityPlaceholder = instrumentedAction(
  'onboarding.saveAvailability',
  async (): Promise<StepActionResult> => {
    const accountId = await requireActiveFlowAccount();
    await withAdvisoryLock(`onboarding-availability:${accountId}`, async () => {
      const existing = await db
        .select({ id: availabilityRules.id })
        .from(availabilityRules)
        .where(eq(availabilityRules.accountId, accountId))
        .limit(1);
      if (existing.length > 0) return;
      await db.insert(availabilityRules).values(
        [1, 2, 3, 4, 5].map((weekday) => ({
          accountId,
          weekday,
          startTime: '09:00:00',
          endTime: '17:00:00',
        })),
      );
    });
    return advanceFrom(accountId, 'availability');
  },
);
