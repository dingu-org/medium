import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type HandledByWho = 'ai' | 'you' | 'closed' | 'paused';

const map: Record<HandledByWho, { dot: string; label: string }> = {
  ai: { dot: 'bg-primary', label: t.chat.aiBadge },
  you: { dot: 'bg-[var(--success-500)]', label: t.chat.youBadge },
  closed: { dot: 'bg-ink-3', label: t.chat.closedBadge },
  paused: { dot: 'bg-[var(--warning-500)]', label: t.chat.pausedBadge },
};

/** Who-is-handling chip: calm dot + label (MT HandledBy). */
export function HandledBy({
  who,
  className,
}: {
  who: HandledByWho;
  className?: string;
}) {
  const m = map[who];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-xs font-semibold',
        who === 'ai' && 'text-primary',
        who === 'you' && 'text-[var(--success-500)]',
        who === 'closed' && 'text-ink-3',
        who === 'paused' && 'text-[var(--warning-500)]',
        className,
      )}
    >
      <span
        className={cn('h-[7px] w-[7px] rounded-full', m.dot)}
        aria-hidden="true"
      />
      {m.label}
    </span>
  );
}
