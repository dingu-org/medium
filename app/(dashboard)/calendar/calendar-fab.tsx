'use client';

import { CalendarPlus, ChevronRight, Plus, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import { type CustomerOption, searchCustomers } from './actions';

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
          className="fixed right-[18px] bottom-28 z-20 h-[58px] w-[58px] rounded-full shadow-[0_14px_30px_-10px_rgb(59_91_254_/_55%)]"
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
            <div className="space-y-2.5">
              <MenuItem
                icon={CalendarPlus}
                title={t.calendar.addApptTitle}
                sub={t.calendar.addApptDesc}
                onClick={() => setMode('appointment')}
              />
              <MenuItem
                icon={Clock}
                title={t.calendar.blockTime}
                sub={t.calendar.blockTimeDesc}
                onClick={() => setMode('block')}
              />
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
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [selected, setSelected] = useState<CustomerOption | null>(null);
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
        setResults(await searchCustomers(value));
      });
    }, 300);
  }

  function submit() {
    if (tab === 'existing' && !selected) {
      toast.error(t.calendar.pickCustomer);
      return;
    }
    if (tab === 'new' && (!newName.trim() || !newPhone.trim())) {
      toast.error(t.calendar.enterCustomerDetails);
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
          customerId: tab === 'existing' ? selected?.id : undefined,
          newCustomer:
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
          {t.calendar.existingCustomer}
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
          {t.calendar.newCustomer}
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
            <Label htmlFor="fab-new-name">{t.appointment.customerName}</Label>
            <Input
              id="fab-new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fab-new-phone">{t.appointment.customerPhone}</Label>
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

/** FAB menu row (canvas MenuItem): brandTint icon tile + title/sub + chevron. */
function MenuItem({
  icon: Icon,
  title,
  sub,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-line hover:bg-muted/50 flex w-full items-center gap-[13px] rounded-[12px] border bg-card px-4 py-3.5 text-left transition-colors"
    >
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--brand-50)]">
        <Icon className="text-primary h-[19px] w-[19px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="text-ink-3 mt-0.5 block text-[12.5px]">{sub}</span>
      </span>
      <ChevronRight className="text-ink-3/70 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
    </button>
  );
}
