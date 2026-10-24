'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NotificationsPromptCard } from '@/components/onboarding/notifications-prompt-card';
import { StepShell } from '@/components/onboarding/step-shell';
import { useNotificationsPrompt } from '@/components/onboarding/use-notifications-prompt';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';
import { t } from '@/lib/i18n';
import { screenHref } from '@/lib/onboarding/flow';
import type { ScreenContext } from '@/lib/onboarding/guard';
import type { StepActionResult } from '@/lib/onboarding/step-result';
import type { PushPermissionState } from '@/lib/pwa/push-client';
import { goToDashboard } from '../actions';

const fin = t.onboarding.finish;
const n = t.onboarding.notifications;
const f = t.onboarding.flow;

/** "Stay on this screen": the shell refreshes and stops pending. */
const STAY = { ok: true, next: screenHref('finish') } as const;

/**
 * The two tap handlers of the notifications prompt, split out so the order is
 * testable: `enable()` must be the very first statement of `onEnable` (the
 * system prompt needs the tap's user activation; iOS standalone loses it
 * across any await).
 */
export function makeFinishHandlers({
  enable,
  dismiss,
  setAnswered,
  onGranted,
}: {
  enable: () => Promise<PushPermissionState>;
  dismiss: () => void;
  setAnswered: (answered: boolean) => void;
  onGranted?: () => void;
}) {
  const onEnable = (): Promise<StepActionResult> => {
    const pending = enable();
    return pending.then((state) => {
      if (state !== 'default') setAnswered(true);
      if (state === 'granted') onGranted?.();
      return STAY;
    });
  };
  const onNotNow = (): Promise<StepActionResult> => {
    dismiss();
    setAnswered(true);
    return Promise.resolve(STAY);
  };
  return { onEnable, onNotNow };
}

function SuccessDisc() {
  return (
    <div
      aria-hidden="true"
      className="mb-2 flex size-[72px] items-center justify-center rounded-full bg-[var(--success-50)] text-[var(--success-600)]"
    >
      <Check className="size-8" strokeWidth={2.4} />
    </div>
  );
}

/** The remaining step, stated plainly (canvas 8b/8d): no link, no button. */
function WhatsappStepCard() {
  return (
    <div className="border-line bg-card flex items-center gap-3 rounded-lg border p-3.5 shadow-[var(--shadow-card)]">
      <div className="border-line bg-card flex size-10 flex-none items-center justify-center rounded-[12px] border">
        <WhatsAppMark size={22} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-[15px] font-semibold tracking-[-0.005em]">
          {fin.whatsappCardTitle}
        </p>
        <p className="text-ink-2 text-[13.5px] leading-snug">
          {fin.whatsappCardBody}
        </p>
      </div>
    </div>
  );
}

/** Renders one of the four Finish variants (8a to 8d); no hooks. */
export function FinishStepView({
  accountId,
  progress,
  whatsappConnected,
  promptOffered,
  onEnable,
  onNotNow,
}: ScreenContext & {
  whatsappConnected: boolean;
  promptOffered: boolean;
  onEnable: () => Promise<StepActionResult>;
  onNotNow: () => Promise<StepActionResult>;
}) {
  const showCards = !whatsappConnected || promptOffered;
  return (
    <StepShell
      screen="finish"
      progress={progress}
      backHref={null}
      accountId={accountId}
      align="center"
      leading={<SuccessDisc />}
      heading={whatsappConnected ? fin.readyTitle : fin.oneLeftTitle}
      subheading={whatsappConnected ? fin.readySub : fin.oneLeftSub}
      primary={
        promptOffered
          ? { label: n.enable, onPress: onEnable }
          : { label: f.goToApp, onPress: () => goToDashboard() }
      }
      skip={promptOffered ? { label: f.notNow, onPress: onNotNow } : undefined}
    >
      {showCards ? (
        <div className="flex w-full flex-col gap-3 text-left">
          {!whatsappConnected && <WhatsappStepCard />}
          {promptOffered && <NotificationsPromptCard />}
        </div>
      ) : null}
    </StepShell>
  );
}

export function FinishStep(
  ctx: ScreenContext & { whatsappConnected: boolean },
) {
  const { offered, enable, dismiss } = useNotificationsPrompt(ctx.accountId);
  const [answered, setAnswered] = useState(false);
  const { onEnable, onNotNow } = makeFinishHandlers({
    enable,
    dismiss,
    setAnswered,
    onGranted: () => toast.success(t.settings.pushEnabledToast),
  });
  return (
    <FinishStepView
      {...ctx}
      promptOffered={offered === true && !answered}
      onEnable={onEnable}
      onNotNow={onNotNow}
    />
  );
}
