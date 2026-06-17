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
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useRealtimeRefresh } from '@/lib/hooks/realtime';
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

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60) return fmt.format(Math.round(diffSec), 'second');
  if (abs < 3600) return fmt.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return fmt.format(Math.round(diffSec / 3600), 'hour');
  return fmt.format(Math.round(diffSec / 86_400), 'day');
}

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
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : 'Notifications'
          }
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription className="sr-only">
            Recent activity in your practice
          </SheetDescription>
        </SheetHeader>

        {items.length > 0 && (
          <div className="flex justify-end px-4 pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={markRead}
              disabled={pending || unreadCount === 0}
            >
              Mark all read
            </Button>
          </div>
        )}

        <ScrollArea className="flex-1 px-4 pb-6">
          {items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications yet"
              description="Bookings, cancellations, and alerts will show up here."
              className="mt-6"
            />
          ) : (
            <ul className="space-y-1">
              {items.map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => go(item.href)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted',
                      )}
                    >
                      <span className="mt-0.5 rounded-full bg-muted p-1.5">
                        <Icon
                          className="h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="flex-1 space-y-0.5">
                        <span className="block text-sm">{item.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {relativeTime(item.occurredAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
