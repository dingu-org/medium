'use client';

import { useEffect, type RefObject } from 'react';

/**
 * iOS Safari does not shrink the layout viewport when the keyboard opens, so a
 * fixed bottom bar would sit under it. This follows `visualViewport` and
 * publishes its height and offset as `--ob-vvh` / `--ob-vvtop` on the shell
 * root; unset, the shell falls back to `100dvh` / `0`.
 */
export function useVisualViewport(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = ref.current;
    if (!viewport || !root) return;
    const sync = () => {
      root.style.setProperty('--ob-vvh', `${viewport.height}px`);
      root.style.setProperty('--ob-vvtop', `${viewport.offsetTop}px`);
    };
    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, [ref]);
}
