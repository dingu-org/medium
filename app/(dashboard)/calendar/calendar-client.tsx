'use client';

import { addDays, format } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { ReminderBadge } from '@/components/appointments/badges';
import { AppointmentSheet } from '@/components/appointments/appointment-sheet';
import type { AppointmentView } from '@/components/appointments/types';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
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

/** Status dot colour, per the product spec. */
function statusDot(appt: CalendarAppointment): string {
  if (appt.status === 'completed') return 'bg-muted-foreground';
  if (appt.status === 'no_show') return 'bg-destructive';
  const r = appt.reminder;
  if (r?.responseType === 'cancel' || r?.responseType === 'reschedule_requested')
    return 'bg-red-500';
  if (appt.status === 'confirmed') return 'bg-emerald-500';
  if (r && r.status === 'sent' && !r.responseType) return 'bg-orange-500';
  return 'bg-amber-500';
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
}: {
  ptId: string;
  timezone: string;
  view: 'week' | 'month';
  anchorKey: string;
  todayKey: string;
  monthLabel: string;
  weekDays: WeekDay[];
  appointments: CalendarAppointment[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<CalendarAppointment | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(anchorKey);

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

  function navigate(dateKey: string, nextView: 'week' | 'month') {
    router.push(`/calendar?date=${dateKey}&view=${nextView}`, {
      scroll: false,
    });
  }

  function openAppt(appt: CalendarAppointment) {
    setSelected(appt);
    setSheetOpen(true);
  }

  function shiftWeek(deltaDays: number) {
    navigate(format(addDays(dateFromKey(anchorKey), deltaDays), 'yyyy-MM-dd'), 'week');
  }

  return (
    <div className="space-y-4">
      <RealtimeRefresher table="appointments" filter={`pt_id=eq.${ptId}`} />

      {/* Header: view toggle + today */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => navigate(anchorKey, 'week')}
            className={cn(
              'rounded px-3 py-1 text-sm',
              view === 'week'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground',
            )}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => navigate(anchorKey, 'month')}
            className={cn(
              'rounded px-3 py-1 text-sm',
              view === 'month'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground',
            )}
          >
            Month
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(todayKey, view)}
        >
          Today
        </Button>
      </div>

      {view === 'week' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous week"
              onClick={() => shiftWeek(-7)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <p className="text-sm font-medium">{monthLabel}</p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next week"
              onClick={() => shiftWeek(7)}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {appointments.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              title="No appointments yet"
              description="Share your WhatsApp number to start taking bookings."
            />
          )}

          {weekDays.map((day) => {
            const list = byDay.get(day.key) ?? [];
            return (
              <div key={day.key} className="space-y-1">
                <p
                  className={cn(
                    'text-xs font-medium uppercase tracking-wide',
                    day.isToday ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {day.label}
                  {day.isToday && ' · Today'}
                </p>
                {list.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60">—</p>
                ) : (
                  <ul className="space-y-1.5">
                    {list.map((appt) => (
                      <AppointmentRow
                        key={appt.id}
                        appt={appt}
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
        <div className="space-y-4">
          <Calendar
            mode="single"
            month={dateFromKey(`${anchorKey.slice(0, 8)}01`)}
            selected={dateFromKey(selectedDay)}
            onSelect={(d) => d && setSelectedDay(format(d, 'yyyy-MM-dd'))}
            onMonthChange={(m) => navigate(format(m, 'yyyy-MM-01'), 'month')}
            weekStartsOn={1}
            modifiers={{ hasAppt: apptDays }}
            modifiersClassNames={{
              hasAppt:
                'relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary',
            }}
            className="rounded-md border border-border"
          />
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {format(dateFromKey(selectedDay), 'EEEE d MMMM')}
            </p>
            {(byDay.get(selectedDay) ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No appointments this day.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {(byDay.get(selectedDay) ?? []).map((appt) => (
                  <AppointmentRow key={appt.id} appt={appt} onOpen={openAppt} />
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
      <CalendarFab defaultDate={anchorKey} />
    </div>
  );
}

function AppointmentRow({
  appt,
  onOpen,
}: {
  appt: CalendarAppointment;
  onOpen: (a: CalendarAppointment) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(appt)}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50"
      >
        <span
          className={cn('h-2.5 w-2.5 shrink-0 rounded-full', statusDot(appt))}
          aria-hidden="true"
        />
        <span className="w-12 shrink-0 text-sm font-medium tabular-nums">
          {appt.startLabel}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{appt.patientName}</span>
          {appt.serviceType && (
            <span className="block truncate text-xs text-muted-foreground">
              {appt.serviceType}
            </span>
          )}
        </span>
        <ReminderBadge reminder={appt.reminder} />
      </button>
    </li>
  );
}
