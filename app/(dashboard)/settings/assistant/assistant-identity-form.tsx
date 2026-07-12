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
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import type { SettingsState } from '../constants';
import { updateAssistantIdentity } from './actions';

const initialState: SettingsState = {
  error: null,
  success: false,
  fieldErrors: null,
};

export function AssistantIdentityForm({
  aiName,
  aiGreeting,
  aiEscalationKeyword,
}: {
  aiName: string;
  aiGreeting: string;
  aiEscalationKeyword: string;
}) {
  const [state, action, pending] = useActionState(
    updateAssistantIdentity,
    initialState,
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
              defaultValue={aiName}
              placeholder="p.sh. Mia"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aiGreeting">{t.settings.aiGreetingLabel}</Label>
            <Textarea
              id="aiGreeting"
              name="aiGreeting"
              defaultValue={aiGreeting}
              rows={3}
              placeholder={t.settings.aiGreetingPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aiEscalationKeyword">
              {t.settings.aiEscalationLabel}
            </Label>
            <Input
              id="aiEscalationKeyword"
              name="aiEscalationKeyword"
              defaultValue={aiEscalationKeyword}
              placeholder={t.ops.help}
            />
            <p className="text-xs text-muted-foreground">
              {t.settings.aiEscalationHint}
            </p>
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
