import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatusPillTone =
  | 'brand'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'attention';

const toneClasses: Record<StatusPillTone, string> = {
  brand: 'bg-[var(--brand-50)] text-[var(--brand-700)]',
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-[var(--success-50)] text-[var(--success-600)]',
  warning: 'bg-[var(--warning-50)] text-[var(--warning-600)]',
  danger: 'bg-[var(--danger-50)] text-[var(--danger-600)]',
  info: 'bg-[var(--info-50)] text-[var(--info-500)]',
  attention: 'bg-[var(--attention-50)] text-[var(--attention-600)]',
};

const dotClasses: Record<StatusPillTone, string> = {
  brand: 'bg-primary',
  neutral: 'bg-muted-foreground',
  success: 'bg-[var(--success-500)]',
  warning: 'bg-[var(--warning-500)]',
  danger: 'bg-destructive',
  info: 'bg-[var(--info-500)]',
  attention: 'bg-[var(--attention-500)]',
};

export function StatusPill({
  tone = 'neutral',
  dot = false,
  mono = false,
  children,
  className,
}: {
  tone?: StatusPillTone;
  dot?: boolean;
  mono?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium leading-none',
        mono && 'font-mono text-[10.5px]',
        toneClasses[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClasses[tone])}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}
