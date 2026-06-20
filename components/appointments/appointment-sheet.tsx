'use client';

import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { MessageSquare, Phone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  getUpcomingSlots,
  type SlotsByDay,
} from '@/app/(dashboard)/calendar/actions';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import {
  listPendingMutations,
  type PendingMutation,
  subscribeToQueueChanges,
} from '@/lib/pwa/client-store';
import { queueAppointmentMutation } from '@/lib/pwa/mutation-client';
import { cn } from '@/lib/utils';
import { ReminderBadge, StatusBadge } from './badges';
import type { AppointmentView } from './types';

type Mode = 'detail' | 'reschedule' | 'cancel';

export function AppointmentSheet({
  appointment,
  timezone,
  open,
  onOpenChange,
}: {
  appointment: AppointmentView | null;
  timezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('detail');
  const [pending, startTransition] = useTransition();
  const online = useOnlineStatus();

  // Notes editing
  const [notes, setNotes] = useState('');
  // Cancel reason
  const [reason, setReason] = useState('');
  // Reschedule slots
  const [slots, setSlots] = useState<SlotsByDay[] | null>(null);
  const [localMutations, setLocalMutations] = useState<PendingMutation[]>([]);

  useEffect(() => {
    setMode('detail');
    setNotes(appointment?.notes ?? '');
    setReason('');
    setSlots(null);
  }, [appointment]);

  useEffect(() => {
    let active = true;
    async function refreshPending() {
      try {
        const items = await listPendingMutations();
        if (active) setLocalMutations(items);
      } catch {
        // IndexedDB can be blocked; action buttons still use the online path.
      }
    }
    void refreshPending();
    const unsubscribe = subscribeToQueueChanges(refreshPending);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const appointmentMutations = useMemo(() => {
    if (!appointment) return [];
    return localMutations.filter(
      (mutation) => appointmentIdFromMutation(mutation) === appointment.id,
    );
  }, [appointment, localMutations]);
  const pendingLabel = getPendingAppointmentLabel(appointmentMutations);

  if (!appointment) return null;

  const start = new TZDate(new Date(appointment.startsAt), timezone);
  const end = new TZDate(new Date(appointment.endsAt), timezone);
  const now = Date.now();
  const started = new Date(appointment.startsAt).getTime() <= now;
  const ended = new Date(appointment.endsAt).getTime() <= now;
  const isActive =
    appointment.status === 'pending' || appointment.status === 'confirmed';

  function close() {
    onOpenChange(false);
  }

  function run(
    input: Parameters<typeof queueAppointmentMutation>[0],
    successMsg: string,
  ) {
    startTransition(async () => {
      try {
        const res = await queueAppointmentMutation(input);
        if (res.status === 'sent') {
          toast.success(successMsg);
          router.refresh();
          close();
          return;
        }
        if (res.status === 'queued') {
          toast.success('Change queued. It will sync when you’re online.');
          close();
          return;
        }
        toast.error(res.error);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not queue change.',
        );
      }
    });
  }

  function saveNotes() {
    const id = appointment!.id;
    startTransition(async () => {
      try {
        const res = await queueAppointmentMutation({
          action: 'notes',
          appointmentId: id,
          notes,
        });
        if (res.status === 'sent') {
          toast.success('Notes saved.');
          router.refresh();
        } else if (res.status === 'queued') {
          toast.success('Notes queued. They will sync when you’re online.');
        } else {
          toast.error(res.error);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not queue notes.',
        );
      }
    });
  }

  function openReschedule() {
    setMode('reschedule');
    if (!slots) {
      if (!online) {
        toast.error('Loading available slots requires a connection.');
        setSlots([]);
        return;
      }
      startTransition(async () => {
        const res = await getUpcomingSlots();
        setSlots(res.days);
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-2">
            {appointment.patientName}
            <StatusBadge status={appointment.status} />
          </SheetTitle>
          <SheetDescription className="sr-only">
            Appointment details
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {mode === 'detail' && (
            <>
              <div className="rounded-lg border border-border p-3">
                <p className="text-lg font-semibold">
                  {format(start, 'EEEE d MMM')}
                </p>
                <p className="text-muted-foreground">
                  {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {appointment.serviceType && (
                    <span className="text-sm text-muted-foreground">
                      {appointment.serviceType}
                    </span>
                  )}
                  <ReminderBadge reminder={appointment.reminder} />
                  {pendingLabel && (
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                        appointmentMutations.some((m) => m.status === 'failed')
                          ? 'border-destructive/30 bg-destructive/10 text-destructive'
                          : 'border-amber-200 bg-amber-50 text-amber-800',
                      )}
                    >
                      {pendingLabel}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={`tel:${appointment.patientPhone}`}>
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    Call
                  </a>
                </Button>
                {appointment.patientWaId && (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`https://wa.me/${appointment.patientWaId.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageSquare className="h-4 w-4" aria-hidden="true" />
                      WhatsApp
                    </a>
                  </Button>
                )}
                {appointment.conversationId && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/chat/${appointment.conversationId}`}>
                      Open chat
                    </Link>
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="appt-notes" className="text-sm font-medium">
                  Notes
                </label>
                <textarea
                  id="appt-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Add a private note…"
                />
                {notes !== (appointment.notes ?? '') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={saveNotes}
                    disabled={pending}
                  >
                    Save notes
                  </Button>
                )}
              </div>

              {isActive && (
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  {!started && (
                    <Button
                      variant="outline"
                      onClick={openReschedule}
                      disabled={pending}
                    >
                      Reschedule
                    </Button>
                  )}
                  {ended && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        run(
                          {
                            action: 'transition',
                            appointmentId: appointment.id,
                            nextStatus: 'completed',
                          },
                          'Marked complete.',
                        )
                      }
                      disabled={pending}
                    >
                      Mark complete
                    </Button>
                  )}
                  {started && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        run(
                          {
                            action: 'transition',
                            appointmentId: appointment.id,
                            nextStatus: 'no_show',
                          },
                          'Marked as no-show.',
                        )
                      }
                      disabled={pending}
                    >
                      Mark no-show
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={() => setMode('cancel')}
                    disabled={pending}
                  >
                    Cancel appointment
                  </Button>
                </div>
              )}
            </>
          )}

          {mode === 'cancel' && (
            <div className="space-y-3">
              <p className="text-sm">
                Cancel this appointment? The patient will be notified.
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Reason (optional)"
                className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setMode('detail')}
                  disabled={pending}
                >
                  Back
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() =>
                    run(
                      {
                        action: 'cancel',
                        appointmentId: appointment.id,
                        reason,
                      },
                      'Appointment cancelled.',
                    )
                  }
                  disabled={pending}
                >
                  Confirm cancel
                </Button>
              </div>
            </div>
          )}

          {mode === 'reschedule' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Pick a new time</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode('detail')}
                >
                  Back
                </Button>
              </div>
              {slots === null ? (
                <p className="text-sm text-muted-foreground">Loading slots…</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {online
                    ? 'No free slots in the next 14 days. Check your availability.'
                    : 'Reconnect to load available slots.'}
                </p>
              ) : (
                <div className="space-y-4">
                  {slots.map((day) => (
                    <div key={day.date} className="space-y-2">
                      <p className="text-sm font-medium">{day.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {day.slots.map((iso) => (
                          <Button
                            key={iso}
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              run(
                                {
                                  action: 'reschedule',
                                  appointmentId: appointment.id,
                                  newStartsAt: iso,
                                },
                                'Appointment rescheduled.',
                              )
                            }
                          >
                            {format(new TZDate(new Date(iso), timezone), 'HH:mm')}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function appointmentIdFromMutation(mutation: PendingMutation): string | null {
  if (!mutation.type.startsWith('appointment.')) return null;
  const body = mutation.body as { appointmentId?: unknown } | null;
  return typeof body?.appointmentId === 'string' ? body.appointmentId : null;
}

function getPendingAppointmentLabel(mutations: PendingMutation[]): string | null {
  if (mutations.length === 0) return null;
  if (mutations.some((m) => m.status === 'failed')) return 'Sync failed';
  const actions = new Set(
    mutations.map((m) => (m.body as { action?: unknown } | null)?.action),
  );
  if (actions.has('cancel')) return 'Cancel pending';
  if (actions.has('reschedule')) return 'Move pending';
  if (actions.has('notes')) return 'Notes pending';
  if (actions.has('transition')) return 'Status pending';
  return 'Sync pending';
}
