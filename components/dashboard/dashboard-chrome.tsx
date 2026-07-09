'use client';

import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { RoundButton } from '@/components/ui/round-button';
import { t } from '@/lib/i18n';
import type { NotificationView } from '@/lib/notifications/format';
import { cn } from '@/lib/utils';
import { BottomNav } from './bottom-nav';
import { TopHeader } from './top-header';

const TITLES: Record<string, string> = {
  '/today': 'Sot',
  '/calendar': 'Kalendari',
  '/chat': 'Bisedat',
  '/clients': 'Klientët',
  '/settings': 'Ti',
};

export function DashboardChrome({
  children,
  ptId,
  practiceName,
  email,
  notificationCount,
  notifications,
  unreadChats,
}: {
  children: ReactNode;
  ptId: string;
  practiceName: string | null;
  email: string;
  notificationCount: number;
  notifications: NotificationView[];
  unreadChats: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const title = TITLES[pathname];
  const topLevel = Boolean(title);

  // The chat list keeps its ?q= search but hides the field behind the
  // canvas TopBar search button (medium4 chat/chat-list.jsx).
  let action: ReactNode = null;
  if (pathname === '/chat') {
    const params = new URLSearchParams(searchParams);
    const open = params.get('search') === '1';
    if (open) {
      params.delete('search');
      params.delete('q');
    } else {
      params.set('search', '1');
    }
    action = (
      <RoundButton
        asChild
        aria-label={t.chat.searchLabel}
        aria-expanded={open}
      >
        <Link href={`/chat${params.size ? `?${params}` : ''}`} replace>
          <Search className="h-5 w-5" strokeWidth={1.7} aria-hidden />
        </Link>
      </RoundButton>
    );
  } else if (pathname === '/clients') {
    action = (
      <RoundButton asChild aria-label="Shto klient">
        <Link href="/clients/new">
          <Plus className="h-5 w-5" strokeWidth={1.7} aria-hidden />
        </Link>
      </RoundButton>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      {topLevel && (
        <TopHeader
          title={title}
          ptId={ptId}
          practiceName={practiceName}
          email={email}
          unreadCount={notificationCount}
          notifications={notifications}
          action={action}
        />
      )}
      {searchParams.get('from') === 'onboarding' && (
        <div className="bg-[var(--brand-50)] px-4 py-2 text-center text-sm text-[var(--brand-600)]">
          Ruaj ndryshimet, pastaj{' '}
          <Link href="/onboarding" className="font-semibold underline">
            kthehu te konfigurimi
          </Link>
          .
        </div>
      )}
      <main
        className={cn(
          'mx-auto max-w-md px-4',
          topLevel ? 'pt-2 pb-28' : 'pt-4 pb-6',
        )}
      >
        {children}
      </main>
      {topLevel && <BottomNav unreadChats={unreadChats > 0} />}
    </div>
  );
}
