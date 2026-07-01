import { redirect } from 'next/navigation';
import { getCalendarSnapshot } from '@/lib/pwa/read-models';
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
  const ptId = user.id;

  const snapshot = await getCalendarSnapshot(ptId, {
    date,
    view: viewParam,
  });

  return (
    <CalendarClient
      ptId={snapshot.ptId}
      timezone={snapshot.timezone}
      view={snapshot.view}
      anchorKey={snapshot.anchorKey}
      todayKey={snapshot.todayKey}
      monthLabel={snapshot.monthLabel}
      weekDays={snapshot.weekDays}
      appointments={snapshot.appointments}
      activeServices={snapshot.activeServices}
    />
  );
}
