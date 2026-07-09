import type { ReactNode } from 'react';

/** Centered mono system line inside a thread (MT CSys). */
export function ChatSysLine({ children }: { children: ReactNode }) {
  return (
    <p className="text-ink-3 py-1 text-center font-mono text-[11px] leading-normal">
      {children}
    </p>
  );
}
