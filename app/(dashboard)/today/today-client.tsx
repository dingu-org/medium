'use client';

import {
  AlertCircle,
  CalendarDays,
  Check,
  Clock,
  MessageSquare,
} from 'lucide-react';
import { TZDate } from '@date-fns/tz';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AppointmentSheet } from '@/components/appointments/appointment-sheet';
import { StatusBadge } from '@/components/appointments/badges';
import { SnapshotCache } from '@/components/pwa/snapshot-cache';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/section-label';
import { queueAppointmentMutation } from '@/lib/pwa/mutation-client';
import type { TodayAppointment, TodaySnapshot } from '@/lib/today/queries';
import { formatWeekdayDate, t } from '@/lib/i18n';

export function TodayClient({ snapshot }: { snapshot: TodaySnapshot }) {
  const [selected, setSelected] = useState<TodayAppointment | null>(null);
  const [pending, startTransition] = useTransition();
  const quiet = snapshot.attention.length === 0 && !snapshot.next;
  const dateLabel = formatWeekdayDate(
    new TZDate(new Date(snapshot.now), snapshot.timezone),
  );

  function cancel(appointmentId: string) {
    startTransition(async () => {
      const result = await queueAppointmentMutation({
        action: 'cancel',
        appointmentId,
      });
      if (result.status === 'failed') toast.error(result.error);
      else
        toast.success(
          result.status === 'queued' ? 'Anulimi u radhit.' : 'Takimi u anulua.',
        );
    });
  }

  return (
    <div>
      <SnapshotCache cacheKey="today" kind="today" payload={snapshot} />
      <RealtimeRefresher
        table="appointments"
        filter={`pt_id=eq.${snapshot.ptId}`}
      />
      {/* conversations is subscribed app-wide in the dashboard layout. */}
      <RealtimeRefresher
        table="reminder_jobs"
        filter={`pt_id=eq.${snapshot.ptId}`}
      />

      {/* Canvas TopBar sub line — sits right under the chrome title. */}
      <p className="text-ink-3 -mt-1 mb-5 text-[13.5px] tracking-[-0.005em]">
        {dateLabel}
      </p>

      <section className="mb-6">
        <SectionLabel>{t.today.weekLabel}</SectionLabel>
        <div className="flex items-center rounded-lg bg-card px-[18px] py-4 shadow-[var(--shadow-card)]">
          <WeekStat
            value={snapshot.week.messagesReceived}
            label={t.today.messages}
          />
          <div className="mx-4 h-8 w-px bg-sep" aria-hidden />
          <WeekStat value={snapshot.week.bookings} label={t.today.bookings} />
          <div className="mx-4 h-8 w-px bg-sep" aria-hidden />
          <WeekStat
            value={snapshot.week.escalations}
            label={t.today.escalations}
          />
        </div>
      </section>

      {quiet ? (
        <>
          <div className="flex items-center gap-[13px] rounded-lg bg-[var(--success-50)] px-[18px] py-5 shadow-[var(--shadow-card)]">
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-white">
              <Check
                className="h-5 w-5 text-[var(--success-500)]"
                strokeWidth={2}
                aria-hidden
              />
            </span>
            <div className="min-w-0">
              <p className="text-[15.5px] font-semibold text-[var(--success-600)]">
                Asgjë nuk kërkon vëmendjen tënde
              </p>
              <p className="mt-0.5 text-[13.5px] text-[var(--success-600)] opacity-80">
                Medium po i mban të gjitha bisedat.
              </p>
            </div>
          </div>
          <div className="px-7 pt-8 pb-2 text-center">
            <span className="mx-auto flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#ecece7]">
              <CalendarDays className="text-ink-3 h-7 w-7" aria-hidden />
            </span>
            <h2 className="font-heading mt-4 text-lg font-bold tracking-[-0.02em]">
              Asnjë takim sot
            </h2>
            <p className="text-ink-2 mx-auto mt-2 max-w-[250px] text-[13.5px] leading-relaxed">
              Dita është e lirë. Shiko javën që vjen ose pusho — Medium të
              mbulon.
            </p>
            <Button asChild variant="tinted" className="mt-4 h-11">
              <Link href="/calendar">Shiko javën</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          {snapshot.attention.length > 0 && (
            <section className="mb-6">
              <SectionLabel className="text-[var(--attention-600)]">
                Kërkon vëmendjen tënde
              </SectionLabel>
              <div className="space-y-3">
                {snapshot.attention.map((item) => (
                  <div
                    key={`${item.kind}-${item.patientId}`}
                    className="rounded-lg bg-card px-[18px] py-4 shadow-[var(--shadow-card)]"
                  >
                    <div className="flex gap-[13px]">
                      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-[var(--attention-50)] text-[var(--attention-500)]">
                        {item.kind === 'escalation' ? (
                          <AlertCircle className="h-[19px] w-[19px]" aria-hidden />
                        ) : (
                          <Clock className="h-[19px] w-[19px]" aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15.5px] leading-[1.35] font-semibold tracking-[-0.01em]">
                          {item.kind === 'escalation'
                            ? `${item.patientName} kërkon ndihmën tënde`
                            : `${item.patientName} nuk iu përgjigj kujtesës`}
                        </p>
                        {item.appointment && (
                          <p className="text-ink-2 mt-1 text-[13.5px]">
                            {item.appointment.startLabel} ·{' '}
                            {item.appointment.serviceType}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3.5 flex gap-2.5">
                      {item.conversationId && (
                        <Button asChild className="h-11 flex-1">
                          <Link href={`/chat/${item.conversationId}`}>
                            <MessageSquare className="h-4 w-4" aria-hidden />
                            Shkruaji
                          </Link>
                        </Button>
                      )}
                      {item.appointment && (
                        <Button
                          variant="secondary"
                          className="h-11"
                          onClick={() => cancel(item.appointment!.id)}
                          disabled={pending}
                        >
                          Anulo
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {snapshot.next && (
            <section className="mb-6">
              <SectionLabel>Më pas</SectionLabel>
              <NextAppointment
                appointment={snapshot.next}
                onOpen={setSelected}
              />
            </section>
          )}

          {snapshot.later.length > 0 && (
            <section className="mb-6">
              <SectionLabel>Më vonë sot</SectionLabel>
              <div className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-card)] [&>*+*]:border-t [&>*+*]:border-sep">
                {snapshot.later.map((appointment) => (
                  <LaterRow
                    key={appointment.id}
                    appointment={appointment}
                    onOpen={setSelected}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <AppointmentSheet
        appointment={selected}
        timezone={snapshot.timezone}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}

/** One inline stat inside the "Kjo javë" strip (big number + small label). */
function WeekStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0 flex-1 text-center">
      <span className="font-heading block text-[22px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
        {value}
      </span>
      <span className="text-ink-3 mt-1 block truncate text-[12px]">
        {label}
      </span>
    </div>
  );
}

/** Prominent "Më pas" card (canvas NextAppt): big clock + green rule. */
function NextAppointment({
  appointment,
  onOpen,
}: {
  appointment: TodayAppointment;
  onOpen: (appointment: TodayAppointment) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(appointment)}
      className="hover:bg-muted/40 flex w-full items-center gap-[13px] rounded-lg bg-card px-[18px] py-4 text-left shadow-[var(--shadow-card)] transition-colors"
    >
      <span className="flex w-16 shrink-0 flex-col items-start">
        <span className="font-heading text-[26px] leading-none font-semibold tracking-[-0.03em] tabular-nums whitespace-nowrap">
          {appointment.startLabel}
        </span>
        <span className="text-ink-3 mt-[5px] font-mono text-[11.5px] whitespace-nowrap">
          {appointment.durationMinutes} min
        </span>
      </span>
      <span className="w-[3px] self-stretch rounded-full bg-[var(--success-500)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16.5px] font-semibold tracking-[-0.01em]">
          {appointment.patientName}
        </span>
        <span className="text-ink-2 mt-0.5 block truncate text-[13.5px]">
          {appointment.serviceType ?? 'Takim'}
        </span>
      </span>
      <StatusBadge status={appointment.status} />
    </button>
  );
}

/** Compact "Më vonë sot" row (canvas Group/Row with a leading clock). */
function LaterRow({
  appointment,
  onOpen,
}: {
  appointment: TodayAppointment;
  onOpen: (appointment: TodayAppointment) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(appointment)}
      className="hover:bg-muted/40 flex min-h-[46px] w-full items-center gap-3 px-[18px] py-3 text-left transition-colors"
    >
      <span className="font-heading w-[46px] shrink-0 text-sm font-semibold tracking-[-0.02em] tabular-nums whitespace-nowrap">
        {appointment.startLabel}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold tracking-[-0.005em]">
          {appointment.patientName}
        </span>
        <span className="text-ink-3 block truncate text-[13px]">
          {appointment.serviceType ?? 'Takim'} · {appointment.durationMinutes}{' '}
          min
        </span>
      </span>
      <StatusBadge status={appointment.status} />
    </button>
  );
}
