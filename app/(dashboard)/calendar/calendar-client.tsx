'use client';

import { addDays, format } from 'date-fns';
import { sq } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  t,
  formatDate,
  formatDateLong,
  formatWeekday,
  formatWeekdayDate,
} from '@/lib/i18n';
import { useEffect, useMemo, useState } from 'react';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { ReminderBadge, StatusBadge } from '@/components/appointments/badges';
import { AppointmentSheet } from '@/components/appointments/appointment-sheet';
import type { AppointmentView } from '@/components/appointments/types';
import { SnapshotCache } from '@/components/pwa/snapshot-cache';
import { EmptyState } from '@/components/states';
import { Calendar } from '@/components/ui/calendar';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatusPill } from '@/components/ui/status-pill';
import {
  listPendingMutations,
  type PendingMutation,
  subscribeToQueueChanges,
} from '@/lib/pwa/client-store';
import { cn } from '@/lib/utils';
import type { ServiceRecord } from '@/lib/services/queries';
import { CalendarFab } from './calendar-fab';

export type WeekDay = { key: string; label: string; isToday: boolean };
export type CalendarAppointment = AppointmentView & {
  dayKey: string;
  startLabel: string;
};

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "E hën." → "Hën" for the compact week strip.
function stripDow(date: Date): string {
  return formatWeekday(date).replace(/^E /, '').slice(0, 3);
}

/** Status dot colour, per the product spec (canvas CAL map). */
function statusDot(appt: CalendarAppointment): string {
  if (appt.status === 'cancelled') return 'bg-destructive';
  if (appt.status === 'rescheduled') return 'bg-primary';
  if (appt.status === 'completed') return 'bg-[var(--neutral-400)]';
  if (appt.status === 'no_show') return 'bg-destructive';
  const r = appt.reminder;
  if (
    r?.responseType === 'cancel' ||
    r?.responseType === 'reschedule_requested'
  )
    return 'bg-destructive';
  if (appt.status === 'confirmed') return 'bg-[var(--success-500)]';
  // Reminder sent, patient hasn't replied → needs your attention (orange).
  if (r && r.status === 'sent' && !r.responseType)
    return 'bg-[var(--attention-500)]';
  return 'bg-[var(--warning-500)]';
}

