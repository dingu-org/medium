'use client';

import { Check, Clock, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { NavBar } from '@/components/dashboard/nav-bar';
import { AddDashed } from '@/components/settings/add-dashed';
import { OfflineNote } from '@/components/settings/offline-note';
import { SaveAction } from '@/components/settings/save-action';
import { Button } from '@/components/ui/button';
import { GroupedList, GroupedListRow } from '@/components/ui/grouped-list';
import { Input } from '@/components/ui/input';
import { SectionLabel } from '@/components/ui/section-label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  addBlockedPeriod,
  deleteBlockedPeriod,
  saveAvailability,
  saveTimezone,
} from './actions';

// Monday-first display order; values are JS getDay() (0 = Sunday). Labels via dict.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

type DayState = { enabled: boolean; start: string; end: string };

export type BlockView = { id: string; when: string; label: string | null };

function buildInitial(
  rules: { weekday: number; start: string; end: string }[],
): Record<number, DayState> {
  const byDay: Record<number, DayState> = {};
  for (const w of DAY_ORDER) {
    byDay[w] = { enabled: false, start: '09:00', end: '17:00' };
  }
  for (const r of rules) {
    byDay[r.weekday] = { enabled: true, start: r.start, end: r.end };
  }
  return byDay;
}

/** Current UTC offset label, e.g. "GMT+2". */
function tzOffsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** Full IANA zone list (huge) with the current zone guaranteed present. */
function useTimezones(current: string): string[] {
  return useMemo(() => {
    let zones: string[] = [];
    try {
      const supported = (
        Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
      ).supportedValuesOf;
      if (supported) zones = supported('timeZone');
    } catch {
      zones = [];
    }
    if (zones.length === 0) zones = ['UTC', 'Europe/Tirane', 'Europe/Berlin', current];
    if (!zones.includes(current)) zones = [current, ...zones];
    return zones;
  }, [current]);
}

