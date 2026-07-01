'use client';

import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronRight,
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
import { queueAppointmentMutation } from '@/lib/pwa/mutation-client';
import type { TodayAppointment, TodaySnapshot } from '@/lib/today/queries';
import { formatWeekdayDate } from '@/lib/i18n';

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
    <div className="space-y-6">
      <SnapshotCache cacheKey="today" kind="today" payload={snapshot} />
      <RealtimeRefresher
        table="appointments"
        filter={`pt_id=eq.${snapshot.ptId}`}
      />
      <RealtimeRefresher
        table="conversations"
        filter={`pt_id=eq.${snapshot.ptId}`}
      />
      <RealtimeRefresher
        table="reminder_jobs"
        filter={`pt_id=eq.${snapshot.ptId}`}
      />

      <header>
        <p className="text-muted-foreground text-sm">{dateLabel}</p>
      </header>

      {quiet ? (
        <>
          <div className="flex items-center gap-3 rounded-md border border-[var(--success-200)] bg-[var(--success-50)] p-4 text-[var(--success-700)]">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white">
              <Check className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">Asgjë s&apos;kërkon ty</p>
              <p className="text-sm opacity-80">
                Medium po i mban të gjitha bisedat.
              </p>
            </div>
          </div>
          <div className="py-7 text-center">
            <span className="bg-muted text-muted-foreground mx-auto flex h-14 w-14 items-center justify-center rounded-full">
              <CalendarDays className="h-7 w-7" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Asnjë takim sot</h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-xs text-sm">
              Dita është e lirë. Shiko javën që vjen ose pusho, Medium të
              mbulon.
            </p>
            <Button asChild variant="secondary" className="mt-4">
              <Link href="/calendar">Shiko javën</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          {snapshot.attention.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-[var(--attention-700)] uppercase">
                Kërkon vëmendjen tënde
              </h2>
              {snapshot.attention.map((item) => (
                <div
                  key={`${item.kind}-${item.patientId}`}
                  className="border-border bg-card rounded-md border p-4 shadow-[var(--shadow-card)]"
                >
                  <div className="flex gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--attention-100)] text-[var(--attention-700)]">
                      {item.kind === 'escalation' ? (
                        <AlertCircle className="h-5 w-5" aria-hidden />
                      ) : (
                        <Clock className="h-5 w-5" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {item.kind === 'escalation'
                          ? `${item.patientName} kërkon ndihmën tënde`
                          : `${item.patientName} nuk iu përgjigj kujtesës`}
                      </p>
                      {item.appointment && (
                        <p className="text-muted-foreground mt-1 text-sm">
                          {item.appointment.startLabel} ·{' '}
                          {item.appointment.serviceType}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {item.conversationId && (
                      <Button asChild className="flex-1">
                        <Link href={`/chat/${item.conversationId}`}>
                          <MessageSquare className="h-4 w-4" aria-hidden />
                          Shkruaji
                        </Link>
                      </Button>
                    )}
                    {item.appointment && (
                      <Button
                        variant="outline"
                        onClick={() => cancel(item.appointment!.id)}
                        disabled={pending}
                      >
                        Anulo
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}

          {snapshot.next && (
            <section className="space-y-2">
              <h2 className="text-muted-foreground text-xs font-semibold uppercase">
                Më pas
              </h2>
              <AppointmentRow
                appointment={snapshot.next}
                prominent
                onOpen={setSelected}
              />
            </section>
          )}

          {snapshot.later.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-muted-foreground text-xs font-semibold uppercase">
                Më vonë sot
              </h2>
              <div className="border-border bg-card overflow-hidden rounded-md border">
                {snapshot.later.map((appointment) => (
                  <AppointmentRow
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

      <Link
        href="/chat"
        className="border-border bg-card flex min-h-12 items-center gap-3 rounded-md border px-4 py-3 text-sm shadow-[var(--shadow-card)]"
      >
        <span className="bg-primary h-2.5 w-2.5 rounded-full" />
        <span className="text-muted-foreground flex-1">
          Medium po menaxhon{' '}
          <strong className="text-foreground">
            {snapshot.managedConversationCount} biseda
          </strong>
        </span>
        <ChevronRight className="text-muted-foreground h-4 w-4" aria-hidden />
      </Link>

      <AppointmentSheet
        appointment={selected}
        timezone={snapshot.timezone}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}

function AppointmentRow({
  appointment,
  prominent = false,
  onOpen,
}: {
  appointment: TodayAppointment;
  prominent?: boolean;
  onOpen: (appointment: TodayAppointment) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(appointment)}
      className={`bg-card hover:bg-muted/50 flex w-full items-center gap-3 px-4 text-left ${prominent ? 'border-border rounded-md border py-4 shadow-[var(--shadow-card)]' : 'border-border min-h-16 border-b py-3 last:border-b-0'}`}
    >
      <span
        className={
          prominent
            ? 'text-2xl font-semibold tabular-nums'
            : 'w-12 font-semibold tabular-nums'
        }
      >
        {appointment.startLabel}
      </span>
      <span className="h-10 w-0.5 rounded-full bg-[var(--success-500)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {appointment.patientName}
        </span>
        <span className="text-muted-foreground block truncate text-sm">
          {appointment.serviceType ?? 'Takim'} · {appointment.durationMinutes}{' '}
          min
        </span>
      </span>
      <StatusBadge status={appointment.status} />
    </button>
  );
}
