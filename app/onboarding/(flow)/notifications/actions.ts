'use server';

import { revalidatePath } from 'next/cache';
import { instrumentedAction } from '@/lib/actions/instrument';
import { markStepSeen } from '@/lib/onboarding/flow-state';
import { requireActiveFlowAccount } from '@/lib/onboarding/guard';
import { NOTIFICATIONS_GUIDE_HREF } from '@/lib/onboarding/notifications';
import type { StepActionResult } from '@/lib/onboarding/step-result';

/**
 * Opens the iPhone install guide and marks the step seen, so the home-screen
 * app (a fresh session, signed in again) resumes at Finish instead of here.
 * Marked here, not when the guide renders, to keep writes out of GET/prefetch.
 */
export const showNotificationsGuide = instrumentedAction(
  'onboarding.showNotificationsGuide',
  async (): Promise<StepActionResult> => {
    const accountId = await requireActiveFlowAccount();
    await markStepSeen(accountId, 'notifications');
    revalidatePath('/onboarding', 'layout');
    return { ok: true, next: NOTIFICATIONS_GUIDE_HREF };
  },
);