export function AvailabilityEditor({
  initialRules,
  blocks,
  timezone: initialTimezone,
}: {
  initialRules: { weekday: number; start: string; end: string }[];
  blocks: BlockView[];
  timezone: string;
}) {
  const router = useRouter();
  const [days, setDays] = useState<Record<number, DayState>>(() =>
    buildInitial(initialRules),
  );
  const [timezone, setTimezone] = useState(initialTimezone);
  const [saving, startSave] = useTransition();
  const [, startMutate] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [tzOpen, setTzOpen] = useState(false);
  const online = useOnlineStatus();
  const offline = !online;

  function update(weekday: number, patch: Partial<DayState>) {
    setDays((prev) => ({ ...prev, [weekday]: { ...prev[weekday], ...patch } }));
  }

  function copyMonday() {
    const src = days[1]; // Monday, JS getDay() = 1
    setDays((prev) => {
      const next = { ...prev };
      for (const w of DAY_ORDER) {
        next[w] = { enabled: src.enabled, start: src.start, end: src.end };
      }
      return next;
    });
    toast.info(t.availability.copyMondayToast);
  }

  function onSave() {
    if (!online) return; // NavBar SaveAction is disabled offline; defensive
    const rules = DAY_ORDER.filter((w) => days[w].enabled).map((w) => ({
      weekday: w,
      start: days[w].start,
      end: days[w].end,
    }));
    if (rules.some((r) => r.end <= r.start)) {
      toast.error(t.availability.endAfterStart);
      return;
    }
    startSave(async () => {
      const res = await saveAvailability({ rules });
      if (res.ok) {
        toast.success(t.availability.savedToast);
        router.refresh();
      } else {
        toast.error(res.error ?? t.availability.savedToast);
      }
    });
  }

  function onDeleteBlock(id: string) {
    if (!online) return;
    setDeletingId(id);
    startMutate(async () => {
      await deleteBlockedPeriod(id);
      setDeletingId(null);
      router.refresh();
    });
  }

  function onPickTimezone(tz: string) {
    setTzOpen(false);
    if (tz === timezone) return;
    const prev = timezone;
    setTimezone(tz); // optimistic
    startMutate(async () => {
      const res = await saveTimezone({ timezone: tz });
      if (res.ok) {
        toast.success(t.availability.timezoneSaved);
        router.refresh();
      } else {
        setTimezone(prev);
        toast.error(t.availability.timezoneFailed);
      }
    });
  }

  return (
    <>
      <NavBar
        title={t.availability.title}
        backHref="/settings"
        right={<SaveAction onClick={onSave} disabled={saving || offline} />}
      />
      <div className="space-y-6 px-5 account-2 pb-6">
        <OfflineNote />
        <div className={cn('space-y-6', offline && 'pointer-events-none opacity-55')}>
          {/* Weekly hours */}
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <SectionLabel>{t.availability.weeklyScheduleLabel}</SectionLabel>
              <button
                type="button"
                onClick={copyMonday}
                disabled={offline}
                className="px-2 pb-[9px] text-[12.5px] font-bold text-primary disabled:opacity-40"
              >
                {t.availability.copyMonday}
              </button>
            </div>
            <GroupedList>
              {DAY_ORDER.map((w) => (
                <DayRow
                  key={w}
                  weekday={w}
                  day={days[w]}
                  online={online}
                  onToggle={(c) => update(w, { enabled: c })}
                  onStart={(v) => update(w, { start: v })}
                  onEnd={(v) => update(w, { end: v })}
                />
              ))}
            </GroupedList>
          </section>

          {/* Blocked periods */}
          <section className="space-y-2">
            <SectionLabel>{t.availability.blockedPeriods}</SectionLabel>
            {blocks.length > 0 && (
              <GroupedList>
                {blocks.map((b) => (
                  <BlockRow
                    key={b.id}
                    block={b}
                    online={online}
                    deleting={deletingId === b.id}
                    onDelete={onDeleteBlock}
                  />
                ))}
              </GroupedList>
            )}
            <AddDashed onClick={() => setBlockOpen(true)} disabled={offline}>
              {t.availability.addBlocked}
            </AddDashed>
          </section>

          {/* Timezone */}
          <GroupedList title={t.availability.timezone}>
            <GroupedListRow
              icon={Clock}
              title={timezone}
              titleWeight="medium"
              value={tzOffsetLabel(timezone)}
              onClick={() => setTzOpen(true)}
            />
          </GroupedList>
        </div>
      </div>

      <BlockSheet
        open={blockOpen}
        online={online}
        onOpenChange={setBlockOpen}
        onAdded={() => {
          setBlockOpen(false);
          router.refresh();
        }}
      />
      <TimezoneSheet
        open={tzOpen}
        current={timezone}
        onOpenChange={setTzOpen}
        onPick={onPickTimezone}
      />
    </>
  );
}

function TimeChipInput({
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  disabled: boolean;
}) {
  return (
    <input
      type="time"
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-[10px] border border-input bg-card px-[11px] py-[7px] font-mono text-[12.5px] tabular-nums text-foreground outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 disabled:opacity-40 [&::-webkit-calendar-picker-indicator]:hidden"
    />
  );
}

