'use client';

import { Clock } from 'lucide-react';
import { StepShell } from '@/components/onboarding/step-shell';
import { LogoMark } from '@/components/ui/logo-mark';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import { markSeenAndAdvance } from '../actions';

export function HowItWorksStep({
  accountId,
  progress,
  backHref,
}: ScreenContext) {
  const h = t.onboarding.howItWorks;
  return (
    <StepShell
      screen="intro"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      align="center"
      leading={
        <div className="mb-3 flex flex-col items-center gap-3">
          <LogoMark size={48} />
          <p className="font-heading text-[20px] leading-tight font-bold tracking-[-0.025em]">
            {t.appName}
          </p>
        </div>
      }
      heading={h.title}
      primary={{
        label: t.onboarding.start,
        onPress: () => markSeenAndAdvance('intro', 'completed'),
      }}
    >
      <div className="mt-3 flex flex-col gap-7 text-left">
        {/* Explicit role: WebKit drops list semantics once list-style is none. */}
        <ol
          role="list"
          className="border-line bg-card divide-sep divide-y overflow-hidden rounded-lg border shadow-[var(--shadow-card)]"
        >
          {h.steps.map((line, i) => (
            <li key={line} className="flex items-center gap-3.5 p-4">
              <span
                aria-hidden
                className="flex size-8 flex-none items-center justify-center rounded-full bg-[var(--brand-50)] text-[14px] font-bold text-[var(--brand-600)] tabular-nums"
              >
                {i + 1}
              </span>
              <span className="min-w-0 text-[15.5px] leading-[1.4] font-medium tracking-[-0.01em]">
                {line}
              </span>
            </li>
          ))}
        </ol>
        <div className="bg-muted text-muted-foreground flex items-start gap-2.5 rounded-md px-4 py-3 text-[14px] leading-snug">
          <Clock className="mt-0.5 size-4 flex-none" aria-hidden />
          <p>{h.timeNote}</p>
        </div>
      </div>
    </StepShell>
  );
}
