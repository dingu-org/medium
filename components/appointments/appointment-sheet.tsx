'use client';

import { TZDate } from '@date-fns/tz';
import { CalendarDays, Check, MessageSquare, Phone, X } from 'lucide-react';
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
import { StatusPill } from '@/components/ui/status-pill';
import { Textarea } from '@/components/ui/textarea';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { formatTime, formatWeekdayDate, t } from '@/lib/i18n';
import {
  listPendingMutations,
  type PendingMutation,
  subscribeToQueueChanges,
} from '@/lib/pwa/client-store';
import { queueAppointmentMutation } from '@/lib/pwa/mutation-client';
import { ReminderBadge, StatusBadge } from './badges';
import type { AppointmentView } from './types';

type Mode = 'detail' | 'reschedule' | 'cancel';

export function AppointmentSheet({
  appointment,
  timezone,
  open,
  onOpenChange,
  remindersEnabled = false,
}: {
  appointment: AppointmentView | null;
  timezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Reminders are parked — see lib/reminders/flag.ts. The flag is server-only
   * (no `NEXT_PUBLIC_` twin), so every screen that opens this sheet reads it on
   * the server and hands it down. It defaults to the parked state so a caller
   * that cannot reach the flag fails closed, the same way the flag itself does;
   * the read models (`lib/today/queries.ts`, `lib/clients/queries.ts`) already
   * strip `appointment.reminder` while it is off, so the default only ever
   * doubles up on a gate that has already been applied to the data.
   */
  remindersEnabled?: boolean;
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
          toast.success(
            res.reason === 'offline'
              ? t.appointment.changeQueued
              : t.appointment.changeQueuedRetry,
          );
          close();
          return;
        }
        toast.error(res.error);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t.appointment.changeQueueError,
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
          toast.success(t.appointment.notesSaved);
          router.refresh();
        } else if (res.status === 'queued') {
          toast.success(
            res.reason === 'offline'
              ? t.appointment.notesQueued
              : t.appointment.notesQueuedRetry,
          );
        } else {
          toast.error(res.error);
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t.appointment.notesQueueError,
        );
      }
    });
  }

  function openReschedule() {
    setMode('reschedule');
    if (!slots) {
      if (!online) {
        toast.error(t.appointment.slotsRequireConnection);
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
          <SheetTitle className="font-heading flex items-center justify-between gap-2 pr-7 text-[19px] font-semibold tracking-[-0.02em]">
            {appointment.customerName}
            <StatusBadge status={appointment.status} />
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t.appointment.detailsTitle}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {mode === 'detail' && (
            <>
              {/* Canvas InfoCard: Manrope date, tabular time, chips row. */}
              <div className="border-line bg-card rounded-[12px] border p-4">
                <p className="font-heading text-[17px] font-semibold tracking-[-0.015em]">
                  {formatWeekdayDate(start)}
                </p>
                <p className="text-ink-2 mt-1 text-sm tabular-nums">
                  {formatTime(start)}–{formatTime(end)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {appointment.serviceType && (
                    <span className="text-ink-2 text-[13px]">
                      {appointment.serviceType}
                    </span>
                  )}
                  {remindersEnabled && (
                    <ReminderBadge reminder={appointment.reminder} />
                  )}
                  {pendingLabel && (
                    <StatusPill
                      tone={
                        appointmentMutations.some((m) => m.status === 'failed')
                          ? 'danger'
                          : 'warning'
                      }
                      mono
                    >
                      {pendingLabel}
                    </StatusPill>
                  )}
                </div>
              </div>

              {/* Canvas QuickActs: equal-width bordered tiles. */}
              <div className="flex gap-2">
                <a
                  href={`tel:${appointment.customerPhone}`}
                  className="border-line hover:bg-muted/50 bg-card flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border text-[13.5px] font-semibold transition-colors"
                >
                  <Phone className="text-primary h-4 w-4" aria-hidden="true" />
                  {t.appointment.call}
                </a>
                {appointment.customerWaId && (
                  <a
                    href={`https://wa.me/${appointment.customerWaId.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-line hover:bg-muted/50 bg-card flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border text-[13.5px] font-semibold transition-colors"
                  >
                    <WhatsAppMark size={16} />
                    {t.appointment.whatsapp}
                  </a>
                )}
                {appointment.conversationId && (
                  <Link
                    href={`/chat/${appointment.conversationId}`}
                    className="border-line hover:bg-muted/50 bg-card flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border text-[13.5px] font-semibold transition-colors"
                  >
                    <MessageSquare
                      className="text-primary h-4 w-4"
                      aria-hidden="true"
                    />
                    {t.appointment.openChat}
                  </Link>
                )}
              </div>

              <div className="pt-1">
                <label
                  htmlFor="appt-notes"
                  className="mb-2 block text-[13px] font-semibold text-[var(--neutral-700)]"
                >
                  {t.appointment.privateNote}
                </label>
                <Textarea
                  id="appt-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="min-h-[64px] resize-none rounded-[10px] text-sm"
                  placeholder={t.appointment.notePlaceholder}
                />
                {notes !== (appointment.notes ?? '') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveNotes}
                    disabled={pending}
                    className="mt-3 rounded-[10px]"
                  >
                    {t.appointment.saveNote}
                  </Button>
                )}
              </div>

              {isActive && (
                <div className="border-sep flex flex-col gap-3 border-t pt-4">
                  {ended && (
                    <Button
                      onClick={() =>
                        run(
                          {
                            action: 'transition',
                            appointmentId: appointment.id,
                            nextStatus: 'completed',
                          },
                          t.appointment.markedComplete,
                        )
                      }
                      disabled={pending}
                      className="h-12 rounded-[12px]"
                    >
                      <Check className="h-[17px] w-[17px]" aria-hidden />
                      {t.appointment.markComplete}
                    </Button>
                  )}
                  {!started && (
                    <Button
                      variant="outline"
                      onClick={openReschedule}
                      disabled={pending}
                      className="h-12 rounded-[12px]"
                    >
                      <CalendarDays
                        className="text-primary h-[17px] w-[17px]"
                        aria-hidden
                      />
                      {t.appointment.reschedule}
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
                          t.appointment.markedNoShow,
                        )
                      }
                      disabled={pending}
                      className="h-12 rounded-[12px]"
                    >
                      {t.appointment.markNoShow}
                    </Button>
                  )}
                  <Button
                    variant="ghost-danger"
                    onClick={() => setMode('cancel')}
                    disabled={pending}
                    className="h-12 rounded-[12px] bg-[var(--danger-50)]"
                  >
                    <X className="h-[17px] w-[17px]" aria-hidden />
                    {t.appointment.cancel}
                  </Button>
                </div>
              )}
            </>
          )}

          {mode === 'cancel' && (
            <div className="space-y-3">
              <p className="text-sm">{t.appointment.cancelBodyAlt}</p>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder={t.appointment.cancelReasonPlaceholder}
                className="resize-none"
              />
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setMode('detail')}
                  disabled={pending}
                >
                  {t.appointment.back}
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
                      t.appointment.cancelled,
                    )
                  }
                  disabled={pending}
                >
                  {t.appointment.cancelConfirm}
                </Button>
              </div>
            </div>
          )}

          {mode === 'reschedule' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {t.appointment.pickNewTime}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode('detail')}
                >
                  {t.appointment.back}
                </Button>
              </div>
              {slots === null ? (
                <p className="text-muted-foreground text-sm">
                  {t.appointment.loadingSlots}
                </p>
              ) : slots.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {online
                    ? t.appointment.noSlotsOnline
                    : t.appointment.noSlotsOffline}
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
                                t.appointment.rescheduled,
                              )
                            }
                            className="rounded-[10px] font-mono text-[13.5px]"
                          >
                            {formatTime(new TZDate(new Date(iso), timezone))}
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

function getPendingAppointmentLabel(
  mutations: PendingMutation[],
): string | null {
  if (mutations.length === 0) return null;
  if (mutations.some((m) => m.status === 'failed'))
    return t.appointment.syncFailed;
  const actions = new Set(
    mutations.map((m) => (m.body as { action?: unknown } | null)?.action),
  );
  if (actions.has('cancel')) return t.appointment.cancelPending;
  if (actions.has('reschedule')) return t.appointment.movePending;
  if (actions.has('notes')) return t.appointment.notesPending;
  if (actions.has('transition')) return t.appointment.statusPending;
  return t.appointment.syncPending;
}
