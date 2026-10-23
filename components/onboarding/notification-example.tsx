import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** One sample notification (canvas 7a): shows what the user will receive. */
export function NotificationExample({
  icon,
  app,
  time,
  title,
  body,
  muted = false,
}: {
  icon: ReactNode;
  app: string;
  time: string;
  title: string;
  body: string;
  /** The second, older card: neutral tile, inset, lighter shadow. */
  muted?: boolean;
}) {
  return (
    <li
      className={cn(
        'border-line bg-card flex items-start gap-3 rounded-md border px-3.5 py-3 text-left',
        muted
          ? 'mx-2.5 shadow-[var(--shadow-card)]'
          : 'shadow-[var(--shadow-popover)]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-9 flex-none items-center justify-center rounded-[10px] [&_svg]:size-[18px]',
          muted
            ? 'bg-[var(--neutral-100)] text-[var(--neutral-600)]'
            : 'bg-[var(--brand-50)] text-[var(--brand-600)]',
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-ink-2 flex justify-between text-[12px] leading-[1.4]">
          <span className="font-semibold">{app}</span>
          <span>{time}</span>
        </span>
        <span className="text-[14.5px] leading-[1.35] font-semibold">
          {title}
        </span>
        <span className="text-ink-2 text-[13.5px] leading-[1.4]">{body}</span>
      </span>
    </li>
  );
}
