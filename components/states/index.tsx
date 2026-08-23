import type { LucideIcon } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Skeleton list used while a screen's data loads (Suspense fallback / pending). */
export function LoadingState({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('space-y-3', className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{t.states.loading}</span>
      <div className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-card)] [&>*+*]:border-t [&>*+*]:border-sep">
        {Array.from({ length: rows }, (_, i) => `skeleton-${i}`).map((key) => (
          <div key={key} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2.5 w-3/4" />
            </div>
            <Skeleton className="h-[18px] w-10 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Friendly empty state with an icon, message, and optional call to action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-10 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#ecece7]">
          <Icon className="h-[26px] w-[26px] text-ink-3" aria-hidden="true" />
        </span>
      )}
      <p className="font-heading text-lg font-bold tracking-[-0.02em] text-foreground">
        {title}
      </p>
      {description && (
        <p className="mt-2 max-w-[260px] text-[13.5px] leading-relaxed text-ink-2">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Critical-failure fallback ("can't connect to server"). */
export function ErrorState({
  title = t.states.errorTitle,
  description = t.states.errorDescription,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg bg-[var(--danger-50)] px-6 py-12 text-center',
        className,
      )}
    >
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
