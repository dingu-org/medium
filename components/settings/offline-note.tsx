'use client';

import { WifiOff } from 'lucide-react';
import { AppBanner } from '@/components/ui/app-banner';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { t } from '@/lib/i18n';

/** Shared offline banner for settings screens; renders nothing while online.
 *  Input disabling stays per-form. */
export function OfflineNote() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <AppBanner tone="neutral" icon={WifiOff}>
      {t.settings.offlineNote}
    </AppBanner>
  );
}
