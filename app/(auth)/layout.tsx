import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/20 flex min-h-screen flex-col px-4 py-8">
      <main className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="text-muted-foreground mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy policy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms of service
        </Link>
      </footer>
    </div>
  );
}
