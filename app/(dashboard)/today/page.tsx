import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { remindersEnabled } from '@/lib/reminders/flag';
import { getTodaySnapshot } from '@/lib/today/queries';
import { TodayClient } from './today-client';

export const metadata = { title: 'Sot · Medium' };

export default async function TodayPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const snapshot = await getTodaySnapshot(user.id);
  return (
    <TodayClient snapshot={snapshot} remindersEnabled={remindersEnabled()} />
  );
}
