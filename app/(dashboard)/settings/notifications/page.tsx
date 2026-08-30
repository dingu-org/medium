import { redirect } from 'next/navigation';
import { NavBar } from '@/components/dashboard/nav-bar';
import { OfflineNote } from '@/components/settings/offline-note';
import { t } from '@/lib/i18n';
import { getSettingsSnapshot } from '@/lib/pwa/read-models';
import { remindersEnabled } from '@/lib/reminders/flag';
import { createServerClient } from '@/lib/supabase/server';
import { DevicePushCard } from './device-push-card';
import { NotificationPrefs } from './notification-prefs';

export const metadata = {
  title: `${t.settings.sectionNotifications} · Medium`,
};

export default async function NotificationsSettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const snapshot = await getSettingsSnapshot(user.id);

  return (
    <div>
      <NavBar title={t.settings.sectionNotifications} backHref="/settings" />
      <div className="space-y-6 px-4 pt-2 pb-4">
        <OfflineNote />
        <DevicePushCard />
        <NotificationPrefs
          prefs={snapshot.notificationPrefs}
          remindersEnabled={remindersEnabled()}
        />
      </div>
    </div>
  );
}
