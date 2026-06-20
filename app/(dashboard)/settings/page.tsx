import { CalendarClock, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SnapshotCache } from '@/components/pwa/snapshot-cache';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { GRAPH_VERSION } from '@/lib/channels/whatsapp/constants';
import { getSettingsSnapshot } from '@/lib/pwa/read-models';
import { createServerClient } from '@/lib/supabase/server';
import { ConnectWhatsApp } from './connect-whatsapp';
import { DangerZone } from './danger-zone';
import { PracticeSettingsForm } from './practice-settings-form';

export const metadata = { title: 'Settings · Medium' };

function ConnectionBadge({ status }: { status: string | null }) {
  if (status === 'active') return <Badge>Connected</Badge>;
  if (status === 'revoked')
    return <Badge variant="destructive">Action needed</Badge>;
  if (status === 'pending') return <Badge variant="secondary">Pending</Badge>;
  return <Badge variant="outline">Not connected</Badge>;
}

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const snapshot = await getSettingsSnapshot(user.id);
  const status = snapshot.whatsappStatus;
  const connected = status === 'active';
  const appId = process.env.NEXT_PUBLIC_META_APP_ID ?? '';
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID ?? '';

  return (
    <div className="space-y-4">
      <SnapshotCache cacheKey="settings" kind="settings" payload={snapshot} />
      <PracticeSettingsForm
        practiceName={snapshot.practiceName}
        timezone={snapshot.timezone}
        aiName={snapshot.aiName}
        aiGreeting={snapshot.aiGreeting}
        aiEscalationKeyword={snapshot.aiEscalationKeyword}
        retentionDays={snapshot.retentionDays}
        notificationPrefs={snapshot.notificationPrefs}
      />

      <Link href="/settings/availability" className="block">
        <Card className="transition-colors hover:bg-muted/50">
          <CardContent className="flex items-center gap-3 py-4">
            <CalendarClock
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="flex-1">
              <p className="font-medium">Availability</p>
              <p className="text-sm text-muted-foreground">
                Working hours, blocked dates, and appointment length.
              </p>
            </div>
            <ChevronRight
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
          </CardContent>
        </Card>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            WhatsApp
            <ConnectionBadge status={status} />
          </CardTitle>
          <CardDescription>
            Connect your WhatsApp Business number so patients can message your
            practice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === 'revoked' && (
            <p className="text-destructive text-sm">
              Your WhatsApp connection was revoked. Reconnect to resume
              messaging.
            </p>
          )}
          {connected && snapshot.whatsappPhoneNumberId && (
            <p className="text-muted-foreground text-sm">
              Connected number ID:{' '}
              <span className="font-mono">
                {snapshot.whatsappPhoneNumberId}
              </span>
            </p>
          )}
          <ConnectWhatsApp
            appId={appId}
            configId={configId}
            graphVersion={GRAPH_VERSION}
            connected={connected}
          />
          {(!appId || !configId) && (
            <p className="text-muted-foreground text-xs">
              Set NEXT_PUBLIC_META_APP_ID and NEXT_PUBLIC_META_CONFIG_ID to
              enable signup.
            </p>
          )}
        </CardContent>
      </Card>

      <DangerZone connected={connected} />
    </div>
  );
}
