import {
  Bell,
  Clock,
  CreditCard,
  MessageSquare,
  Phone,
  Settings,
  Sparkles,
  User,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { SnapshotCache } from '@/components/pwa/snapshot-cache';
import { AssistantCard } from '@/components/settings/assistant-card';
import { VersionFoot } from '@/components/settings/version-foot';
import { GroupedList, GroupedListRow } from '@/components/ui/grouped-list';
import { t } from '@/lib/i18n';
import { getSettingsSnapshot } from '@/lib/pwa/read-models';
import { getServices } from '@/lib/services/queries';
import {
  getAvailabilityWeekdays,
  weekdaySummary,
} from '@/lib/settings/availability-summary';
import { createServerClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { setAssistantPaused } from './assistant/actions';
import { ProfileCard } from './profile-card';
import { SignOutRow } from './sign-out-row';

export const metadata = { title: `${t.settings.hubTitle} · Medium` };

const DOT_TONES: Record<string, string> = {
  active: 'bg-[var(--success-500)]',
  pending: 'bg-[var(--warning-500)]',
  revoked: 'bg-destructive',
};

function StatusDot({ status }: { status: string | null }) {
  return (
    <span
      className={cn(
        'h-[9px] w-[9px] shrink-0 rounded-full',
        DOT_TONES[status ?? ''] ?? 'bg-[var(--neutral-300)]',
      )}
      aria-hidden="true"
    />
  );
}

const WA_VALUES: Record<string, string> = {
  active: t.settings.connected,
  pending: t.settings.connectionBadgePending,
  revoked: t.settings.reconnect,
};

function cityOf(address: string): string {
  return address.split(',').pop()?.trim() ?? '';
}

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [snapshot, services, weekdays] = await Promise.all([
    getSettingsSnapshot(user.id),
    getServices(user.id),
    getAvailabilityWeekdays(user.id),
  ]);
  const activeCount = services.filter((s) => s.active).length;
  const email = user.email ?? '';
  const profileName = snapshot.fullName || snapshot.practiceName || email;
  const profileSubtitle = [snapshot.title, cityOf(snapshot.address)]
    .filter(Boolean)
    .join(' · ');
  const waValue =
    WA_VALUES[snapshot.whatsappStatus ?? ''] ??
    t.settings.connectionBadgeNotConnected;
  const planLabel = snapshot.planLifetime
    ? t.billing.planLifetime
    : snapshot.plan === 'solo'
      ? t.billing.planSolo
      : t.billing.planFree;

  return (
    <div className="space-y-6">
      <SnapshotCache cacheKey="settings" kind="settings" payload={snapshot} />
      <ProfileCard
        name={profileName}
        subtitle={profileSubtitle || undefined}
        email={email}
        href="/settings/profile"
      />
      <AssistantCard
        paused={snapshot.assistantPaused}
        onToggle={setAssistantPaused}
      />

      <GroupedList title={t.settings.groupPraktika}>
        <GroupedListRow
          href="/settings/profile"
          icon={User}
          title={t.settings.profileBusiness}
        />
        <GroupedListRow
          href="/settings/services"
          icon={MessageSquare}
          title={t.settings.services}
          value={String(activeCount)}
        />
        <GroupedListRow
          href="/settings/availability"
          icon={Clock}
          title={t.settings.availability}
          value={weekdaySummary(weekdays) || undefined}
        />
      </GroupedList>

      <GroupedList title={t.settings.groupMedium}>
        <GroupedListRow
          href="/settings/assistant"
          icon={Sparkles}
          title={t.settings.assistant}
          value={
            snapshot.assistantPaused
              ? t.settings.assistantPaused
              : t.settings.assistantActive
          }
        />
        <GroupedListRow
          href="/settings/whatsapp"
          leading={<StatusDot status={snapshot.whatsappStatus} />}
          title={t.settings.whatsappBusiness}
          value={waValue}
        />
        <GroupedListRow
          href="/settings/notifications"
          icon={Bell}
          title={t.settings.sectionNotifications}
        />
      </GroupedList>

      <GroupedList title={t.settings.groupLlogaria}>
        <GroupedListRow
          href="/settings/billing"
          icon={CreditCard}
          title={t.billing.hubRow}
          value={planLabel}
        />
        <GroupedListRow
          href="/settings/account"
          icon={Settings}
          title={t.settings.accountAndData}
        />
        <GroupedListRow
          href="/help"
          icon={Phone}
          title={t.settings.helpAndContact}
        />
        <SignOutRow />
      </GroupedList>

      <VersionFoot />
    </div>
  );
}
