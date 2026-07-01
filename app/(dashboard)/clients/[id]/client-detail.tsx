'use client';

import { ArrowLeft, MessageSquare, Phone, Save } from 'lucide-react';
import { TZDate } from '@date-fns/tz';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AppointmentSheet } from '@/components/appointments/appointment-sheet';
import { StatusBadge } from '@/components/appointments/badges';
import type { AppointmentView } from '@/components/appointments/types';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { AppBanner } from '@/components/ui/app-banner';
import { Button } from '@/components/ui/button';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import { Textarea } from '@/components/ui/textarea';
import type { ClientDetailSnapshot } from '@/lib/clients/queries';
import { updateClientNotes } from '../actions';
import { formatDateLong, formatMonthYear, formatTime } from '@/lib/i18n';

export function ClientDetail({ client }: { client: ClientDetailSnapshot }) {
  const [notes, setNotes] = useState(client.notes ?? '');
  const [selected, setSelected] = useState<AppointmentView | null>(null);
  const [pending, startTransition] = useTransition();
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

  return (
    <div className="space-y-6">
      <RealtimeRefresher table="patients" filter={`pt_id=eq.${client.ptId}`} />
      <RealtimeRefresher
        table="appointments"
        filter={`pt_id=eq.${client.ptId}`}
      />
      <RealtimeRefresher
        table="conversations"
        filter={`pt_id=eq.${client.ptId}`}
      />
      <header className="flex items-center gap-3">
        <Button asChild size="icon-sm" variant="ghost">
          <Link href="/clients" aria-label="Kthehu te klientët">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Detajet e klientit</h1>
      </header>

      <section className="text-center">
        <InitialsAvatar name={client.name} size={64} className="mx-auto" />
        <h2 className="mt-3 text-xl font-semibold">{client.name}</h2>
        <p className="text-muted-foreground mt-1 font-mono text-sm">
          {client.phone}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Klient që nga {memberSince} ·{' '}
          {client.manual ? 'Shtuar me dorë' : 'WhatsApp'}
        </p>
      </section>

      {client.reminderOptedOutAt && (
        <AppBanner tone="warning">
          Ç&apos;regjistruar nga kujtesat. Ky klient nuk merr mesazhe kujtese.
        </AppBanner>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button asChild variant="outline" className="h-14 flex-col gap-1">
          <a href={`tel:${client.phone}`}>
            <Phone className="h-4 w-4" aria-hidden />
            <span className="text-xs">Telefono</span>
          </a>
        </Button>
        <Button
          asChild={!client.manual}
          variant="outline"
          className="h-14 flex-col gap-1"
          disabled={client.manual}
        >
          {client.manual ? (
            <span>
              <MessageSquare className="mx-auto h-4 w-4" aria-hidden />
              <span className="mt-1 block text-xs">WhatsApp</span>
            </span>
          ) : (
            <a
              href={`https://wa.me/${client.waId}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              <span className="text-xs">WhatsApp</span>
            </a>
          )}
        </Button>
        <Button
          asChild={Boolean(client.conversationId && client.waId)}
          variant="outline"
          className="h-14 flex-col gap-1"
          disabled={!client.conversationId || !client.waId}
        >
          {client.conversationId && client.waId ? (
            <Link href={`/chat/${client.conversationId}`}>
              <MessageSquare className="h-4 w-4" aria-hidden />
              <span className="text-xs">Biseda</span>
            </Link>
          ) : (
            <span>
              <MessageSquare className="mx-auto h-4 w-4" aria-hidden />
              <span className="mt-1 block text-xs">Biseda</span>
            </span>
          )}
        </Button>
      </div>
      {client.manual && (
        <p className="text-muted-foreground text-center text-xs">
          WhatsApp dhe biseda aktivizohen pasi klienti të të shkruajë.
        </p>
      )}

      <section className="space-y-2">
        <label
          htmlFor="client-notes"
          className="text-muted-foreground text-xs font-semibold uppercase"
        >
          Shënim privat
        </label>
        <Textarea
          id="client-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={1000}
          placeholder="Vetëm ti mund ta shohësh këtë shënim."
        />
        {notes !== (client.notes ?? '') && (
          <Button size="sm" onClick={saveNotes} disabled={pending}>
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
      />
      <AppointmentList
        title="Historiku"
        appointments={client.history}
        empty="Ende pa histori takimesh."
        timezone={client.timezone}
        onOpen={setSelected}
      />

      <AppointmentSheet
        appointment={selected}
        timezone={client.timezone}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}

function AppointmentList({
  title,
  appointments,
  empty,
  timezone,
  onOpen,
}: {
  title: string;
  appointments: AppointmentView[];
  empty: string;
  timezone: string;
  onOpen: (appointment: AppointmentView) => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground text-xs font-semibold uppercase">
        {title}
      </h3>
      {appointments.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <div className="border-border bg-card overflow-hidden rounded-md border">
          {appointments.map((appointment) => (
            <button
              key={appointment.id}
              type="button"
              onClick={() => onOpen(appointment)}
              className="border-border hover:bg-muted/50 flex min-h-14 w-full items-center gap-3 border-b px-4 py-3 text-left last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {(() => {
                    const zoned = new TZDate(
                      new Date(appointment.startsAt),
                      timezone,
                    );
                    return `${formatDateLong(zoned)}, ${formatTime(zoned)}`;
                  })()}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {appointment.serviceType ?? 'Takim'}
                </span>
              </span>
              <StatusBadge status={appointment.status} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
