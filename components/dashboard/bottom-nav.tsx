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

export function BottomNav({ unreadChats = false }: { unreadChats?: boolean }) {
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
    <nav className="fixed right-0 bottom-0 left-0 z-10 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const displayPathname = pendingHref ?? pathname;
          const current = pathname === href || pathname.startsWith(`${href}/`);
          const active =
            displayPathname === href || displayPathname.startsWith(`${href}/`);
          const showDot = Boolean(badge) && unreadChats;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                prefetch={true}
                onFocus={() => prefetch(href)}
                onMouseEnter={() => prefetch(href)}
                onTouchStart={() => prefetch(href)}
                onNavigate={() => {
                  if (!active) setPendingHref(href);
                }}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition-colors',
                  active
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-current={current ? 'page' : undefined}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" aria-hidden />
                  {showDot && (
                    <span
                      className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-destructive"
                      aria-hidden
                    />
                  )}
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
