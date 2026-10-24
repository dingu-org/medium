import { redirect } from 'next/navigation';
import { getDashboardOnboardingState } from '@/lib/onboarding/dashboard-state';
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
  const [snapshot, onboarding] = await Promise.all([
    getTodaySnapshot(user.id),
    getDashboardOnboardingState(user.id),
  ]);
  return (
    <TodayClient
      snapshot={snapshot}
      remindersEnabled={remindersEnabled()}
      whatsappStepLeft={onboarding.whatsappStepLeft}
    />
  );
}
