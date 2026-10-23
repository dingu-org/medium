'use client';

import { StepShell } from '@/components/onboarding/step-shell';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import { markSeenAndAdvance } from '../actions';

// PLACEHOLDER(MED-122): replaced by the real WhatsApp choice screen (no main
// button until a path is picked; skip is the only way on for now).
export function WhatsappStep({ accountId, progress, backHref }: ScreenContext) {
  return (
    <StepShell
      screen="whatsapp"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      heading={t.onboarding.steps.whatsappTitle}
      subheading={t.onboarding.steps.whatsappSub}
      primary={null}
      skip={{
        label: t.onboarding.flow.later,
        onPress: () => markSeenAndAdvance('whatsapp', 'skipped'),
      }}
    >
      {null}
    </StepShell>
  );
}
