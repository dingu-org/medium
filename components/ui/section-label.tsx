import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Uppercase eyebrow above an inset-list card (MT SectionLabel). */
export function SectionLabel({
  danger = false,
  children,
  className,
}: {
  danger?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'px-4 pb-2 text-[11.5px] font-bold tracking-[0.07em] uppercase',
        danger ? 'text-[var(--danger-600)]' : 'text-ink-3',
        className,
      )}
    >
      {children}
    </p>
  );
}
