'use client';

import { useOnlineStatus } from '@/lib/hooks/realtime';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Small online/offline dot in the top bar. */
export function SyncIndicator() {
  const online = useOnlineStatus();
  return (
    <span
      className="flex items-center gap-2 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          online ? 'bg-emerald-500' : 'bg-amber-500',
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{online ? t.sync.online : t.sync.offline}</span>
    </span>
  );
}