function DayRow({
  weekday,
  day,
  online,
  onToggle,
  onStart,
  onEnd,
}: {
  weekday: number;
  day: DayState;
  online: boolean;
  onToggle: (c: boolean) => void;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  const label = t.availability.days[weekday];
  return (
    <div className="flex items-center gap-3 px-[18px] py-[11px]">
      <Switch
        checked={day.enabled}
        disabled={!online}
        aria-label={label}
        onCheckedChange={onToggle}
      />
      <span
        className={cn(
          'flex-1 text-[14.5px] font-medium',
          day.enabled ? 'text-foreground' : 'text-ink-3',
        )}
      >
        {label}
      </span>
      {day.enabled ? (
        <div className="flex items-center gap-1.5">
          <TimeChipInput
            value={day.start}
            disabled={!online}
            ariaLabel={t.availability.startTimeAriaLabel(label)}
            onChange={onStart}
          />
          <span className="text-[12px] text-ink-3">→</span>
          <TimeChipInput
            value={day.end}
            disabled={!online}
            ariaLabel={t.availability.endTimeAriaLabel(label)}
            onChange={onEnd}
          />
        </div>
      ) : (
        <span className="text-[13px] text-ink-3">{t.availability.closed}</span>
      )}
    </div>
  );
}

function BlockRow({
  block,
  online,
  deleting,
  onDelete,
}: {
  block: BlockView;
  online: boolean;
  deleting: boolean;
  onDelete: (id: string) => void;
}) {
  const title = block.label ?? block.when; // design: label is the bold title …
  const subtitle = block.label ? block.when : null; // … when there is one; else show the date/time
  return (
    <div className="flex items-center gap-3 px-[18px] py-[13px]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold text-foreground">
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-[12.5px] tabular-nums text-ink-3">
            {subtitle}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label={t.availability.deleteBlockedAriaLabel}
        disabled={!online || deleting}
        onClick={() => onDelete(block.id)}
        className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-muted text-ink-2 disabled:opacity-40"
      >
        <X className="h-[15px] w-[15px]" aria-hidden="true" />
      </button>
    </div>
  );
}

function BlockSheet({
  open,
  online,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  online: boolean;
  onOpenChange: (o: boolean) => void;
  onAdded: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-md"
        aria-describedby={undefined}
      >
        <SheetHeader>
          <SheetTitle>{t.availability.addBlocked}</SheetTitle>
        </SheetHeader>
        <form
          key={String(open)}
          className="space-y-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!online) return;
            const f = new FormData(e.currentTarget);
            const date = String(f.get('date') ?? '');
            const startTime = String(f.get('start') ?? '');
            const endTime = String(f.get('end') ?? '');
            const label = String(f.get('label') ?? '').trim();
            if (!date) {
              toast.error(t.availability.pickDate);
              return;
            }
            if (endTime <= startTime) {
              toast.error(t.availability.endAfterStart);
              return;
            }
            start(async () => {
              const res = await addBlockedPeriod({
                date,
                startTime,
                endTime,
                label: label || undefined,
              });
              if (res.ok) {
                toast.success(t.availability.addedToast);
                onAdded();
              } else {
                toast.error(res.error ?? t.availability.addedToast);
              }
            });
          }}
        >
          <div className="flex flex-col gap-[7px]">
            <label
              htmlFor="block-date"
              className="text-[13px] font-semibold text-[#303744]"
            >
              {t.availability.addBlockDate}
            </label>
            <Input id="block-date" name="date" type="date" required disabled={!online} />
          </div>
          <div className="flex flex-col gap-[7px]">
            <span className="text-[13px] font-semibold text-[#303744]">
              {t.availability.timeRangeLabel}
            </span>
            <div className="flex items-center gap-2">
              <Input
                name="start"
                type="time"
                defaultValue="09:00"
                disabled={!online}
                aria-label={t.availability.blockStartAriaLabel}
                className="w-auto font-mono tabular-nums"
              />
              <span className="text-ink-3">→</span>
              <Input
                name="end"
                type="time"
                defaultValue="17:00"
                disabled={!online}
                aria-label={t.availability.blockEndAriaLabel}
                className="w-auto font-mono tabular-nums"
              />
            </div>
          </div>
          <div className="flex flex-col gap-[7px]">
            <label
              htmlFor="block-label"
              className="text-[13px] font-semibold text-[#303744]"
            >
              {t.availability.addBlockLabelOptional}
            </label>
            <Input
              id="block-label"
              name="label"
              maxLength={80}
              disabled={!online}
              placeholder={t.availability.addBlockLabelPlaceholder}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending || !online}>
            {pending ? t.actions.saving : t.availability.addBlocked}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function TimezoneSheet({
  open,
  current,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  current: string;
  onOpenChange: (o: boolean) => void;
  onPick: (tz: string) => void;
}) {
  const zones = useTimezones(current);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? zones.filter((z) => z.toLowerCase().includes(needle)) : zones;
  }, [zones, q]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-md"
        aria-describedby={undefined}
      >
        <SheetHeader>
          <SheetTitle>{t.availability.timezone}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.availability.timezoneSearch}
            autoFocus
          />
          <ul className="mt-3 max-h-[50vh] divide-y divide-sep overflow-y-auto rounded-lg border border-border">
            {filtered.map((tz) => {
              const active = tz === current;
              return (
                <li key={tz}>
                  <button
                    type="button"
                    onClick={() => onPick(tz)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60"
                  >
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[15px] text-foreground',
                        active && 'font-semibold',
                      )}
                    >
                      {tz}
                    </span>
                    <span className="shrink-0 font-mono text-[12.5px] text-ink-3">
                      {tzOffsetLabel(tz)}
                    </span>
                    {active && (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
