import { redirect } from 'next/navigation';
import { NavBar } from '@/components/dashboard/nav-bar';
import { t } from '@/lib/i18n';
import { getSettingsSnapshot } from '@/lib/pwa/read-models';
import { createServerClient } from '@/lib/supabase/server';
import { PushNotifications } from '../push-notifications';
import { NotifPrefsForm } from './notif-prefs-form';

export const metadata = { title: `${t.settings.sectionNotifications} · Medium` };

export default async function NotificationsSettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const snapshot = await getSettingsSnapshot(user.id);

  return (
    <div className="-mx-4 -mt-4">
      <NavBar title={t.settings.sectionNotifications} backHref="/settings" />
      <div className="space-y-4 px-5 pt-2 pb-4">
        <NotifPrefsForm notificationPrefs={snapshot.notificationPrefs} />
        <PushNotifications />
      </div>
    </div>
  );
}
