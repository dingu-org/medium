import { redirect } from 'next/navigation';
import { NavBar } from '@/components/dashboard/nav-bar';
import { t } from '@/lib/i18n';
import { getSettingsSnapshot } from '@/lib/pwa/read-models';
import { createServerClient } from '@/lib/supabase/server';
import { ProfileForm } from './profile-form';

export const metadata = { title: `${t.settings.profileBusiness} · Medium` };

export default async function ProfileSettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const snapshot = await getSettingsSnapshot(user.id);

  return (
    <div className="-mx-4 -mt-4">
      <NavBar title={t.settings.profileBusiness} backHref="/settings" />
      <div className="px-5 pt-2 pb-4">
        <ProfileForm practiceName={snapshot.practiceName} />
      </div>
    </div>
  );
}
