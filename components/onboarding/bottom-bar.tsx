import { CircleAlert, Loader2 } from 'lucide-react';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

/**
 * Fixed bottom bar: failure banner, one reason line, the black Continue pill
 * (never disabled), an optional skip link and the helper line.
 */
export function BottomBar({
  primaryLabel,
  skipLabel,
  helper,
  pending,
  failed,
  reason,
  onRetry,
  onSkip,
}: {
  primaryLabel: string | null;
  skipLabel: string | null;
  helper: string;
  pending: boolean;
  failed: boolean;
  reason: string | null;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const f = t.onboarding.flow;
  return (
    <footer className="bg-background border-line flex flex-none flex-col items-stretch border-t px-4 pt-3 pb-[max(8px,env(safe-area-inset-bottom))]">
      {failed && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2.5 rounded-md bg-[var(--danger-50)] py-3 pr-2 pl-4 text-[14px] leading-snug text-[var(--danger-600)]"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="flex-1">
            <strong className="font-bold">{f.saveFailedTitle}</strong>{' '}
            {f.saveFailedBody}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="-my-3 h-11 flex-none px-2 text-[14px] font-bold underline underline-offset-[3px]"
          >
            {f.retry}
          </button>
        </div>
      )}
      <p
        aria-live="polite"
        className={
          reason
            ? 'mb-2.5 flex items-start justify-center gap-1.5 text-center text-[14px] leading-snug font-semibold text-[var(--danger-600)]'
            : 'sr-only'
        }
      >
        {reason && (
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        )}
        <span>{reason}</span>
      </p>
      {primaryLabel && (
        <Button
          type="submit"
          variant="dark"
          aria-busy={pending}
          className="w-full"
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          <span>{primaryLabel}</span>
        </Button>
      )}
      {skipLabel && (
        <button
          type="button"
          onClick={onSkip}
          className="text-foreground focus-visible:ring-ring/20 mt-1 h-11 self-center rounded-full px-3 text-[15px] font-semibold tracking-[-0.01em] underline decoration-[var(--neutral-300)] underline-offset-4 outline-none focus-visible:ring-3"
        >
          {skipLabel}
        </button>
      )}
      <p className="text-ink-2 mt-2 text-center text-[12.5px] leading-normal">
        {pending ? f.saving : helper}
      </p>
    </footer>
  );
}
