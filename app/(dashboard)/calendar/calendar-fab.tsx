'use client';

import { CalendarPlus, Plus, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import { cn } from '@/lib/utils';
import {
  bookManualAppointment,
  type PatientOption,
  searchPatients,
} from './actions';

type Mode = 'menu' | 'block' | 'appointment';

export function CalendarFab({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('menu');

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
          className="fixed bottom-20 right-4 z-20 h-14 w-14 rounded-full shadow-lg"
          aria-label="Add"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {mode === 'block'
              ? 'Block time'
              : mode === 'appointment'
                ? 'New appointment'
                : 'Add'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Block time or add an appointment
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
                  <span className="block font-medium">Add appointment</span>
                  <span className="block text-xs text-muted-foreground">
                    Manually book for a patient
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
                  <span className="block font-medium">Block time</span>
                  <span className="block text-xs text-muted-foreground">
                    Holidays or personal time
                  </span>
                </span>
              </Button>
            </div>
          )}

          {mode === 'block' && (
            <BlockTimeForm
              defaultDate={defaultDate}
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
  onDone,
}: {
  defaultDate: string;
  onDone: () => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [label, setLabel] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await addBlockedPeriod({
        date,
        startTime: start,
        endTime: end,
        label: label.trim() || undefined,
      });
      if (res.ok) {
        toast.success('Time blocked.');
        onDone();
      } else {
        toast.error(res.error ?? 'Could not block time.');
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="fab-block-date">Date</Label>
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
          aria-label="Start time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-auto"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="time"
          aria-label="End time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-auto"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fab-block-label">Label (optional)</Label>
        <Input
          id="fab-block-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Lunch"
        />
      </div>
      <Button className="w-full" onClick={submit} disabled={pending}>
        {pending ? 'Saving…' : 'Block time'}
      </Button>
    </div>
  );
}

function AppointmentForm({
  defaultDate,
  onDone,
}: {
  defaultDate: string;
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
  const [serviceType, setServiceType] = useState('');
  const [searching, startSearch] = useTransition();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onQuery(value: string) {
    setQuery(value);
    setSelected(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchPatients(value));
      });
    }, 300);
  }

  function submit() {
    if (tab === 'existing' && !selected) {
      toast.error('Pick a patient.');
      return;
    }
    if (tab === 'new' && (!newName.trim() || !newPhone.trim())) {
      toast.error('Enter the patient name and phone.');
      return;
    }
    startTransition(async () => {
      const res = await bookManualAppointment({
        patientId: tab === 'existing' ? selected?.id : undefined,
        newPatient:
          tab === 'new'
            ? { name: newName.trim(), phone: newPhone.trim() }
            : undefined,
        date,
        time,
        serviceType: serviceType.trim() || undefined,
      });
      if (res.ok) {
        toast.success('Appointment booked.');
        onDone();
      } else {
        toast.error(res.error ?? 'Could not book.');
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border border-border p-0.5">
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
          Existing patient
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
          New patient
        </button>
      </div>

      {tab === 'existing' ? (
        <div className="space-y-2">
          <Input
            placeholder="Search name or phone…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
          {selected ? (
            <p className="text-sm">
              Selected: <span className="font-medium">{selected.name}</span>{' '}
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => setSelected(null)}
              >
                change
              </button>
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {searching && (
                <li className="text-sm text-muted-foreground">Searching…</li>
              )}
              {!searching &&
                results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/50"
                    >
                      <span className="font-medium">{p.name}</span>{' '}
                      <span className="text-muted-foreground">{p.phone}</span>
                    </button>
                  </li>
                ))}
              {!searching && query && results.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No matches — try “New patient”.
                </li>
              )}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-2">
            <Label htmlFor="fab-new-name">Name</Label>
            <Input
              id="fab-new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fab-new-phone">Phone</Label>
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
        <Label htmlFor="fab-appt-date">Date</Label>
        <Input
          id="fab-appt-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fab-appt-time">Time</Label>
        <Input
          id="fab-appt-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-auto"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fab-appt-service">Service (optional)</Label>
        <Input
          id="fab-appt-service"
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value)}
          placeholder="e.g. Physio session"
        />
      </div>
      <Button className="w-full" onClick={submit} disabled={pending}>
        {pending ? 'Booking…' : 'Book appointment'}
      </Button>
    </div>
  );
}
