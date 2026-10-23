'use client';

import { StepShell } from '@/components/onboarding/step-shell';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import { saveAvailabilityPlaceholder } from './actions';

// PLACEHOLDER(MED-121): replaced by the real Availability screen.
export function AvailabilityStep({
  accountId,
  progress,
  backHref,
}: ScreenContext) {
  return (
    <StepShell
      screen="availability"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      heading={t.onboarding.steps.availabilityTitle}
      subheading={t.onboarding.steps.availabilitySub}
      primary={{
        label: t.onboarding.flow.continue,
        onPress: () => saveAvailabilityPlaceholder(),
      }}
    >
      {/* PLACEHOLDER(MED-121) copy */}
      <p className="text-sm">E hënë–E premte, 09:00–17:00</p>
    </StepShell>
  );
}
