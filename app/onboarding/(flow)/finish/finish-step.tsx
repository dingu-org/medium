'use client';

import { StepShell } from '@/components/onboarding/step-shell';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import { goToDashboard } from '../actions';

// PLACEHOLDER(MED-124): replaced by the real Finish screens.
export function FinishStep({
  accountId,
  progress,
  whatsappConnected,
}: ScreenContext & { whatsappConnected: boolean }) {
  return (
    <StepShell
      screen="finish"
      progress={progress}
      backHref={null}
      accountId={accountId}
      align="center"
      heading={whatsappConnected ? 'Gati' : 'Edhe një hap'}
      primary={{
        label: t.onboarding.flow.goToApp,
        onPress: () => goToDashboard(),
      }}
    >
      {null}
    </StepShell>
  );
}
