import { cn } from '@/lib/utils';
import type { StatusPillTone } from './status-pill';

const dotClasses: Record<StatusPillTone, string> = {
  brand: 'bg-primary',
  neutral: 'bg-muted-foreground',
  success: 'bg-[var(--success-500)]',
  warning: 'bg-[var(--warning-500)]',
  danger: 'bg-destructive',
  info: 'bg-[var(--info-500)]',
  attention: 'bg-[var(--attention-500)]',
};

function getInitials(name: string | null | undefined, fallback = '') {
  const source = name?.trim() || fallback.trim();
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function InitialsAvatar({
  name,
  fallback,
  size = 40,
  dotTone,
  className,
}: {
  name?: string | null;
  fallback?: string;
  size?: number;
  dotTone?: StatusPillTone;
  className?: string;
}) {
  const initials = getInitials(name, fallback) || 'M';

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className="inline-flex items-center justify-center rounded-full bg-[var(--brand-50)] font-heading font-bold tracking-[-0.01em] text-[var(--brand-600)]"
        style={{ width: size, height: size, fontSize: Math.max(12, size * 0.34) }}
        aria-hidden="true"
      >
        {initials}
      </span>
      {dotTone && (
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-card',
            dotClasses[dotTone],
          )}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
