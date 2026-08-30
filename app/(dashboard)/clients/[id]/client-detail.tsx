'use client';

import { Bell, MessageSquare, Phone, Save, User } from 'lucide-react';
import { TZDate } from '@date-fns/tz';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AppointmentSheet } from '@/components/appointments/appointment-sheet';
import { StatusBadge } from '@/components/appointments/badges';
import type { AppointmentView } from '@/components/appointments/types';
import { NavBar } from '@/components/dashboard/nav-bar';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { AppBanner } from '@/components/ui/app-banner';
import { Button } from '@/components/ui/button';
import { ChannelChip } from '@/components/ui/channel-chip';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionLabel } from '@/components/ui/section-label';
import { Textarea } from '@/components/ui/textarea';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';
import type { ClientDetailSnapshot } from '@/lib/clients/queries';
import { eraseCustomer, exportCustomer, updateClientNotes } from '../actions';
import { formatDateLong, formatMonthYear, formatTime, t } from '@/lib/i18n';
import { confirmMatches, confirmPhrase } from '@/lib/settings/confirm-phrase';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { cn } from '@/lib/utils';

export function ClientDetail({
  client,
  remindersEnabled,
}: {
  client: ClientDetailSnapshot;
  /**
   * Reminders are parked — see lib/reminders/flag.ts. Read on the server by
   * this screen's page and handed down, because the flag is server-only (no
   * `NEXT_PUBLIC_` twin). False hides every reminder surface on this screen.
   */
  remindersEnabled: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(client.notes ?? '');
  const [selected, setSelected] = useState<AppointmentView | null>(null);
  const [pending, startTransition] = useTransition();
  const [exporting, startExport] = useTransition();
  const [erasing, startErase] = useTransition();
  const [confirmText, setConfirmText] = useState('');
  // WhatsApp-derived customers are not created through the name-validating
  // action, so the name can be blank — which would otherwise arm Erase on an
  // empty input the moment the dialog opens.
  const erasePhrase = confirmPhrase(client.name);
  const online = useOnlineStatus();
  const memberSince = formatMonthYear(
    new TZDate(new Date(client.createdAt), client.timezone),
  ).toLocaleLowerCase('sq');

  function saveNotes() {
    startTransition(async () => {
      const result = await updateClientNotes(client.id, notes);
      if (!result.ok) toast.error(result.error);
      else toast.success('Shënimi u ruajt.');
    });
  }

  function onExport() {
    startExport(async () => {
      try {
        const result = await exportCustomer(client.id);
        if (!result.ok) {
          toast.error(t.clients.exportFailed);
          return;
        }
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `customer-${client.id}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
      } catch {
        toast.error(t.clients.exportFailed);
      }
    });
  }

  function onErase() {
    startErase(async () => {
      try {
        await eraseCustomer(client.id);
        toast.success(t.clients.erasedToast);
        router.push('/clients');
      } catch {
        toast.error(t.clients.eraseFailed);
      }
    });
  }

  return (
    <div>
      <RealtimeRefresher
        table="customers"
        filter={`account_id=eq.${client.accountId}`}
      />
      <RealtimeRefresher
        table="appointments"
        filter={`account_id=eq.${client.accountId}`}
      />
      <RealtimeRefresher
        table="conversations"
        filter={`account_id=eq.${client.accountId}`}
      />
      <NavBar backHref="/clients" title={client.name} />

      <div className="px-4 pt-2 pb-4">
        {/* Canvas ClientHeader: big avatar, Manrope name, mono phone. */}
        <section className="flex flex-col items-center pb-1 text-center">
          <InitialsAvatar name={client.name} size={72} />
          <h2 className="font-heading mt-3 text-[22px] font-semibold tracking-[-0.02em]">
            {client.name}
          </h2>
          <p className="text-ink-2 mt-1 font-mono text-sm tabular-nums">
            {client.phone}
          </p>
          <div className="mt-3">
            {client.manual ? (
              <ManualBadge />
            ) : (
              <ChannelChip state="connected" />
            )}
          </div>
          <p className="text-ink-3 mt-2 text-[12.5px]">
            {client.manual
              ? `Shtuar me dorë · ${memberSince}`
              : `Klient që nga ${memberSince}`}
          </p>
        </section>

        {/* Quick actions (canvas QuickActs). */}
        <div className="mt-4 flex gap-2">
          <QuickAct href={`tel:${client.phone}`} label="Telefono">
            <Phone className="h-5 w-5" aria-hidden />
          </QuickAct>
          <QuickAct
            href={
              client.manual || !client.waId
                ? undefined
                : `https://wa.me/${client.waId}`
            }
            external
            label="WhatsApp"
          >
            <WhatsAppMark size={20} />
          </QuickAct>
          <QuickAct
            href={
              client.conversationId && client.waId
                ? `/chat/${client.conversationId}`
                : undefined
            }
            label="Biseda"
          >
            <MessageSquare className="h-5 w-5" aria-hidden />
          </QuickAct>
        </div>
        {client.manual && (
          <p className="text-ink-3 mt-2 text-center text-xs">
            WhatsApp dhe biseda aktivizohen pasi klienti të të shkruajë.
          </p>
        )}

        {remindersEnabled && client.reminderOptedOutAt && (
          <AppBanner
            tone="warning"
            icon={Bell}
            title="Ç'regjistruar nga kujtesat"
            className="mt-4"
          >
            Ky klient nuk merr kujtesa automatike në WhatsApp.
          </AppBanner>
        )}

        {/* Private note (canvas NoteBlock). */}
        <section className="mt-6">
          <label
            htmlFor="client-notes"
            className="mb-2 block text-[13px] font-semibold text-[var(--neutral-700)]"
          >
            Shënim privat
          </label>
          <Textarea
            id="client-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={1000}
            placeholder="Shto një shënim privat…"
            className="min-h-[60px] text-sm"
          />
          {notes !== (client.notes ?? '') && (
            <Button
              size="sm"
              onClick={saveNotes}
              disabled={pending}
              className="mt-2"
            >
              <Save className="h-4 w-4" aria-hidden />
              Ruaj
            </Button>
          )}
        </section>

        <AppointmentList
          title="Takimet e ardhshme"
          appointments={client.upcoming}
          empty="Asnjë takim i ardhshëm."
          timezone={client.timezone}
          onOpen={setSelected}
          className="mt-6"
        />
        <AppointmentList
          title={`Historiku${client.history.length ? ` · ${client.history.length} ${client.history.length === 1 ? 'takim' : 'takime'}` : ''}`}
          appointments={client.history}
          empty="Ende pa histori takimesh."
          timezone={client.timezone}
          onOpen={setSelected}
          className="mt-6"
        />

        {/* Danger zone (canvas parity with settings/account/account-danger.tsx): export + erase. */}
        <section className="mt-6">
          <SectionLabel>{t.clients.dangerZone}</SectionLabel>
          <div className="border-line bg-card space-y-2 rounded-[12px] border p-4 shadow-[var(--shadow-card)]">
            <Button
              variant="outline"
              className="w-full"
              onClick={onExport}
              disabled={exporting || !online}
            >
              {exporting ? t.clients.exporting : t.clients.exportClient}
            </Button>

            <Dialog onOpenChange={(open) => !open && setConfirmText('')}>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={!online}
                >
                  {t.clients.erase}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t.clients.eraseTitle}</DialogTitle>
                  <DialogDescription>{t.clients.eraseBody}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="confirm-erase">
                    {t.clients.eraseTypePrompt(erasePhrase)}
                  </Label>
                  <Input
                    id="confirm-erase"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">{t.actions.cancel}</Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    onClick={onErase}
                    disabled={
                      erasing ||
                      !online ||
                      !confirmMatches(erasePhrase, confirmText)
                    }
                  >
                    {erasing ? t.clients.erasing : t.clients.eraseConfirm}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </section>
      </div>

      <AppointmentSheet
        appointment={selected}
        timezone={client.timezone}
        remindersEnabled={remindersEnabled}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}

/** Manually-added customer badge (canvas ManualBadge). */
function ManualBadge() {
  return (
    <span className="text-ink-2 inline-flex items-center gap-1 rounded-full bg-[var(--neutral-100)] px-3 py-1 text-xs font-medium">
      <User className="h-3.5 w-3.5" aria-hidden />
      Shtuar me dorë
    </span>
  );
}

/** Quick-action tile (canvas CAct) — disabled when no href. */
function QuickAct({
  href,
  external = false,
  label,
  children,
}: {
  href?: string;
  external?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const inner = (
    <>
      <span
        className={cn(!href && 'opacity-60 grayscale', href && 'text-primary')}
      >
        {children}
      </span>
      <span
        className={cn(
          'text-[12.5px] font-semibold',
          href ? 'text-foreground' : 'text-ink-3',
        )}
      >
        {label}
      </span>
    </>
  );
  const classes = cn(
    'border-line flex flex-1 flex-col items-center gap-1 rounded-[12px] border bg-card px-2 py-3',
    !href && 'opacity-60',
  );
  if (!href) {
    return (
      <span aria-disabled="true" className={classes}>
        {inner}
      </span>
    );
  }
  if (external || href.startsWith('tel:')) {
    return (
      <a
        href={href}
        target={external && !href.startsWith('tel:') ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        className={cn(classes, 'hover:bg-muted/50 transition-colors')}
      >
        {inner}
      </a>
    );
  }
  return (
    <Link
      href={href}
      className={cn(classes, 'hover:bg-muted/50 transition-colors')}
    >
      {inner}
    </Link>
  );
}

function AppointmentList({
  title,
  appointments,
  empty,
  timezone,
  onOpen,
  className,
}: {
  title: string;
  appointments: AppointmentView[];
  empty: string;
  timezone: string;
  onOpen: (appointment: AppointmentView) => void;
  className?: string;
}) {
  return (
    <section className={className}>
      <SectionLabel>{title}</SectionLabel>
      {appointments.length === 0 ? (
        <p className="text-ink-3 px-1 text-sm">{empty}</p>
      ) : (
        <div className="bg-card [&>*+*]:border-sep overflow-hidden rounded-lg shadow-[var(--shadow-card)] [&>*+*]:border-t">
          {appointments.map((appointment) => {
            const zoned = new TZDate(new Date(appointment.startsAt), timezone);
            return (
              <button
                key={appointment.id}
                type="button"
                onClick={() => onOpen(appointment)}
                className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-[14.5px] font-semibold tracking-[-0.005em]',
                      appointment.status === 'cancelled' && 'line-through',
                    )}
                  >
                    {formatDateLong(zoned)} · {formatTime(zoned)}
                  </span>
                  <span className="text-ink-3 mt-1 block truncate text-[12.5px]">
                    {appointment.serviceType ?? 'Takim'}
                  </span>
                </span>
                <StatusBadge status={appointment.status} />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
