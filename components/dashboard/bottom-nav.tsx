'use client';

import { Calendar, MessageSquare, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function BottomNav() {
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
    <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-background">
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => {
          const displayPathname = pendingHref ?? pathname;
          const current = pathname === href || pathname.startsWith(`${href}/`);
          const active =
            displayPathname === href || displayPathname.startsWith(`${href}/`);
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
                  'flex flex-col items-center gap-1 px-2 py-2 text-xs',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                aria-current={current ? 'page' : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
