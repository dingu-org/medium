import { redirect } from 'next/navigation';
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
    <div>
      <ProfileForm
        fullName={snapshot.fullName}
        title={snapshot.title}
        name={snapshot.name}
        address={snapshot.address}
        phone={snapshot.whatsappDisplayPhoneNumber}
        email={user.email ?? ''}
      />
    </div>
  );
}
