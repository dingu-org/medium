import { redirect } from 'next/navigation';
import { NavBar } from '@/components/dashboard/nav-bar';
import { AssistantCard } from '@/components/settings/assistant-card';
import { OfflineNote } from '@/components/settings/offline-note';
import { t } from '@/lib/i18n';
import { getSettingsSnapshot } from '@/lib/pwa/read-models';
import { createServerClient } from '@/lib/supabase/server';
import { setAssistantPaused } from './actions';
import { AssistantIdentity } from './assistant-identity';

export const metadata = { title: `${t.settings.assistant} · Medium` };

export default async function AssistantSettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const snapshot = await getSettingsSnapshot(user.id);

  return (
    <div className="-mx-4 -mt-4">
      <NavBar title={t.settings.assistant} backHref="/settings" />
      <div className="space-y-4 px-5 pt-2 pb-4">
        <OfflineNote />
        <AssistantCard
          big
          paused={snapshot.assistantPaused}
          onToggle={setAssistantPaused}
        />
        <AssistantIdentity
          aiName={snapshot.aiName}
          aiGreeting={snapshot.aiGreeting}
          aiEscalationKeyword={snapshot.aiEscalationKeyword}
        />
      </div>
    </div>
  );
}
