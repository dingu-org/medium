'use client';

import { type FormEvent, useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import type { SettingsState } from '../constants';
import { updateProfile } from './actions';

const initialState: SettingsState = {
  error: null,
  success: false,
  fieldErrors: null,
};

export function ProfileForm({ practiceName }: { practiceName: string }) {
  const [state, action, pending] = useActionState(updateProfile, initialState);
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
              defaultValue={practiceName}
              required
            />
            {state.fieldErrors?.practiceName && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.practiceName[0]}
              </p>
            )}
          </div>
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
