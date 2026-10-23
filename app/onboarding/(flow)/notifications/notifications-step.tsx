'use client';

import { StepShell } from '@/components/onboarding/step-shell';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import { markSeenAndAdvance } from '../actions';

// PLACEHOLDER(MED-123): replaced by the real install and notifications screen.
export function NotificationsStep({
  accountId,
  progress,
  backHref,
}: ScreenContext) {
  return (
    <StepShell
      screen="notifications"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      heading={t.settings.sectionNotifications}
      primary={{
        label: t.onboarding.flow.continue,
        onPress: () => markSeenAndAdvance('notifications', 'completed'),
      }}
      skip={{
        label: t.onboarding.flow.notNow,
        onPress: () => markSeenAndAdvance('notifications', 'skipped'),
      }}
    >
      {null}
    </StepShell>
  );
}
