'use client';

import { CalendarPlus, Plus, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { addBlockedPeriod } from '@/app/(dashboard)/settings/availability/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { queueAppointmentMutation } from '@/lib/pwa/mutation-client';
import { cn } from '@/lib/utils';
import type { ServiceRecord } from '@/lib/services/queries';
import { type PatientOption, searchPatients } from './actions';

type Mode = 'menu' | 'block' | 'appointment';

export function CalendarFab({
  defaultDate,
  services,
}: {
  defaultDate: string;
  services: ServiceRecord[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('menu');
  const online = useOnlineStatus();

  function reset() {
    setMode('menu');
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <SheetTrigger asChild>
        <Button
          size="icon-lg"
          className="fixed right-4 bottom-20 z-20 h-14 w-14 rounded-full shadow-lg"
          aria-label={t.calendar.addLabel}
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {mode === 'block'
              ? t.calendar.blockTime
              : mode === 'appointment'
                ? t.calendar.newAppointment
                : t.calendar.addLabel}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t.calendar.blockTime}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          {mode === 'menu' && (
            <div className="space-y-2">
              <Button
                variant="outline"
                className="h-auto w-full justify-start gap-3 py-3"
                onClick={() => setMode('appointment')}
              >
                <CalendarPlus className="h-5 w-5" aria-hidden="true" />
                <span className="text-left">
                  <span className="block font-medium">
                    {t.calendar.addApptTitle}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {t.calendar.addApptDesc}
                  </span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto w-full justify-start gap-3 py-3"
                onClick={() => setMode('block')}
              >
                <Clock className="h-5 w-5" aria-hidden="true" />
                <span className="text-left">
                  <span className="block font-medium">
                    {t.calendar.blockTime}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {t.calendar.blockTimeDesc}
                  </span>
                </span>
              </Button>
            </div>
          )}

          {mode === 'block' && (
            <BlockTimeForm
              defaultDate={defaultDate}
              online={online}
              onDone={() => {
                setOpen(false);
                reset();
                router.refresh();
              }}
            />
          )}

          {mode === 'appointment' && (
            <AppointmentForm
              defaultDate={defaultDate}
              services={services}
              online={online}
              onDone={() => {
                setOpen(false);
                reset();
                router.refresh();
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BlockTimeForm({
  defaultDate,
  online,
  onDone,
}: {
  defaultDate: string;
  online: boolean;
  onDone: () => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [label, setLabel] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!online) {
      toast.error(t.calendar.blockOnlineRequired);
      return;
    }
    startTransition(async () => {
      try {
        const res = await addBlockedPeriod({
          date,
          startTime: start,
          endTime: end,
          label: label.trim() || undefined,
        });
        if (res.ok) {
          toast.success(t.calendar.timeBlocked);
          onDone();
        } else {
          toast.error(res.error ?? t.calendar.blockOnlineError);
        }
      } catch {
        toast.error(t.calendar.blockOnlineError);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="fab-block-date">{t.calendar.blockDate}</Label>
        <Input
          id="fab-block-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="time"
          aria-label="Ora e fillimit"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-auto"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="time"
          aria-label="Ora e mbarimit"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-auto"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fab-block-label">{t.calendar.blockLabelField}</Label>
        <Input
          id="fab-block-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      {!online && (
        <p className="text-muted-foreground text-xs">
          {t.calendar.blockOnlineRequired}
        </p>
      )}
      <Button className="w-full" onClick={submit} disabled={pending || !online}>
        {pending ? t.calendar.saving : t.calendar.blockTime}
      </Button>
    </div>
  );
}

function AppointmentForm({
  defaultDate,
  services,
  online,
  onDone,
}: {
  defaultDate: string;
  services: ServiceRecord[];
  online: boolean;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientOption[]>([]);
  const [selected, setSelected] = useState<PatientOption | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('09:00');
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [searching, startSearch] = useTransition();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onQuery(value: string) {
    setQuery(value);
    setSelected(null);
    if (!online) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchPatients(value));
      });
    }, 300);
  }

  function submit() {
    if (tab === 'existing' && !selected) {
      toast.error(t.calendar.pickPatient);
      return;
    }
    if (tab === 'new' && (!newName.trim() || !newPhone.trim())) {
      toast.error(t.calendar.enterPatientDetails);
      return;
    }
    if (!serviceId) {
      toast.error('Shto ose aktivizo një shërbim para rezervimit.');
      return;
    }
    startTransition(async () => {
      try {
        const res = await queueAppointmentMutation({
          action: 'manual_book',
          patientId: tab === 'existing' ? selected?.id : undefined,
          newPatient:
            tab === 'new'
              ? { name: newName.trim(), phone: newPhone.trim() }
              : undefined,
          date,
          time,
          serviceId,
        });
        if (res.status === 'sent') {
          toast.success(t.calendar.apptBooked);
          onDone();
        } else if (res.status === 'queued') {
          toast.success(
            res.reason === 'offline'
              ? t.calendar.apptQueued
              : t.calendar.apptQueuedRetry,
          );
          onDone();
        } else {
          toast.error(res.error);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t.calendar.apptQueueError,
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="border-border inline-flex rounded-md border p-0.5">
        <button
          type="button"
          onClick={() => setTab('existing')}
          className={cn(
            'rounded px-3 py-1 text-sm',
            tab === 'existing'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground',
          )}
        >
          {t.calendar.existingPatient}
        </button>
        <button
          type="button"
          onClick={() => setTab('new')}
          className={cn(
            'rounded px-3 py-1 text-sm',
            tab === 'new'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground',
          )}
        >
          {t.calendar.newPatient}
        </button>
      </div>

      {tab === 'existing' ? (
        <div className="space-y-2">
          <Input
            placeholder={t.calendar.searchNamePhone}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            disabled={!online}
          />
          {!online && (
            <p className="text-muted-foreground text-xs">
              {t.calendar.offlineSearch}
            </p>
          )}
          {selected ? (
            <p className="text-sm">
              {t.calendar.selectedLabel}{' '}
              <span className="font-medium">{selected.name}</span>{' '}
              <button
                type="button"
                className="text-muted-foreground text-xs underline"
                onClick={() => setSelected(null)}
              >
                {t.calendar.changeLink}
              </button>
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {searching && (
                <li className="text-muted-foreground text-sm">
                  {t.calendar.searching}
                </li>
              )}
              {!searching &&
                results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      className="border-border hover:bg-muted/50 w-full rounded-md border px-3 py-2 text-left text-sm"
                    >
                      <span className="font-medium">{p.name}</span>{' '}
                      <span className="text-muted-foreground">{p.phone}</span>
                    </button>
                  </li>
                ))}
              {!searching && query && results.length === 0 && (
                <li className="text-muted-foreground text-sm">
                  {t.calendar.noMatches}
                </li>
              )}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-2">
            <Label htmlFor="fab-new-name">{t.appointment.patientName}</Label>
            <Input
              id="fab-new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fab-new-phone">{t.appointment.patientPhone}</Label>
            <Input
              id="fab-new-phone"
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+49…"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="fab-appt-date">{t.appointment.date}</Label>
        <Input
          id="fab-appt-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fab-appt-time">{t.appointment.time}</Label>
        <Input
          id="fab-appt-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-auto"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fab-appt-service">Shërbimi</Label>
        <select
          id="fab-appt-service"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
          required
        >
          <option value="" disabled>
            Zgjidh shërbimin
          </option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} · {service.durationMinutes} min
            </option>
          ))}
        </select>
      </div>
      <Button
        className="w-full"
        onClick={submit}
        disabled={pending || services.length === 0}
      >
        {pending ? t.calendar.booking : t.calendar.bookAppt}
      </Button>
    </div>
  );
}
