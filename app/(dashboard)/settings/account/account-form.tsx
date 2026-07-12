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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { RETENTION_OPTIONS, type SettingsState } from '../constants';
import { updateAccountPrefs } from './actions';

const initialState: SettingsState = {
  error: null,
  success: false,
  fieldErrors: null,
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

export function AccountForm({
  timezone: initialTimezone,
  retentionDays: initialRetentionDays,
}: {
  timezone: string;
  retentionDays: number;
}) {
  const [state, action, pending] = useActionState(
    updateAccountPrefs,
    initialState,
  );
  const [timezone, setTimezone] = useState(initialTimezone);
  const [retentionDays, setRetentionDays] = useState(
    String(initialRetentionDays),
  );
  const online = useOnlineStatus();
  const timezones = useTimezones(initialTimezone);

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
      {/* Hidden inputs carry the controlled Select values into FormData. */}
      <input type="hidden" name="timezone" value={timezone} />
      <input type="hidden" name="retentionDays" value={retentionDays} />

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.timezone}</CardTitle>
        </CardHeader>
        <CardContent>
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
            <p className="mt-2 text-sm text-destructive">
              {state.fieldErrors.timezone[0]}
            </p>
          )}
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
