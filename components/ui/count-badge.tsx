import { cn } from '@/lib/utils';

/** Small count pill (MT Count) — unread counts and tab badges. */
export function CountBadge({
  n,
  tone = 'brand',
  className,
}: {
  n: number;
  tone?: 'brand' | 'amber' | 'red';
  className?: string;
}) {
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[11px] font-semibold text-white tabular-nums',
        tone === 'brand' && 'bg-primary',
        tone === 'amber' && 'bg-[var(--warning-500)]',
        tone === 'red' && 'bg-destructive',
        className,
      )}
    >
      {n}
    </span>
  );
}
