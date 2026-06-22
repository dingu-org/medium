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
      {title && <p className="px-1 text-xs font-medium text-muted-foreground">{title}</p>}
      <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-[var(--shadow-card)] [&>*+*]:border-t [&>*+*]:border-border">
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
            'h-[18px] w-[18px] shrink-0',
            danger ? 'text-destructive' : 'text-muted-foreground',
          )}
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm font-medium',
            danger ? 'text-destructive' : 'text-foreground',
          )}
        >
          {title}
        </span>
        {description && (
          <span className="block truncate text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      {value && (
        <span className="shrink-0 text-sm text-muted-foreground">{value}</span>
      )}
      {accessory}
      {interactive && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      )}
    </>
  );
  const rowClassName = cn(
    'flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left',
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
