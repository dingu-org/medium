'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { t } from '@/lib/i18n';
import {
  getPushPermissionState,
  isPushSubscribed,
  type PushPermissionState,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/pwa/push-client';

export function PushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(getPushPermissionState());
    isPushSubscribed()
      .then(setSubscribed)
      .catch(() => setSubscribed(false));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const result = await subscribeToPush();
      setPermission(result);
      if (result === 'granted') {
        setSubscribed(true);
        toast.success(t.settings.pushEnabledToast);
      } else if (result === 'denied') {
        toast.error(t.settings.pushBlockedToast);
      }
    } catch {
      toast.error(t.settings.pushErrorToast);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
      toast.success(t.settings.pushDisabledToast);
    } catch {
      toast.error(t.settings.pushErrorToast);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.pushCardTitle}</CardTitle>
        <CardDescription>{t.settings.pushCardSub}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {permission === 'unsupported' ? (
          <p className="text-muted-foreground text-sm">
            {t.settings.pushUnsupported}
          </p>
        ) : permission === 'denied' ? (
          <p className="text-destructive text-sm">{t.settings.pushBlocked}</p>
        ) : subscribed ? (
          <>
            <p className="text-muted-foreground text-sm">
              {t.settings.pushEnabled}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={disable}
              disabled={busy}
            >
              {t.settings.pushDisable}
            </Button>
          </>
        ) : (
          <Button type="button" onClick={enable} disabled={busy}>
            {t.settings.pushEnable}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
