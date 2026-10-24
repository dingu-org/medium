import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';

// Android Chrome: resize the layout (not just the visual viewport) when the
// keyboard opens, so the fixed bottom bar stays above it. iOS Safari ignores
// this; the shell follows `visualViewport` there instead.
export const viewport: Viewport = { interactiveWidget: 'resizes-content' };

/** Data access lives in each page (`enterScreen`), not here. */
export default function FlowLayout({ children }: { children: ReactNode }) {
  // The Toaster carries the WhatsApp signup's offline / HTTPS / success toasts.
  return (
    <div className="bg-background">
      {children}
      <Toaster />
    </div>
  );
}
