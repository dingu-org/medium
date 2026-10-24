'use client';

import { GuideCards } from '@/components/onboarding/guide-cards';
import {
  AddToHomeIllustration,
  HomeScreenIllustration,
  ShareIllustration,
} from '@/components/onboarding/install-guide-illustrations';
import { StepShell } from '@/components/onboarding/step-shell';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import { markSeenAndAdvance } from '../../actions';

const g = t.onboarding.notificationsGuide;

export function NotificationsGuideStep({
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
      heading={g.title}
      subheading={g.sub}
      primary={{
        label: g.continueInBrowser,
        // No permission was given here: the step counts as skipped. No skip
        // link: installing happens outside the app, there is nothing to choose.
        onPress: () => markSeenAndAdvance('notifications', 'skipped'),
      }}
    >
      <GuideCards
        cards={[
          {
            title: g.card1Title,
            body: g.card1Body,
            illustration: <ShareIllustration />,
          },
          {
            title: g.card2Title,
            body: g.card2Body,
            illustration: <AddToHomeIllustration />,
          },
          {
            title: g.card3Title,
            body: g.card3Body,
            illustration: <HomeScreenIllustration />,
          },
        ]}
      />
      <p className="text-ink-2 mt-4 text-[13.5px] leading-snug">{g.note}</p>
    </StepShell>
  );
}
