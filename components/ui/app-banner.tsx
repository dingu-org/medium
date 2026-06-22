import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const toneClasses: Record<Tone, string> = {
  info: 'border-[var(--brand-100)] bg-[var(--brand-50)] text-[var(--brand-700)]',
  success:
    'border-[#cfe7d9] bg-[var(--success-50)] text-[var(--success-600)]',
  warning:
    'border-[#f0e0bd] bg-[var(--warning-50)] text-[var(--warning-600)]',
  danger:
    'border-[#f0d0cf] bg-[var(--danger-50)] text-[var(--danger-600)]',
  neutral: 'border-border bg-muted text-muted-foreground',
};

export function AppBanner({
  tone = 'neutral',
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live="polite"
      className={cn(
        'flex items-start gap-2.5 border px-3 py-2 text-sm leading-snug',
        toneClasses[tone],
        className,
      )}
    >
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
