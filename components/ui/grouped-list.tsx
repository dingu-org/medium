import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function GroupedList({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {title && (
        <p className="px-2 text-[11.5px] font-bold tracking-[0.07em] uppercase text-ink-3">
          {title}
        </p>
      )}
      <div className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-card)] [&>*+*]:border-t [&>*+*]:border-sep">
        {children}
      </div>
    </div>
  );
}

export function GroupedListRow({
  icon: Icon,
  leading,
  title,
  description,
  value,
  accessory,
  href,
  onClick,
  danger = false,
  className,
}: {
  icon?: LucideIcon;
  leading?: ReactNode;
  title: string;
  description?: string;
  value?: ReactNode;
  accessory?: ReactNode;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  className?: string;
}) {
  const interactive = Boolean(href || onClick);
  const content = (
    <>
      {leading}
      {Icon && (
        <Icon
          className={cn(
            'h-[19px] w-[19px] shrink-0',
            danger ? 'text-destructive' : 'text-[var(--neutral-500)]',
          )}
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[15px] font-semibold tracking-[-0.005em]',
            danger ? 'text-destructive' : 'text-foreground',
          )}
        >
          {title}
        </span>
        {description && (
          <span className="block truncate text-[13px] text-ink-3">
            {description}
          </span>
        )}
      </span>
      {value && (
        <span className="shrink-0 text-sm text-ink-2 tabular-nums">{value}</span>
      )}
      {accessory}
      {interactive && (
        <ChevronRight className="h-[17px] w-[17px] shrink-0 text-ink-3/70" aria-hidden="true" />
      )}
    </>
  );
  const rowClassName = cn(
    'flex min-h-[46px] w-full items-center gap-3 px-[18px] py-3 text-left',
    interactive && 'transition-colors hover:bg-muted/60',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={rowClassName}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={rowClassName}>
        {content}
      </button>
    );
  }

  return <div className={rowClassName}>{content}</div>;
}
