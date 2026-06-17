import type { LucideIcon } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
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
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => `skeleton-${i}`).map((key) => (
        <div
          key={key}
          className="flex items-center gap-3 rounded-lg border border-border p-3"
        >
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
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
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      )}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** Critical-failure fallback ("can't connect to server"). */
export function ErrorState({
  title = "Can't connect to the server",
  description = 'Check your internet connection and try again.',
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
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center',
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
