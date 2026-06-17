'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
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
import { updateSettings } from './actions';
import {
  NOTIFICATION_PREF_KEYS,
  type NotificationPrefs,
  RETENTION_OPTIONS,
  type SettingsState,
} from './constants';

const PREF_LABELS: Record<keyof NotificationPrefs, string> = {
  booking: 'New bookings',
  cancellation: 'Cancellations',
  reschedule: 'Reschedules',
  escalation: 'Patient asks for you (escalation)',
  reminderFailure: 'Reminder failures',
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
  const timezones = useTimezones(props.timezone);

  useEffect(() => {
    if (state.success) toast.success('Settings saved.');
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-4">
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
          <CardTitle>Practice</CardTitle>
          <CardDescription>Your practice name and timezone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="practiceName">Practice name</Label>
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
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone" className="w-full">
                <SelectValue placeholder="Select timezone" />
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
          <CardTitle>AI assistant</CardTitle>
          <CardDescription>
            How the assistant introduces itself and when it hands off to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="aiName">Assistant name</Label>
            <Input
              id="aiName"
              name="aiName"
              defaultValue={props.aiName}
              placeholder="e.g. Mia"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aiGreeting">Greeting message</Label>
            <Textarea
              id="aiGreeting"
              name="aiGreeting"
              defaultValue={props.aiGreeting}
              rows={3}
              placeholder="Hi! Thanks for messaging…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aiEscalationKeyword">Escalation keyword</Label>
            <Input
              id="aiEscalationKeyword"
              name="aiEscalationKeyword"
              defaultValue={props.aiEscalationKeyword}
              placeholder="HELP"
            />
            <p className="text-xs text-muted-foreground">
              When a patient sends this word, the AI hands the chat to you.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Which events send you a push notification.
          </CardDescription>
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
            Email notifications — coming soon.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data retention</CardTitle>
          <CardDescription>
            How long patient messages and history are kept.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={retentionDays} onValueChange={setRetentionDays}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETENTION_OPTIONS.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {days} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}
