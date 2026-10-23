'use client';

import { Check, Info } from 'lucide-react';
import { useRef } from 'react';
import {
  SignupPendingPanel,
  SignupStatusBanner,
  useWhatsAppSignup,
} from '@/app/(dashboard)/settings/connect-whatsapp';
import { StepShell } from '@/components/onboarding/step-shell';
import { useStepDraft } from '@/components/onboarding/use-step-draft';
import { AppBanner } from '@/components/ui/app-banner';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';
import { t } from '@/lib/i18n';
import type { WhatsappScreenContext } from '@/lib/onboarding/guard';
import {
  isWhatsappChoice,
  REOPEN_EXIT,
  WHATSAPP_CHOICES,
  WHATSAPP_GUIDE_HREF,
  whatsappPrimaryLabel,
  type WhatsappChoice,
} from '@/lib/onboarding/whatsapp';
import { cn } from '@/lib/utils';
import { markSeenAndAdvance } from '../actions';

const w = t.onboarding.whatsapp;

export function WhatsappStep({
  accountId,
  progress,
  backHref,
  reopened,
  appId,
  configId,
  graphVersion,
  initialChoice,
}: WhatsappScreenContext & {
  appId: string;
  configId: string;
  graphVersion: string;
  initialChoice: WhatsappChoice | null;
}) {
  const signup = useWhatsAppSignup({ appId, configId, graphVersion });
  // Its own draft key: the shell clears the step's `screen` draft on every
  // navigation, but Back from the guide must still show "Nuk kam ende".
  const [rawChoice, setChoice, clearChoice] =
    useStepDraft<WhatsappChoice | null>(
      accountId,
      'whatsapp-choice',
      initialChoice,
    );
  const choice = isWhatsappChoice(rawChoice) ? rawChoice : null;
  // Set once Meta confirmed: a retry after a failed advance must not reopen the popup.
  const connectedRef = useRef(false);

  const connect = async () => {
    if (!connectedRef.current) {
      // Closed, cancelled or failed: stay on the screen (banner already set).
      if ((await signup.start()) !== 'connected') {
        return { ok: true as const, next: window.location.pathname };
      }
      connectedRef.current = true;
      clearChoice();
    }
    return reopened ? REOPEN_EXIT : markSeenAndAdvance('whatsapp', 'completed');
  };

  const label = whatsappPrimaryLabel(choice);
  const primary =
    label === 'connect'
      ? { label: w.connect, onPress: connect }
      : label === 'showGuide'
        ? {
            label: w.showGuide,
            // Keeps the choice so Back from the guide shows it again.
            onPress: async () => ({
              ok: true as const,
              next: WHATSAPP_GUIDE_HREF,
            }),
          }
        : null;

  return (
    <StepShell
      screen="whatsapp"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      leading={
        <div
          aria-hidden="true"
          className="border-line bg-card mb-3 flex size-10 items-center justify-center rounded-[12px] border"
        >
          <WhatsAppMark size={22} />
        </div>
      }
      heading={w.title}
      subheading={w.sub}
      primary={primary}
      skip={{
        label: t.onboarding.flow.later,
        onPress: async () => {
          clearChoice();
          return reopened
            ? REOPEN_EXIT
            : markSeenAndAdvance('whatsapp', 'skipped');
        },
      }}
    >
      {signup.pending ? (
        <SignupPendingPanel onCancel={signup.cancel} className="pt-6" />
      ) : (
        <div className="flex flex-col gap-4">
          {signup.status && <SignupStatusBanner status={signup.status} />}
          <div className="flex flex-col gap-2">
            <p id="wa-choice-label" className="text-[14px] font-medium">
              {w.legend}
            </p>
            <div
              role="radiogroup"
              aria-labelledby="wa-choice-label"
              className="flex flex-col gap-2"
            >
              {WHATSAPP_CHOICES.map((id) => {
                const checked = choice === id;
                return (
                  <label
                    key={id}
                    className={cn(
                      'border-line bg-card relative flex min-h-14 cursor-pointer items-center gap-3 rounded-md border py-2.5 pr-4 pl-4 shadow-[var(--shadow-card)]',
                      'has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/20 has-[:focus-visible]:ring-3',
                      checked &&
                        'border-primary shadow-[0_0_0_1px_var(--primary),var(--shadow-card)]',
                    )}
                  >
                    <input
                      type="radio"
                      name="whatsapp-choice"
                      value={id}
                      checked={checked}
                      onChange={() => setChoice(id)}
                      className="sr-only"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] leading-[1.35] font-semibold tracking-[-0.005em]">
                        {w.choices[id].title}
                      </span>
                      <span className="text-ink-2 block text-[13px] leading-snug">
                        {w.choices[id].sub}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        'bg-card flex size-[22px] flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--neutral-400)] text-[var(--neutral-0)]',
                        checked && 'border-primary bg-primary',
                      )}
                    >
                      {checked && (
                        <Check className="size-3.5" strokeWidth={3} />
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          {choice === 'have' && (
            <AppBanner tone="neutral" icon={Info}>
              {w.metaNote}
            </AppBanner>
          )}
        </div>
      )}
    </StepShell>
  );
}
