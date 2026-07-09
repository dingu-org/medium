'use client';

import {
  AlertTriangle,
  Bell,
  CalendarPlus,
  Check,
  Repeat,
  Unplug,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { EmptyState } from '@/components/states';
import { RoundButton } from '@/components/ui/round-button';
import { SectionLabel } from '@/components/ui/section-label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { t } from '@/lib/i18n';
import { useRealtimeRefresh } from '@/lib/hooks/realtime';
import { formatRelativeShort } from '@/lib/i18n/datetime';
import type { NotificationView } from '@/lib/notifications/format';
import { cn } from '@/lib/utils';
import { markAllNotificationsRead } from './actions';

const ICONS = {
  'calendar-plus': CalendarPlus,
  check: Check,
  x: X,
  repeat: Repeat,
  alert: AlertTriangle,
  unplug: Unplug,
} as const;

// Canvas FEED_ICON: tinted 34px circles per notification kind.
const ICON_TINTS: Record<NotificationView['icon'], string> = {
  'calendar-plus': 'bg-[var(--brand-50)] text-primary',
  check: 'bg-[var(--success-50)] text-[var(--success-500)]',
  x: 'bg-[var(--danger-50)] text-destructive',
  repeat: 'bg-[var(--warning-50)] text-[var(--warning-500)]',
  alert: 'bg-[var(--danger-50)] text-destructive',
  unplug: 'bg-[var(--danger-50)] text-destructive',
};

export function NotificationBell({
  ptId,
  unreadCount,
  items,
}: {
  ptId: string;
  unreadCount: number;
  items: NotificationView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // New events for this PT refresh the layout so the badge + feed stay current.
  useRealtimeRefresh('events', `pt_id=eq.${ptId}`);

  function markRead() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <RoundButton
          dot={unreadCount > 0}
          aria-label={
            unreadCount > 0
              ? t.notifications.unread(unreadCount)
              : t.notifications.title
          }
        >
          <Bell className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
        </RoundButton>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{t.notifications.title}</SheetTitle>
          <SheetDescription className="sr-only">
            {t.notifications.recentActivity}
          </SheetDescription>
        </SheetHeader>

        {items.length > 0 && (
          <div className="flex justify-end px-4 pb-2">
            <button
              type="button"
              onClick={markRead}
              disabled={pending || unreadCount === 0}
              className="text-primary text-[13px] font-semibold disabled:opacity-40"
            >
              {t.notifications.markAllRead}
            </button>
          </div>
        )}

        <ScrollArea className="flex-1 px-4 pb-6">
          {items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={t.notifications.empty}
              description={t.notifications.emptyDescription}
              className="mt-6"
            />
          ) : (
            <div className="space-y-5">
              {/* The first `unreadCount` items are past the read watermark. */}
              <FeedGroup
                title={t.notifications.groupNew}
                items={items.slice(0, unreadCount)}
                unread
                onOpen={go}
              />
              <FeedGroup
                title={t.notifications.groupEarlier}
                items={items.slice(unreadCount)}
                onOpen={go}
              />
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

/** Grouped feed section (canvas FeedScreen Group + FeedRow). */
function FeedGroup({
  title,
  items,
  unread = false,
  onOpen,
}: {
  title: string;
  items: NotificationView[];
  unread?: boolean;
  onOpen: (href: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <div className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-card)] [&>*+*]:border-t [&>*+*]:border-sep">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.href)}
              className={cn(
                'hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-[13px] text-left transition-colors',
                unread && 'bg-[#fbfcfe]',
              )}
            >
              <span
                className={cn(
                  'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full',
                  ICON_TINTS[item.icon],
                )}
              >
                <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-sm leading-snug',
                    unread ? 'font-semibold' : 'font-medium',
                  )}
                >
                  {item.title}
                </span>
                <span className="text-ink-3 mt-0.5 block font-mono text-xs">
                  {formatRelativeShort(new Date(item.occurredAt))}
                </span>
              </span>
              {unread && (
                <span
                  className="bg-primary h-2 w-2 shrink-0 rounded-full"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
