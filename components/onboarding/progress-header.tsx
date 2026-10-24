'use client';

import { ChevronLeft } from 'lucide-react';
import { useTransition } from 'react';
import { signOut } from '@/lib/auth/actions';
import { t } from '@/lib/i18n';
import type { FlowProgress } from '@/lib/onboarding/flow';
import { clearPwaData } from '@/lib/pwa/client-store';
import { unsubscribeFromPush } from '@/lib/pwa/push-client';
import { cn } from '@/lib/utils';
import { RoundButton } from '@/components/ui/round-button';
import { clearAllOnboardingStorage } from './use-step-draft';

/** Back (only when there is a step to go back to), progress, and sign out. */
export function ProgressHeader({
  progress,
  showBack,
  onBack,
}: {
  /** `null`: Back and sign out only (no progress is true to show). */
  progress: FlowProgress | null;
  showBack: boolean;
  onBack: () => void;
}) {
  const [signingOut, startTransition] = useTransition();
  const f = t.onboarding.flow;
  const position =
    progress === null
      ? 0
      : progress.kind === 'complete'
        ? progress.total
        : progress.position;
  const label =
    progress === null
      ? ''
      : progress.kind === 'complete'
        ? f.done
        : f.stepOf(position, progress.total);

  return (
    <header className="bg-background flex h-[60px] flex-none items-center gap-3 px-4 py-2">
      {showBack && (
        <RoundButton aria-label={f.back} onClick={onBack}>
          <ChevronLeft aria-hidden />
        </RoundButton>
      )}
      {progress === null ? (
        <div className="flex-1" />
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div
            role="progressbar"
            aria-label={f.progressLabel}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={position}
            aria-valuetext={label}
            className="flex flex-1 gap-1"
          >
            {Array.from({ length: progress.total }, (_, index) => (
              <span
                key={index}
                data-filled={index < position}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  index < position
                    ? 'bg-foreground'
                    : 'bg-[var(--neutral-200)]',
                )}
              />
            ))}
          </div>
          <span
            aria-hidden
            className="text-ink-2 min-w-0 truncate text-[13px] font-semibold tabular-nums"
          >
            {label}
          </span>
        </div>
      )}
      <button
        type="button"
        aria-label={f.signOutLabel}
        aria-busy={signingOut}
        className="text-ink-2 hover:bg-muted focus-visible:ring-ring/20 h-11 min-w-11 flex-none rounded-full px-2 text-[15px] font-semibold tracking-[-0.01em] outline-none focus-visible:ring-3"
        onClick={() => {
          startTransition(async () => {
            // Same order as the dashboard menu: revoke push while the session
            // is valid, then drop local data (and any unsaved step drafts).
            await unsubscribeFromPush().catch(() => undefined);
            await clearPwaData().catch(() => undefined);
            clearAllOnboardingStorage();
            await signOut();
          });
        }}
      >
        {f.signOut}
      </button>
    </header>
  );
}
