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
  accountId,
  name,
  email,
  unreadCount,
  notifications,
  action,
  showAccountMenu = true,
}: {
  title: string;
  accountId: string;
  name: string | null;
  email: string;
  unreadCount: number;
  notifications: NotificationView[];
  action?: React.ReactNode;
  showAccountMenu?: boolean;
}) {
  return (
    <header className="bg-background sticky top-0 z-10">
      <div className="mx-auto flex min-h-[44px] max-w-md items-center justify-between gap-2 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3">
        <h1 className="font-heading min-w-0 flex-1 truncate text-[27px] leading-tight font-bold tracking-[-0.025em]">
          {title}
        </h1>
        <SyncIndicator />
        {action}
        <NotificationBell
          accountId={accountId}
          unreadCount={unreadCount}
          items={notifications}
        />
        {showAccountMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Hap menunë e llogarisë"
              className="focus-visible:ring-ring rounded-full shadow-[var(--shadow-card)] outline-none focus-visible:ring-2"
            >
              <InitialsAvatar name={name} fallback={email} size={44} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1">
              <DropdownMenuLabel className="text-muted-foreground truncate py-2 text-xs font-normal">
                {email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <SignOutMenuItem />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
