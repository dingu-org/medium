import type { ReactNode } from 'react';
import Link from 'next/link';
import { t } from '@/lib/i18n';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white px-5 py-8">
      <header className="text-center">
        <Link
          href="/"
          className="font-heading text-primary text-xl font-semibold"
        >
          Medium
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="text-muted-foreground mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
        <Link href="/privacy" className="hover:text-foreground">
          {t.auth.layout.privacyPolicy}
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          {t.auth.layout.termsOfService}
        </Link>
      </footer>
    </div>
  );
}
