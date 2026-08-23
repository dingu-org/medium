import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/ui/logo-mark';
import { t } from '@/lib/i18n';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-white px-4 py-8">
      {/* Canvas AuthShell: brandTint radial glow at the top. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_-6%,var(--brand-50),rgba(255,255,255,0)_60%)]"
        aria-hidden
      />
      <main className="relative flex flex-1 items-center justify-center">
        <div className="w-full max-w-md">
          <Link href="/" aria-label={t.appName} className="inline-block">
            <LogoMark size={46} />
          </Link>
          {children}
        </div>
      </main>
      <footer className="text-ink-3 relative mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center">
        <Link href="/privacy" className="hover:text-foreground">
          {t.auth.layout.privacyPolicy}
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          {t.auth.layout.termsOfService}
        </Link>
        <Link href="/help" className="hover:text-foreground">
          {t.auth.layout.help}
        </Link>
      </footer>
    </div>
  );
}
