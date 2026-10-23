'use client';

import { StepShell } from '@/components/onboarding/step-shell';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import { markSeenAndAdvance } from '../actions';

// PLACEHOLDER(MED-116): replaced by the real "How it works" screen.
export function HowItWorksStep({
  accountId,
  progress,
  backHref,
}: ScreenContext) {
  return (
    <StepShell
      screen="intro"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      heading={t.onboarding.welcomeTitle}
      subheading={t.onboarding.welcomeSub}
      primary={{
        label: t.onboarding.start,
        onPress: () => markSeenAndAdvance('intro', 'completed'),
      }}
    >
      {null}
    </StepShell>
  );
}
