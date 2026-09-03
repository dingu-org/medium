'use client';

import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { t } from '@/lib/i18n';
import {
  getPushPermissionState,
  isPushSubscribed,
  type PushPermissionState,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/pwa/push-client';

/** UA-derived, honest device label — we don't know an owner nickname. */
function describeDevice(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return t.settings.pushDeviceGeneric;
}

export function DevicePushCard() {
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<string>(t.settings.pushDeviceGeneric);
  const online = useOnlineStatus();

  useEffect(() => {
    setPermission(getPushPermissionState());
    // Client-only reads → avoids SSR hydration mismatch.
    setDevice(describeDevice(navigator.userAgent));
    isPushSubscribed()
      .then(setSubscribed)
      .catch(() => setSubscribed(false));
  }, []);

  const blocked = permission === 'denied' || permission === 'unsupported';

  async function onToggle(next: boolean) {
    setSubscribed(next); // optimistic
    setBusy(true);
    try {
      if (next) {
        const result = await subscribeToPush();
        setPermission(result);
        if (result === 'granted') {
          toast.success(t.settings.pushEnabledToast);
        } else {
          setSubscribed(false); // revert
          if (result === 'denied') toast.error(t.settings.pushBlockedToast);
        }
      } else {
        await unsubscribeFromPush({ optOut: true });
        toast.success(t.settings.pushDisabledToast);
      }
    } catch {
      setSubscribed(!next); // revert
      toast.error(t.settings.pushErrorToast);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="border-line flex items-center gap-3 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)]">
        <span
          className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--brand-50)]"
          aria-hidden="true"
        >
          <Bell className="h-5 w-5 text-[var(--brand-600)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-foreground">
            {t.settings.pushCardTitle}
          </span>
          <span className="mt-1 block truncate text-[12.5px] text-ink-3">
            {device}
          </span>
        </span>
        <Switch
          checked={subscribed}
          disabled={busy || !online || blocked}
          aria-label={t.settings.pushCardTitle}
          onCheckedChange={onToggle}
        />
      </div>
      {permission === 'unsupported' && (
        <p className="px-2 text-[12.5px] leading-relaxed text-ink-3">
          {t.settings.pushUnsupported}
        </p>
      )}
      {permission === 'denied' && (
        <p className="px-2 text-[12.5px] leading-relaxed text-destructive">
          {t.settings.pushBlocked}
        </p>
      )}
    </div>
  );
}
