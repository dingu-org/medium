import { redirect } from 'next/navigation';
import { getCalendarSnapshot } from '@/lib/pwa/read-models';
import { remindersEnabled } from '@/lib/reminders/flag';
import { createServerClient } from '@/lib/supabase/server';
import { CalendarClient } from './calendar-client';

import { t } from '@/lib/i18n';

export const metadata = { title: `${t.calendar.title} · Medium` };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { date, view: viewParam } = await searchParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const accountId = user.id;

  const snapshot = await getCalendarSnapshot(accountId, {
    date,
    view: viewParam,
  });

  return (
    <CalendarClient
      accountId={snapshot.accountId}
      timezone={snapshot.timezone}
      view={snapshot.view}
      anchorKey={snapshot.anchorKey}
      todayKey={snapshot.todayKey}
      weekDays={snapshot.weekDays}
      appointments={snapshot.appointments}
      activeServices={snapshot.activeServices}
      remindersEnabled={remindersEnabled()}
    />
  );
}
