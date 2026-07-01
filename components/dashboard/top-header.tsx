import { NotificationBell } from '@/components/notifications/notification-bell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import type { NotificationView } from '@/lib/notifications/format';
import { SyncIndicator } from './sync-indicator';
import { SignOutMenuItem } from './sign-out-button';

export function TopHeader({
  title,
  ptId,
  practiceName,
  email,
  unreadCount,
  notifications,
}: {
  title: string;
  ptId: string;
  practiceName: string | null;
  email: string;
  unreadCount: number;
  notifications: NotificationView[];
}) {
  return (
    <header className="border-border bg-card sticky top-0 z-10 border-b">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3">
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">
          {title}
        </h1>
        <SyncIndicator />
        <NotificationBell
          ptId={ptId}
          unreadCount={unreadCount}
          items={notifications}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Hap menunë e llogarisë"
            className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
          >
            <InitialsAvatar name={practiceName} fallback={email} size={36} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-muted-foreground truncate text-xs font-normal">
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
