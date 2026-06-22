'use client';

import { type FormEvent, useActionState, useEffect, useMemo, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { updateSettings } from './actions';
import {
  NOTIFICATION_PREF_KEYS,
  type NotificationPrefs,
  RETENTION_OPTIONS,
  type SettingsState,
} from './constants';

const PREF_LABELS: Record<keyof NotificationPrefs, string> = {
  booking: t.settings.notifNewBookings,
  cancellation: t.settings.notifCancellations,
  reschedule: t.settings.notifReschedules,
  escalation: t.settings.notifEscalations,
  reminderFailure: t.settings.notifReminderFailure,
};

const initialState: SettingsState = {
  error: null,
  success: false,
  fieldErrors: null,
};

type Props = {
  practiceName: string;
  timezone: string;
  aiName: string;
  aiGreeting: string;
  aiEscalationKeyword: string;
  retentionDays: number;
  notificationPrefs: NotificationPrefs;
};

function useTimezones(current: string): string[] {
  return useMemo(() => {
    let zones: string[] = [];
    try {
      const supported = (
        Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
      ).supportedValuesOf;
      if (supported) zones = supported('timeZone');
    } catch {
      zones = [];
    }
    if (zones.length === 0) {
      zones = ['UTC', 'Europe/Berlin', 'Europe/London', current];
    }
    if (!zones.includes(current)) zones = [current, ...zones];
    return zones;
  }, [current]);
}

export function PracticeSettingsForm(props: Props) {
  const [state, action, pending] = useActionState(updateSettings, initialState);
  const [timezone, setTimezone] = useState(props.timezone);
  const [retentionDays, setRetentionDays] = useState(String(props.retentionDays));
  const [prefs, setPrefs] = useState<NotificationPrefs>(props.notificationPrefs);
  const online = useOnlineStatus();
  const timezones = useTimezones(props.timezone);

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
      {/* Hidden inputs carry the controlled Select/Checkbox values into FormData. */}
      <input type="hidden" name="timezone" value={timezone} />
      <input type="hidden" name="retentionDays" value={retentionDays} />
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
          <CardTitle>{t.settings.practiceCard}</CardTitle>
          <CardDescription>{t.settings.practiceCardSub}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="practiceName">{t.settings.practiceName}</Label>
            <Input
              id="practiceName"
              name="practiceName"
              defaultValue={props.practiceName}
              required
            />
            {state.fieldErrors?.practiceName && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.practiceName[0]}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">{t.settings.timezone}</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.fieldErrors?.timezone && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.timezone[0]}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.aiCard}</CardTitle>
          <CardDescription>{t.settings.aiCardSub}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="aiName">{t.settings.aiNameLabel}</Label>
            <Input
              id="aiName"
              name="aiName"
              defaultValue={props.aiName}
              placeholder="p.sh. Mia"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aiGreeting">{t.settings.aiGreetingLabel}</Label>
            <Textarea
              id="aiGreeting"
              name="aiGreeting"
              defaultValue={props.aiGreeting}
              rows={3}
              placeholder={t.settings.aiGreetingPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aiEscalationKeyword">{t.settings.aiEscalationLabel}</Label>
            <Input
              id="aiEscalationKeyword"
              name="aiEscalationKeyword"
              defaultValue={props.aiEscalationKeyword}
              placeholder={t.ops.help}
            />
            <p className="text-xs text-muted-foreground">
              {t.settings.aiEscalationHint}
            </p>
          </div>
        </CardContent>
      </Card>

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
          <p className="text-xs text-muted-foreground">
            {t.settings.emailComingSoon}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.retention}</CardTitle>
          <CardDescription>{t.settings.retentionCardSub}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={retentionDays} onValueChange={setRetentionDays}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETENTION_OPTIONS.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {t.settings.retentionDays(days)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
