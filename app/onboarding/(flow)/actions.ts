'use server';

import { z } from 'zod';
import { instrumentedAction } from '@/lib/actions/instrument';
import { SEEN_STEPS } from '@/lib/onboarding/flow';
import { advanceFrom, markStepSeen } from '@/lib/onboarding/flow-state';
import { requireActiveFlowAccount } from '@/lib/onboarding/guard';
import type { StepActionResult } from '@/lib/onboarding/step-result';
import { createServerClient } from '@/lib/supabase/server';

const seenSchema = z.object({
  step: z.enum(SEEN_STEPS),
  outcome: z.enum(['completed', 'skipped']),
});

/**
 * Records that a skippable step was seen or skipped (idempotent: the first
 * timestamp wins) and moves on. `outcome` is unused for now; it is the hook
 * point for the analytics events (MED-125).
 */
export const markSeenAndAdvance = instrumentedAction(
  'onboarding.markSeenAndAdvance',
  async (step: string, outcome: string): Promise<StepActionResult> => {
    const parsed = seenSchema.parse({ step, outcome });
    const accountId = await requireActiveFlowAccount();
    await markStepSeen(accountId, parsed.step);
    return advanceFrom(accountId, parsed.step);
  },
);

/**
 * The Finish button. Completion itself is written when Finish renders; the
 * dashboard gate lets the account through from then on.
 */
export const goToDashboard = instrumentedAction(
  'onboarding.goToDashboard',
  async (): Promise<StepActionResult> => {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: true, next: '/sign-in', replace: true };
    return { ok: true, next: '/today', replace: true };
  },
);
