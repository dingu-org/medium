'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { RoundButton } from '@/components/ui/round-button';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Pushed-screen nav bar (MT NavBar): white circle back button on the canvas,
 * title absolutely centered with symmetric insets so it stays on the true
 * screen center regardless of the right slot.
 */
export function NavBar({
  title,
  backHref,
  onBack,
  right,
  className,
}: {
  title: string;
  backHref?: string;
  onBack?: () => void;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'relative flex h-16 shrink-0 items-center px-4',
        className,
      )}
    >
      {backHref ? (
        <RoundButton asChild aria-label={t.actions.back}>
          <Link href={backHref}>
            <ChevronLeft className="size-[22px]" strokeWidth={1.9} />
          </Link>
        </RoundButton>
      ) : onBack ? (
        <RoundButton onClick={onBack} aria-label={t.actions.back}>
          <ChevronLeft className="size-[22px]" strokeWidth={1.9} />
        </RoundButton>
      ) : null}
      <div className="pointer-events-none absolute inset-y-0 right-[60px] left-[60px] flex items-center justify-center">
        <span className="truncate font-heading text-[17px] font-bold tracking-[-0.015em] text-foreground">
          {title}
        </span>
      </div>
      <div className="z-[1] ml-auto flex items-center gap-2">{right}</div>
    </header>
  );
}
