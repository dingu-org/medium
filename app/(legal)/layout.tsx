import type { ReactNode } from 'react';
import Link from 'next/link';

/** Chrome for the public legal/help pages. The wrapper carries no `lang` — the
 * document is Albanian (`<html lang="sq">` in the root layout) and each page
 * declares its own language on its `<article>` (`lang="sq"` for the canonical
 * Albanian documents and the help articles, `lang="en"` for the English
 * reading copies under `/en`), so the language is per route rather than
 * group-wide. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <header className="bg-background border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 md:px-5">
          <Link href="/" className="font-heading inline-flex min-h-11 items-center text-base font-medium">
            Medium
          </Link>
          <nav className="flex items-center gap-4 text-sm [&>a]:inline-flex [&>a]:min-h-11 [&>a]:min-w-11 [&>a]:items-center [&>a]:justify-center">
            <Link
              href="/privacy"
              className="text-muted-foreground hover:text-foreground"
            >
              Privatësia
            </Link>
            <Link
              href="/terms"
              className="text-muted-foreground hover:text-foreground"
            >
              Kushtet
            </Link>
            <Link
              href="/help"
              className="text-muted-foreground hover:text-foreground"
            >
              Ndihmë
            </Link>
            <Link
              href="/sign-in"
              className="text-muted-foreground hover:text-foreground"
            >
              Hyr
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14 md:px-5">{children}</main>
      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm md:px-5">
          <span>E drejta e autorit 2026 Medium</span>
          <span>Kontakt: klaididingu@gmail.com</span>
        </div>
      </footer>
    </div>
  );
}
