import { User } from 'lucide-react';
import { redirect } from 'next/navigation';
import { NavBar } from '@/components/dashboard/nav-bar';
import { OfflineNote } from '@/components/settings/offline-note';
import { GroupedList, GroupedListRow } from '@/components/ui/grouped-list';
import { t } from '@/lib/i18n';
import { getSettingsSnapshot } from '@/lib/pwa/read-models';
import { createServerClient } from '@/lib/supabase/server';
import { AccountDanger } from './account-danger';
import { DataGroup } from './data-group';

export const metadata = { title: `${t.settings.accountAndData} · Medium` };

export default async function AccountSettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const snapshot = await getSettingsSnapshot(user.id);
  const email = user.email ?? '';

  return (
    <div>
      <NavBar title={t.settings.accountAndData} backHref="/settings" />
      <div className="space-y-6 px-4 pt-2 pb-4">
        <OfflineNote />

        <GroupedList title={t.settings.accountSection}>
          <GroupedListRow
            icon={User}
            title={t.settings.emailRow}
            titleWeight="medium"
            value={email}
          />
        </GroupedList>

        <DataGroup
          retentionDays={snapshot.retentionDays}
          retentionMaxDays={snapshot.retentionMaxDays}
        />

        <AccountDanger name={snapshot.name} />
      </div>
    </div>
  );
}
