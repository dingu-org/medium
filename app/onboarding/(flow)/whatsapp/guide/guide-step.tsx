'use client';

import { GuideCards } from '@/components/onboarding/guide-cards';
import { StepShell } from '@/components/onboarding/step-shell';
import { clearStepDraft } from '@/components/onboarding/use-step-draft';
import {
  BusinessAppIllustration,
  ConnectIllustration,
  PhoneSimIllustration,
} from '@/components/onboarding/whatsapp-guide-illustrations';
import { t } from '@/lib/i18n';
import type { WhatsappScreenContext } from '@/lib/onboarding/guard';
import { REOPEN_EXIT } from '@/lib/onboarding/whatsapp';
import { markSeenAndAdvance } from '../../actions';

const g = t.onboarding.whatsappGuide;

export function WhatsappGuideStep({
  accountId,
  progress,
  backHref,
  reopened,
}: WhatsappScreenContext) {
  return (
    <StepShell
      screen="whatsapp"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      heading={g.title}
      subheading={g.sub}
      primary={{
        label: t.onboarding.flow.continue,
        onPress: async () => {
          clearStepDraft(accountId, 'whatsapp-choice');
          // The guide made no connection: the step counts as skipped.
          return reopened
            ? REOPEN_EXIT
            : markSeenAndAdvance('whatsapp', 'skipped');
        },
      }}
    >
      <GuideCards
        cards={[
          {
            title: g.card1Title,
            body: g.card1Body,
            illustration: <PhoneSimIllustration />,
          },
          {
            title: g.card2Title,
            body: g.card2Body,
            illustration: <BusinessAppIllustration />,
          },
          {
            title: g.card3Title,
            body: (
              <>
                {g.card3Lead} <strong>{g.card3Strong}</strong> {g.card3Tail}
              </>
            ),
            illustration: <ConnectIllustration />,
          },
        ]}
      />
      <p className="text-ink-2 mt-4 text-[13.5px] leading-snug">{g.note}</p>
    </StepShell>
  );
}
