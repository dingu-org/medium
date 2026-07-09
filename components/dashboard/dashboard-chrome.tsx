'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
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
