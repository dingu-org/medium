'use client';

import { Calendar, Home, MessageSquare, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const items = [
  { href: '/today', label: t.nav.today, icon: Home },
  { href: '/calendar', label: t.nav.calendar, icon: Calendar },
  { href: '/chat', label: t.nav.chats, icon: MessageSquare, badge: true },
  { href: '/clients', label: t.nav.clients, icon: Users },
  { href: '/settings', label: t.nav.you, icon: Settings },
];

/** Floating black pill dock (MT Tabs): icon-only circular targets. */
export function BottomNav({
  unreadChats = false,
}: {
  unreadChats?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
    for (const item of items) {
      if (item.href !== pathname) router.prefetch(item.href);
    }
  }, [pathname, router]);

  function prefetch(href: string) {
    if (href !== pathname) router.prefetch(href);
  }

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-10 px-3.5 account-2 pb-[max(16px,env(safe-area-inset-bottom))]">
      <ul className="mx-auto flex max-w-md items-center justify-between rounded-full bg-dock p-1.5 shadow-[var(--shadow-dock)]">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const displayPathname = pendingHref ?? pathname;
          const current = pathname === href || pathname.startsWith(`${href}/`);
          const active =
            displayPathname === href || displayPathname.startsWith(`${href}/`);
          const showDot = Boolean(badge) && unreadChats && !active;
          return (
            <li key={href}>
              <Link
                href={href}
                prefetch={true}
                aria-label={label}
                onFocus={() => prefetch(href)}
                onMouseEnter={() => prefetch(href)}
                onTouchStart={() => prefetch(href)}
                onNavigate={() => {
                  if (!active) setPendingHref(href);
                }}
                className={cn(
                  'relative flex h-[52px] w-[52px] items-center justify-center rounded-full transition-colors',
                  active
                    ? 'bg-primary text-white'
                    : 'text-white/[0.66] hover:text-white',
                )}
                aria-current={current ? 'page' : undefined}
              >
                <Icon
                  className="h-[22px] w-[22px]"
                  strokeWidth={active ? 1.9 : 1.6}
                  aria-hidden
                />
                {showDot && (
                  <span
                    className="absolute top-[11px] right-[11px] h-[7px] w-[7px] rounded-full border-2 border-dock bg-primary"
                    aria-hidden="true"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
