'use client';

import { type FormEvent, useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { t } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import {
  NOTIFICATION_PREF_KEYS,
  type NotificationPrefs,
  type SettingsState,
} from '../constants';
import { updateNotificationPrefs } from './actions';

const PREF_LABELS: Record<keyof NotificationPrefs, string> = {
  booking: t.settings.notifNewBookings,
  cancellation: t.settings.notifCancellations,
  reschedule: t.settings.notifReschedules,
  escalation: t.settings.notifEscalations,
  reminderFailure: t.settings.notifReminderFailure,
  connection: t.settings.notifConnection,
  resumeOffer: t.settings.notifResumeOffer,
};

const initialState: SettingsState = {
  error: null,
  success: false,
  fieldErrors: null,
};

export function NotifPrefsForm({
  notificationPrefs,
}: {
  notificationPrefs: NotificationPrefs;
}) {
  const [state, action, pending] = useActionState(
    updateNotificationPrefs,
    initialState,
  );
  const [prefs, setPrefs] = useState<NotificationPrefs>(notificationPrefs);
  const online = useOnlineStatus();

  useEffect(() => {
    if (state.success) toast.success(t.settings.savedToast);
    if (state.error) toast.error(state.error);
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (online) return;
    event.preventDefault();
    toast.error(t.settings.settingsRequireConnection);
  }

  return (
    <form action={action} onSubmit={onSubmit} className="space-y-4">
      {/* Hidden inputs carry the controlled Checkbox values into FormData. */}
      {NOTIFICATION_PREF_KEYS.map((key) => (
        <input
          key={key}
          type="hidden"
          name={`notify_${key}`}
          value={prefs[key] ? 'on' : ''}
        />
      ))}

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.sectionNotifications}</CardTitle>
          <CardDescription>{t.settings.notifCardSub}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {NOTIFICATION_PREF_KEYS.map((key) => (
            <label
              key={key}
              htmlFor={`pref-${key}`}
              className="flex items-center gap-3 text-sm"
            >
              <Checkbox
                id={`pref-${key}`}
                checked={prefs[key]}
                onCheckedChange={(value) =>
                  setPrefs((p) => ({ ...p, [key]: value === true }))
                }
              />
              {PREF_LABELS[key]}
            </label>
          ))}
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" disabled={pending || !online}>
        {pending ? t.actions.saving : t.settings.saveSettings}
      </Button>
      {!online && (
        <p className="text-center text-xs text-muted-foreground">
          {t.settings.requiresConnection}
        </p>
      )}
    </form>
  );
}
