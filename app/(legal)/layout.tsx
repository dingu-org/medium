import type { ReactNode } from 'react';
import Link from 'next/link';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="bg-background border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="font-heading text-base font-medium">
            Medium
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/privacy"
              className="text-muted-foreground hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-muted-foreground hover:text-foreground"
            >
              Terms
            </Link>
            <Link
              href="/sign-in"
              className="text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">{children}</main>
      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm">
          <span>Copyright 2026 Medium</span>
          <span>Contact: klaididingu@gmail.com</span>
        </div>
      </footer>
    </div>
  );
}
