'use server';

import { z } from 'zod';
import { instrumentedAction } from '@/lib/actions/instrument';
import { SEEN_STEPS } from '@/lib/onboarding/flow';
import { advanceFrom, markStepSeen } from '@/lib/onboarding/flow-state';
import { recordOnboardingEvent } from '@/lib/onboarding/funnel';
import { requireActiveFlowAccount } from '@/lib/onboarding/guard';
import type { StepActionResult } from '@/lib/onboarding/step-result';
import { createServerClient } from '@/lib/supabase/server';

const seenSchema = z.object({
  step: z.enum(SEEN_STEPS),
  outcome: z.enum(['completed', 'skipped']),
});

/**
 * Records that a skippable step was seen or skipped (idempotent: the first
 * timestamp wins), records the funnel outcome and moves on.
 */
export const markSeenAndAdvance = instrumentedAction(
  'onboarding.markSeenAndAdvance',
  async (step: string, outcome: string): Promise<StepActionResult> => {
    const parsed = seenSchema.parse({ step, outcome });
    const accountId = await requireActiveFlowAccount();
    await markStepSeen(accountId, parsed.step);
    return advanceFrom(accountId, parsed.step, parsed.outcome);
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
    await recordOnboardingEvent(user.id, 'finish', 'completed');
    return { ok: true, next: '/today', replace: true };
  },
);
