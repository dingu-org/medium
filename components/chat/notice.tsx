import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, { row: string; icon: string; action: string }> = {
  info: {
    row: 'bg-[var(--brand-50)] border-[#d5ddfb] text-[var(--brand-600)]',
    icon: 'text-primary',
    action: 'text-primary',
  },
  success: {
    row: 'bg-[var(--success-50)] border-[#cfe9db] text-[var(--success-600)]',
    icon: 'text-[var(--success-500)]',
    action: 'text-[var(--success-500)]',
  },
  warning: {
    row: 'bg-[var(--warning-50)] border-[#f0e0bd] text-[var(--warning-600)]',
    icon: 'text-[var(--warning-500)]',
    action: 'text-[var(--warning-500)]',
  },
  danger: {
    row: 'bg-[var(--danger-50)] border-[#f0d0cf] text-[var(--danger-600)]',
    icon: 'text-destructive',
    action: 'text-destructive',
  },
};

/**
 * Thin in-thread notice (MT CNotice): escalation reason, pause, offline,
 * closed. A full-width tinted strip with a hairline bottom border — lighter
 * than AppBanner, meant to sit between the status row and the messages.
 */
export function ChatNotice({
  tone = 'warning',
  icon: Icon,
  children,
  action,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const m = tones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex shrink-0 items-start gap-2.5 border-b px-4 py-2.5',
        m.row,
        className,
      )}
    >
      {Icon && (
        <Icon
          className={cn('mt-px h-4 w-4 shrink-0', m.icon)}
          aria-hidden="true"
        />
      )}
      <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
        {children}
      </div>
      {action && (
        <div
          className={cn(
            'shrink-0 text-[12.5px] font-semibold whitespace-nowrap',
            m.action,
          )}
        >
          {action}
        </div>
      )}
    </div>
  );
}
