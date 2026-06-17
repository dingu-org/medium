import { NotificationBell } from '@/components/notifications/notification-bell';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NotificationView } from '@/lib/notifications/format';
import { SyncIndicator } from './sync-indicator';
import { SignOutMenuItem } from './sign-out-button';

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

export function TopHeader({
  ptId,
  practiceName,
  email,
  unreadCount,
  notifications,
}: {
  ptId: string;
  practiceName: string | null;
  email: string;
  unreadCount: number;
  notifications: NotificationView[];
}) {
  const display = practiceName || email;

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3">
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
          {display}
        </h1>
        <SyncIndicator />
        <NotificationBell
          ptId={ptId}
          unreadCount={unreadCount}
          items={notifications}
        />
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-9 w-9">
              <AvatarFallback>{initials(practiceName, email)}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <SignOutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
