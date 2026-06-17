'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  addBlockedPeriod,
  deleteBlockedPeriod,
  saveAvailability,
} from './actions';

// Display Monday-first; store JS getDay() numbers (0 = Sunday).
const DAYS: { weekday: number; label: string }[] = [
  { weekday: 1, label: 'Monday' },
  { weekday: 2, label: 'Tuesday' },
  { weekday: 3, label: 'Wednesday' },
  { weekday: 4, label: 'Thursday' },
  { weekday: 5, label: 'Friday' },
  { weekday: 6, label: 'Saturday' },
  { weekday: 0, label: 'Sunday' },
];

type DayState = { enabled: boolean; start: string; end: string };

export type BlockView = { id: string; when: string; label: string | null };

function buildInitial(
  rules: { weekday: number; start: string; end: string }[],
): Record<number, DayState> {
  const byDay: Record<number, DayState> = {};
  for (const { weekday } of DAYS) {
    byDay[weekday] = { enabled: false, start: '09:00', end: '17:00' };
  }
  for (const r of rules) {
    byDay[r.weekday] = { enabled: true, start: r.start, end: r.end };
  }
  return byDay;
}

export function AvailabilityEditor({
  initialRules,
  blocks,
}: {
  initialRules: { weekday: number; start: string; end: string }[];
  blocks: BlockView[];
}) {
  const router = useRouter();
  const [days, setDays] = useState<Record<number, DayState>>(() =>
    buildInitial(initialRules),
  );
  const [saving, startSave] = useTransition();
  const [adding, startAdd] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Blocked-period form
  const [date, setDate] = useState('');
  const [blockStart, setBlockStart] = useState('09:00');
  const [blockEnd, setBlockEnd] = useState('17:00');
  const [blockLabel, setBlockLabel] = useState('');

  function update(weekday: number, patch: Partial<DayState>) {
    setDays((prev) => ({ ...prev, [weekday]: { ...prev[weekday], ...patch } }));
  }

  function copyToAll(weekday: number) {
    const source = days[weekday];
    setDays((prev) => {
      const next = { ...prev };
      for (const { weekday: w } of DAYS) {
        next[w] = { ...source, enabled: prev[w].enabled || source.enabled };
      }
      return next;
    });
    toast.info('Copied hours to all enabled days.');
  }

  function onSave() {
    const rules = DAYS.filter((d) => days[d.weekday].enabled).map((d) => ({
      weekday: d.weekday,
      start: days[d.weekday].start,
      end: days[d.weekday].end,
    }));
    const invalid = rules.find((r) => r.end <= r.start);
    if (invalid) {
      toast.error('End time must be after start time.');
      return;
    }
    startSave(async () => {
      const res = await saveAvailability({ rules });
      if (res.ok) {
        toast.success('Availability saved.');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not save.');
      }
    });
  }

  function onAddBlock() {
    if (!date) {
      toast.error('Pick a date to block.');
      return;
    }
    startAdd(async () => {
      const res = await addBlockedPeriod({
        date,
        startTime: blockStart,
        endTime: blockEnd,
        label: blockLabel.trim() || undefined,
      });
      if (res.ok) {
        toast.success('Blocked period added.');
        setDate('');
        setBlockLabel('');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not add blocked period.');
      }
    });
  }

  function onDeleteBlock(id: string) {
    setDeletingId(id);
    startAdd(async () => {
      await deleteBlockedPeriod(id);
      setDeletingId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Weekly hours</CardTitle>
          <CardDescription>
            When patients can book. Appointments are 60 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {DAYS.map(({ weekday, label }) => {
            const day = days[weekday];
            return (
              <div key={weekday} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor={`day-${weekday}`}
                    className="text-sm font-medium"
                  >
                    {label}
                  </Label>
                  <Switch
                    id={`day-${weekday}`}
                    checked={day.enabled}
                    onCheckedChange={(checked) =>
                      update(weekday, { enabled: checked })
                    }
                  />
                </div>
                {day.enabled && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      aria-label={`${label} start time`}
                      value={day.start}
                      onChange={(e) => update(weekday, { start: e.target.value })}
                      className="w-auto"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      aria-label={`${label} end time`}
                      value={day.end}
                      onChange={(e) => update(weekday, { end: e.target.value })}
                      className="w-auto"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => copyToAll(weekday)}
                    >
                      Copy to all
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            className="w-full"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save availability'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blocked periods</CardTitle>
          <CardDescription>
            Holidays or personal time when you can&apos;t take appointments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {blocks.length === 0 ? (
            <EmptyState title="No blocked periods" />
          ) : (
            <ul className="space-y-2">
              {blocks.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-2 rounded-lg border border-border p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{b.when}</p>
                    {b.label && (
                      <p className="text-xs text-muted-foreground">{b.label}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete blocked period"
                    onClick={() => onDeleteBlock(b.id)}
                    disabled={deletingId === b.id}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
            <div className="space-y-2">
              <Label htmlFor="block-date">Date</Label>
              <Input
                id="block-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                aria-label="Block start time"
                value={blockStart}
                onChange={(e) => setBlockStart(e.target.value)}
                className="w-auto"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                aria-label="Block end time"
                value={blockEnd}
                onChange={(e) => setBlockEnd(e.target.value)}
                className="w-auto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-label">Label (optional)</Label>
              <Input
                id="block-label"
                value={blockLabel}
                onChange={(e) => setBlockLabel(e.target.value)}
                placeholder="e.g. Holiday"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onAddBlock}
              disabled={adding}
            >
              Add blocked period
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
