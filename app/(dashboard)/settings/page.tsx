import { CalendarClock, Stethoscope } from 'lucide-react';
import { redirect } from 'next/navigation';
import { SnapshotCache } from '@/components/pwa/snapshot-cache';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { GroupedList, GroupedListRow } from '@/components/ui/grouped-list';
import { ChannelChip } from '@/components/ui/channel-chip';
import { StatusPill } from '@/components/ui/status-pill';
import { GRAPH_VERSION } from '@/lib/channels/whatsapp/constants';
import { t } from '@/lib/i18n';
import { getSettingsSnapshot } from '@/lib/pwa/read-models';
import { createServerClient } from '@/lib/supabase/server';
import { ConnectWhatsApp } from './connect-whatsapp';
import { DangerZone } from './danger-zone';
import { PracticeSettingsForm } from './practice-settings-form';
import { PushNotifications } from './push-notifications';

export const metadata = { title: `${t.settings.title} · Medium` };

function ConnectionBadge({ status }: { status: string | null }) {
  if (status === 'active') return <ChannelChip state="connected" />;
  if (status === 'revoked') return <ChannelChip state="reconnect" />;
  if (status === 'pending') return <ChannelChip state="pending" />;
  return (
    <StatusPill tone="neutral">
      {t.settings.connectionBadgeNotConnected}
    </StatusPill>
  );
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

      <PushNotifications />

      <GroupedList>
        <GroupedListRow
          href="/settings/availability"
          icon={CalendarClock}
          title={t.settings.availability}
          description={t.settings.availabilitySub}
        />
        <GroupedListRow
          href="/settings/services"
          icon={Stethoscope}
          title={t.settings.services}
          description={t.settings.servicesSub}
        />
      </GroupedList>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            WhatsApp
            <ConnectionBadge status={status} />
          </CardTitle>
          <CardDescription>{t.settings.whatsappCardSub}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === 'revoked' && (
            <p className="text-destructive text-sm">
              {t.settings.whatsappRevoked}
            </p>
          )}
          {connected && snapshot.whatsappPhoneNumberId && (
            <p className="text-muted-foreground text-sm">
              {t.settings.whatsappConnectedId}{' '}
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
              {t.settings.whatsappEnvNote}
            </p>
          )}
        </CardContent>
      </Card>

      <DangerZone connected={connected} />
    </div>
  );
}
