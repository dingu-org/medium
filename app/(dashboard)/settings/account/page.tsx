import { redirect } from 'next/navigation';
import { NavBar } from '@/components/dashboard/nav-bar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { getSettingsSnapshot } from '@/lib/pwa/read-models';
import { createServerClient } from '@/lib/supabase/server';
import { DangerZone } from '../danger-zone';
import { ExportData } from '../export-data';
import { AccountForm } from './account-form';

export const metadata = { title: `${t.settings.accountAndData} · Medium` };

export default async function AccountSettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const snapshot = await getSettingsSnapshot(user.id);
  const connected = snapshot.whatsappStatus === 'active';

  return (
    <div className="-mx-4 -mt-4">
      <NavBar title={t.settings.accountAndData} backHref="/settings" />
      <div className="space-y-4 px-5 pt-2 pb-4">
        <AccountForm
          timezone={snapshot.timezone}
          retentionDays={snapshot.retentionDays}
        />

        <Card>
          <CardHeader>
            <CardTitle>{t.settings.exportData}</CardTitle>
            <CardDescription>{t.settings.exportSub}</CardDescription>
          </CardHeader>
          <CardContent>
            <ExportData />
          </CardContent>
        </Card>

        <DangerZone connected={connected} practiceName={snapshot.practiceName} />
      </div>
    </div>
  );
}
