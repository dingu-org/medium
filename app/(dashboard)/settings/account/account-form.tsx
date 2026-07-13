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

export function AccountForm({
  retentionDays: initialRetentionDays,
}: {
  retentionDays: number;
}) {
  const [state, action, pending] = useActionState(
    updateAccountPrefs,
    initialState,
  );
  const [retentionDays, setRetentionDays] = useState(
    String(initialRetentionDays),
  );
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
      {/* Hidden input carries the controlled Select value into FormData. */}
      <input type="hidden" name="retentionDays" value={retentionDays} />

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
