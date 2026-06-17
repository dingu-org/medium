import { TZDate } from '@date-fns/tz';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  patients,
  pts,
  reminderJobs,
} from '@/lib/db/schema';
import { privacyName } from '@/lib/format/name';
import { createServerClient } from '@/lib/supabase/server';
import {
  type CalendarAppointment,
  CalendarClient,
  type WeekDay,
} from './calendar-client';

export const metadata = { title: 'Calendar · Medium' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  const [pt] = await db
    .select({ timezone: pts.timezone })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);
  const timezone = pt?.timezone ?? 'Europe/Berlin';

  const view: 'week' | 'month' = viewParam === 'month' ? 'month' : 'week';
  const todayKey = format(new TZDate(new Date(), timezone), 'yyyy-MM-dd');
  const anchorKey = date && DATE_RE.test(date) ? date : todayKey;
  const [ay, am, ad] = anchorKey.split('-').map(Number);
  const anchor = new TZDate(ay, am - 1, ad, timezone);

  // Fetch the full month grid so both the week agenda and the month dots have
  // their data, in the PT's timezone.
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });

  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      serviceType: appointments.serviceType,
      status: appointments.status,
      notes: appointments.notes,
      patientName: patients.name,
      patientPhone: patients.phone,
      patientWaId: patients.waId,
      conversationId: conversations.id,
      reminderStatus: reminderJobs.status,
      reminderResponse: reminderJobs.responseType,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(
      conversations,
      and(
        eq(conversations.patientId, appointments.patientId),
        eq(conversations.channel, 'whatsapp'),
      ),
    )
    .leftJoin(reminderJobs, eq(reminderJobs.appointmentId, appointments.id))
    .where(
      and(
        eq(appointments.ptId, ptId),
        gte(appointments.startsAt, new Date(gridStart.getTime())),
        lte(appointments.startsAt, new Date(gridEnd.getTime())),
        inArray(appointments.status, [
          'pending',
          'confirmed',
          'completed',
          'no_show',
        ]),
      ),
    )
    .orderBy(asc(appointments.startsAt));

  const items: CalendarAppointment[] = rows.map((r) => {
    const tzStart = new TZDate(r.startsAt, timezone);
    return {
      id: r.id,
      patientName: privacyName(r.patientName),
      patientPhone: r.patientPhone,
      patientWaId: r.patientWaId,
      conversationId: r.conversationId,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      serviceType: r.serviceType,
      status: r.status,
      notes: r.notes,
      reminder: r.reminderStatus
        ? { status: r.reminderStatus, responseType: r.reminderResponse }
        : null,
      dayKey: format(tzStart, 'yyyy-MM-dd'),
      startLabel: format(tzStart, 'HH:mm'),
    };
  });

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekDays: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const key = format(d, 'yyyy-MM-dd');
    return { key, label: format(d, 'EEE d'), isToday: key === todayKey };
  });

  return (
    <CalendarClient
      ptId={ptId}
      timezone={timezone}
      view={view}
      anchorKey={anchorKey}
      todayKey={todayKey}
      monthLabel={format(anchor, 'MMMM yyyy')}
      weekDays={weekDays}
      appointments={items}
    />
  );
}