export function CalendarClient({
  ptId,
  timezone,
  view,
  anchorKey,
  todayKey,
  monthLabel,
  weekDays,
  appointments,
  activeServices,
}: {
  ptId: string;
  timezone: string;
  view: 'day' | 'week' | 'month';
  anchorKey: string;
  todayKey: string;
  monthLabel: string;
  weekDays: WeekDay[];
  appointments: CalendarAppointment[];
  activeServices: ServiceRecord[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<CalendarAppointment | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(anchorKey);
  const [pendingMutations, setPendingMutations] = useState<PendingMutation[]>(
    [],
  );

  useEffect(() => {
    let active = true;
    async function refreshPending() {
      try {
        const items = await listPendingMutations();
        if (active) setPendingMutations(items);
      } catch {
        // The dashboard still works if IndexedDB is unavailable.
      }
    }
    void refreshPending();
    const unsubscribe = subscribeToQueueChanges(refreshPending);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const a of appointments) {
      const list = map.get(a.dayKey) ?? [];
      list.push(a);
      map.set(a.dayKey, list);
    }
    return map;
  }, [appointments]);

  const apptDays = useMemo(
    () => [...new Set(appointments.map((a) => a.dayKey))].map(dateFromKey),
    [appointments],
  );

  const pendingByAppointmentId = useMemo(() => {
    const map = new Map<string, PendingMutation[]>();
    for (const mutation of pendingMutations) {
      const appointmentId = appointmentIdFromMutation(mutation);
      if (!appointmentId) continue;
      const list = map.get(appointmentId) ?? [];
      list.push(mutation);
      map.set(appointmentId, list);
    }
    return map;
  }, [pendingMutations]);

  function navigate(dateKey: string, nextView: 'day' | 'week' | 'month') {
    router.push(`/calendar?date=${dateKey}&view=${nextView}`, {
      scroll: false,
    });
  }

  function openAppt(appt: CalendarAppointment) {
    setSelected(appt);
    setSheetOpen(true);
  }

  function shiftDays(deltaDays: number) {
    navigate(
      format(addDays(dateFromKey(anchorKey), deltaDays), 'yyyy-MM-dd'),
      view,
    );
  }

  const anchorDate = dateFromKey(anchorKey);
  const weekHasToday = weekDays.some((d) => d.isToday);
  const weekRangeLabel =
    weekDays.length === 7
      ? `${format(dateFromKey(weekDays[0].key), 'd')}–${formatDate(dateFromKey(weekDays[6].key))}`
      : monthLabel;
  const headerTitle =
    view === 'month'
      ? monthLabel
      : view === 'week'
        ? weekRangeLabel
        : formatWeekday(anchorDate);
  const headerSub =
    view === 'month'
      ? null
      : view === 'week'
        ? weekHasToday
          ? t.calendar.currentWeek
          : null
        : formatDateLong(anchorDate);

  const dayList = byDay.get(view === 'day' ? anchorKey : selectedDay) ?? [];

  return (
    <div>
      <SnapshotCache
        cacheKey={`calendar:${anchorKey}:${view}`}
        kind="calendar"
        payload={{
          ptId,
          timezone,
          view,
          anchorKey,
          todayKey,
          monthLabel,
          weekDays,
          appointments,
          activeServices,
        }}
      />
      <RealtimeRefresher table="appointments" filter={`pt_id=eq.${ptId}`} />

      {/* Canvas CalHeader: seg left, true-centered title, "Sot" pill right. */}
      <div className="relative flex min-h-11 items-center justify-between">
        <SegmentedControl
          ariaLabel={t.calendar.title}
          value={view === 'month' ? 'month' : 'week'}
          onValueChange={(nextView) => navigate(anchorKey, nextView)}
          options={[
            { value: 'week', label: t.calendar.views.week },
            { value: 'month', label: t.calendar.views.month },
          ]}
          className="w-[124px]"
        />
        <div className="pointer-events-none absolute inset-y-0 right-24 left-24 flex flex-col items-center justify-center">
          <p className="font-heading text-lg leading-tight font-semibold tracking-[-0.025em] whitespace-nowrap">
            {headerTitle}
          </p>
          {headerSub && (
            <p className="text-ink-3 mt-0.5 text-xs whitespace-nowrap">
              {headerSub}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate(todayKey, view)}
          className="text-primary h-9 shrink-0 rounded-full bg-card px-[15px] text-[13px] font-bold shadow-[var(--shadow-card)] transition-colors hover:bg-[#f7f7f4]"
        >
          {t.calendar.todayBtn}
        </button>
      </div>

      {view !== 'month' && (
        <div className="mt-3 mb-4 flex items-center">
          <button
            type="button"
            aria-label={t.calendar.prevWeek}
            onClick={() => shiftDays(-7)}
            className="-ml-2 flex h-11 w-8 shrink-0 items-center justify-center"
          >
            <ChevronLeft className="text-ink-3/70 h-[18px] w-[18px]" aria-hidden />
          </button>
          <div className="grid flex-1 grid-cols-7">
            {weekDays.map((day) => {
              const date = dateFromKey(day.key);
              const on =
                view === 'day' ? day.key === anchorKey : day.isToday;
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => navigate(day.key, 'day')}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span
                    className={cn(
                      'text-[11px] font-semibold',
                      on ? 'text-primary' : 'text-ink-3',
                    )}
                  >
                    {stripDow(date)}
                  </span>
                  <span
                    className={cn(
                      'font-heading flex h-[34px] w-[34px] items-center justify-center rounded-full text-[15px] font-semibold tabular-nums',
                      on ? 'bg-primary text-white' : 'text-foreground',
                    )}
                  >
                    {date.getDate()}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label={t.calendar.nextWeek}
            onClick={() => shiftDays(7)}
            className="-mr-2 flex h-11 w-8 shrink-0 items-center justify-center"
          >
            <ChevronRight className="text-ink-3/70 h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>
      )}

      {view === 'day' ? (
        <div>
          {dayList.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={t.calendar.emptyDayTitle}
              description={t.calendar.emptyDayText}
              className="pt-14"
            />
          ) : (
            <>
              <p className="flex items-baseline gap-2 px-0.5 pb-3">
                <span className="font-heading text-lg font-semibold tracking-[-0.02em]">
                  {t.calendar.apptCount(dayList.length)}
                </span>
              </p>
              <ul className="space-y-[11px]">
                {dayList.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appt={appt}
                    pendingMutations={pendingByAppointmentId.get(appt.id) ?? []}
                    onOpen={openAppt}
                  />
                ))}
              </ul>
              <p className="text-ink-3 px-6 pt-6 text-center text-[12.5px] leading-normal">
                {t.calendar.restOfDayFree}
                <br />
                {t.calendar.mediumWillReply}
              </p>
            </>
          )}
        </div>
      ) : view === 'week' ? (
        <div className="space-y-[18px]">
          {appointments.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              title={t.calendar.weekEmpty}
              description={t.calendar.weekEmptyDesc}
              className="pt-10"
            />
          )}

          {appointments.length > 0 &&
            weekDays.map((day) => {
              const list = byDay.get(day.key) ?? [];
              return (
                <div key={day.key}>
                  <p
                    className={cn(
                      'mb-2 font-mono text-[11px] font-bold tracking-[0.06em] uppercase',
                      day.isToday ? 'text-primary' : 'text-ink-3',
                    )}
                  >
                    {day.label}
                    {day.isToday && ` ${t.calendar.todayLabel.toLowerCase()}`}
                  </p>
                  {list.length === 0 ? (
                    <p className="text-ink-3 px-0.5 text-[13px]">
                      — {t.calendar.free}
                    </p>
                  ) : (
                    <ul className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-card)] [&>*+*]:border-t [&>*+*]:border-sep">
                      {list.map((appt) => (
                        <AppointmentRow
                          key={appt.id}
                          appt={appt}
                          pendingMutations={
                            pendingByAppointmentId.get(appt.id) ?? []
                          }
                          onOpen={openAppt}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <div className="mt-4 space-y-[18px]">
          <div className="rounded-lg bg-card px-3 py-3.5 shadow-[var(--shadow-card)]">
            <Calendar
              mode="single"
              month={dateFromKey(`${anchorKey.slice(0, 8)}01`)}
              selected={dateFromKey(selectedDay)}
              onSelect={(d) => d && setSelectedDay(format(d, 'yyyy-MM-dd'))}
              onMonthChange={(m) => navigate(format(m, 'yyyy-MM-01'), 'month')}
              weekStartsOn={1}
              locale={sq}
              modifiers={{ hasAppt: apptDays }}
              modifiersClassNames={{
                hasAppt:
                  'relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary',
              }}
              className="mx-auto bg-transparent"
            />
          </div>
          <div>
            <p className="font-heading mb-2.5 text-sm font-semibold tracking-[-0.01em]">
              {formatWeekdayDate(dateFromKey(selectedDay))}
            </p>
            {dayList.length === 0 ? (
              <p className="text-ink-3 text-sm">{t.calendar.monthDayEmpty}</p>
            ) : (
              <ul className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-card)] [&>*+*]:border-t [&>*+*]:border-sep">
                {dayList.map((appt) => (
                  <AppointmentRow
                    key={appt.id}
                    appt={appt}
                    pendingMutations={pendingByAppointmentId.get(appt.id) ?? []}
                    onOpen={openAppt}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <AppointmentSheet
        appointment={selected}
        timezone={timezone}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
      <CalendarFab defaultDate={anchorKey} services={activeServices} />
    </div>
  );
}

/** Rich day-view card (canvas ApptCard): time block + status rule + pill. */
function AppointmentCard({
  appt,
  pendingMutations,
  onOpen,
}: {
  appt: CalendarAppointment;
  pendingMutations: PendingMutation[];
  onOpen: (a: CalendarAppointment) => void;
}) {
  const pendingLabel = getPendingAppointmentLabel(pendingMutations);
  const faded = appt.status === 'cancelled' || appt.status === 'completed';
  const durationMin = Math.round(
    (new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()) /
      60_000,
  );
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(appt)}
        className={cn(
          'hover:bg-muted/40 flex w-full gap-3.5 rounded-lg bg-card px-4 py-[15px] text-left shadow-[var(--shadow-card)] transition-colors',
          faded && 'opacity-60',
        )}
      >
        <span className="w-[52px] shrink-0">
          <span
            className={cn(
              'font-heading block text-[17px] font-semibold tracking-[-0.02em] tabular-nums whitespace-nowrap',
              appt.status === 'cancelled' && 'line-through',
            )}
          >
            {appt.startLabel}
          </span>
          <span className="text-ink-3 mt-[3px] block font-mono text-[11px] whitespace-nowrap">
            {durationMin} min
          </span>
        </span>
        <span
          className={cn('w-[3px] shrink-0 rounded-full', statusDot(appt))}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold tracking-[-0.005em]">
              {appt.patientName}
            </span>
            <StatusBadge status={appt.status} />
          </span>
          {appt.serviceType && (
            <span className="text-ink-2 mt-[3px] block text-[13.5px]">
              {appt.serviceType}
            </span>
          )}
          <span className="mt-2 flex items-center gap-2 empty:mt-0">
            {pendingLabel && (
              <SyncChip failed={pendingMutations.some((m) => m.status === 'failed')}>
                {pendingLabel}
              </SyncChip>
            )}
            <ReminderBadge reminder={appt.reminder} />
          </span>
        </span>
      </button>
    </li>
  );
}

/** Compact agenda row (canvas ApptRow): dot + time + name/service + pill. */
function AppointmentRow({
  appt,
  pendingMutations,
  onOpen,
}: {
  appt: CalendarAppointment;
  pendingMutations: PendingMutation[];
  onOpen: (a: CalendarAppointment) => void;
}) {
  const pendingLabel = getPendingAppointmentLabel(pendingMutations);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(appt)}
        className="hover:bg-muted/40 flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors"
      >
        <span
          className={cn('h-2.5 w-2.5 shrink-0 rounded-full', statusDot(appt))}
          aria-hidden="true"
        />
        <span className="font-heading w-[46px] shrink-0 text-sm font-semibold tracking-[-0.01em] tabular-nums">
          {appt.startLabel}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium">
            {appt.patientName}
          </span>
          {appt.serviceType && (
            <span className="text-ink-3 block truncate text-xs">
              {appt.serviceType}
            </span>
          )}
        </span>
        {pendingLabel ? (
          <SyncChip failed={pendingMutations.some((m) => m.status === 'failed')}>
            {pendingLabel}
          </SyncChip>
        ) : (
          <StatusBadge status={appt.status} />
        )}
        <ReminderBadge reminder={appt.reminder} />
      </button>
    </li>
  );
}

/** Pending-sync chip (canvas SyncChip): bordered mono pill. */
function SyncChip({
  failed,
  children,
}: {
  failed: boolean;
  children: React.ReactNode;
}) {
  return (
    <StatusPill
      tone={failed ? 'danger' : 'warning'}
      mono
      className={cn(
        'border font-semibold',
        failed ? 'border-[#f0d0cf]' : 'border-[#f0e0bd]',
      )}
    >
      {children}
    </StatusPill>
  );
}

function appointmentIdFromMutation(mutation: PendingMutation): string | null {
  if (!mutation.type.startsWith('appointment.')) return null;
  const body = mutation.body as { appointmentId?: unknown } | null;
  return typeof body?.appointmentId === 'string' ? body.appointmentId : null;
}

function getPendingAppointmentLabel(
  mutations: PendingMutation[],
): string | null {
  if (mutations.length === 0) return null;
  if (mutations.some((m) => m.status === 'failed'))
    return t.calendar.syncFailed;
  const actions = new Set(
    mutations.map((m) => (m.body as { action?: unknown } | null)?.action),
  );
  if (actions.has('cancel')) return t.calendar.cancelPending;
  if (actions.has('reschedule')) return t.calendar.movePending;
  if (actions.has('notes')) return t.calendar.notesPending;
  if (actions.has('transition')) return t.calendar.statusPending;
  return t.calendar.syncPending;
}
