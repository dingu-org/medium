import { desc, eq } from 'drizzle-orm';
import { CalendarClock, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { GRAPH_VERSION } from '@/lib/channels/whatsapp/constants';
import { db } from '@/lib/db';
import { pts, whatsappConnections } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';
import {
  NOTIFICATION_PREF_KEYS,
  type NotificationPrefs,
} from './constants';
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

function resolvePrefs(raw: unknown): NotificationPrefs {
  const value = (raw ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    NOTIFICATION_PREF_KEYS.map((key) => [
      key,
      value[key] === undefined ? true : value[key] === true,
    ]),
  ) as NotificationPrefs;
}

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [[pt], [connection]] = await Promise.all([
    db
      .select({
        practiceName: pts.practiceName,
        timezone: pts.timezone,
        aiName: pts.aiName,
        aiGreeting: pts.aiGreeting,
        aiEscalationKeyword: pts.aiEscalationKeyword,
        retentionDays: pts.retentionDays,
        notificationPrefs: pts.notificationPrefs,
      })
      .from(pts)
      .where(eq(pts.id, user.id))
      .limit(1),
    db
      .select({
        status: whatsappConnections.status,
        phoneNumberId: whatsappConnections.phoneNumberId,
      })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, user.id))
      .orderBy(desc(whatsappConnections.createdAt))
      .limit(1),
  ]);

  const status = connection?.status ?? null;
  const connected = status === 'active';
  const appId = process.env.NEXT_PUBLIC_META_APP_ID ?? '';
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID ?? '';

  return (
    <div className="space-y-4">
      <PracticeSettingsForm
        practiceName={pt?.practiceName ?? ''}
        timezone={pt?.timezone ?? 'Europe/Berlin'}
        aiName={pt?.aiName ?? ''}
        aiGreeting={pt?.aiGreeting ?? ''}
        aiEscalationKeyword={pt?.aiEscalationKeyword ?? ''}
        retentionDays={pt?.retentionDays ?? 90}
        notificationPrefs={resolvePrefs(pt?.notificationPrefs)}
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
          {connected && connection?.phoneNumberId && (
            <p className="text-muted-foreground text-sm">
              Connected number ID:{' '}
              <span className="font-mono">{connection.phoneNumberId}</span>
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
