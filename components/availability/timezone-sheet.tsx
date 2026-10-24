'use client';

import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { t } from '@/lib/i18n';
import { DEFAULT_TIMEZONE } from '@/lib/i18n/timezone';
import { cn } from '@/lib/utils';

// Moved verbatim from the Settings availability editor (MED-121) so the
// onboarding Availability step can reuse the same timezone picker.

/** Current UTC offset label, e.g. "GMT+2". */
export function tzOffsetLabel(tz: string): string {
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
export function useTimezones(current: string): string[] {
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
    if (zones.length === 0)
      zones = [...new Set(['UTC', DEFAULT_TIMEZONE, current])];
    if (!zones.includes(current)) zones = [current, ...zones];
    return zones;
  }, [current]);
}

export function TimezoneSheet({
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
        <div className="px-4 pb-4">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.availability.timezoneSearch}
            autoFocus
          />
          <ul className="mt-3 max-h-[50dvh] divide-y divide-sep overflow-y-auto rounded-lg border border-border">
            {filtered.map((tz) => {
              const active = tz === current;
              return (
                <li key={tz}>
                  <button
                    type="button"
                    onClick={() => onPick(tz)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 active:bg-muted/60"
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
