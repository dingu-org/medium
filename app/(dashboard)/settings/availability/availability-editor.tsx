'use client';

import { Trash2, WifiOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/states';
import { AppBanner } from '@/components/ui/app-banner';
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
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { t } from '@/lib/i18n';
import {
  addBlockedPeriod,
  deleteBlockedPeriod,
  saveAvailability,
} from './actions';

// Display Monday-first; store JS getDay() numbers (0 = Sunday).
const DAYS: { weekday: number; label: string }[] = [
  { weekday: 1, label: 'E hënë' },
  { weekday: 2, label: 'E martë' },
  { weekday: 3, label: 'E mërkurë' },
  { weekday: 4, label: 'E enjte' },
  { weekday: 5, label: 'E premte' },
  { weekday: 6, label: 'E shtunë' },
  { weekday: 0, label: 'E diel' },
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
  const online = useOnlineStatus();

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
    toast.info('Orari u kopjua te të gjitha ditët aktive.');
  }

  function onSave() {
    if (!online) {
      toast.error('Disponueshmëria kërkon lidhje interneti.');
      return;
    }
    const rules = DAYS.filter((d) => days[d.weekday].enabled).map((d) => ({
      weekday: d.weekday,
      start: days[d.weekday].start,
      end: days[d.weekday].end,
    }));
    const invalid = rules.find((r) => r.end <= r.start);
    if (invalid) {
      toast.error('Ora e mbarimit duhet të jetë pas asaj të fillimit.');
      return;
    }
    startSave(async () => {
      const res = await saveAvailability({ rules });
      if (res.ok) {
        toast.success('Disponueshmëria u ruajt.');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Nuk u ruajt dot.');
      }
    });
  }

  function onAddBlock() {
    if (!online) {
      toast.error('Bllokimi i periudhave kërkon lidhje interneti.');
      return;
    }
    if (!date) {
      toast.error('Zgjidh një datë për ta bllokuar.');
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
        toast.success('Periudha u bllokua.');
        setDate('');
        setBlockLabel('');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Nuk u shtua dot periudha e bllokuar.');
      }
    });
  }

  function onDeleteBlock(id: string) {
    if (!online) {
      toast.error('Bllokimi i periudhave kërkon lidhje interneti.');
      return;
    }
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
          <CardTitle>{t.availability.daysAndHours}</CardTitle>
          <CardDescription>
            Kur mund të rezervojnë pacientët. Takimet zgjasin 60 minuta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!online && (
            <AppBanner tone="neutral" icon={WifiOff} className="rounded-[10px] text-xs">
              Ndryshimet e disponueshmërisë kërkojnë lidhje interneti.
            </AppBanner>
          )}
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
                    disabled={!online}
                    onCheckedChange={(checked) =>
                      update(weekday, { enabled: checked })
                    }
                  />
                </div>
                {day.enabled && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      aria-label={`${label} — ora e fillimit`}
                      value={day.start}
                      onChange={(e) => update(weekday, { start: e.target.value })}
                      disabled={!online}
                      className="w-auto"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      aria-label={`${label} — ora e mbarimit`}
                      value={day.end}
                      onChange={(e) => update(weekday, { end: e.target.value })}
                      disabled={!online}
                      className="w-auto"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => copyToAll(weekday)}
                      disabled={!online}
                    >
                      {t.availability.copyToAll}
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
            disabled={saving || !online}
          >
            {saving ? t.actions.saving : 'Ruaj disponueshmërinë'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.availability.blockedPeriods}</CardTitle>
          <CardDescription>
            Pushime ose kohë personale kur nuk pranon takime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!online && (
            <AppBanner tone="neutral" icon={WifiOff} className="rounded-[10px] text-xs">
              Bllokimi i periudhave kërkon lidhje interneti.
            </AppBanner>
          )}
          {blocks.length === 0 ? (
            <EmptyState title="Asnjë periudhë e bllokuar" />
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
                    aria-label="Fshi periudhën e bllokuar"
                    onClick={() => onDeleteBlock(b.id)}
                    disabled={deletingId === b.id || !online}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
            <div className="space-y-2">
              <Label htmlFor="block-date">Data</Label>
              <Input
                id="block-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={!online}
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                aria-label="Ora e fillimit"
                value={blockStart}
                onChange={(e) => setBlockStart(e.target.value)}
                disabled={!online}
                className="w-auto"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                aria-label="Ora e mbarimit"
                value={blockEnd}
                onChange={(e) => setBlockEnd(e.target.value)}
                disabled={!online}
                className="w-auto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-label">Etiketa (jo e detyrueshme)</Label>
              <Input
                id="block-label"
                value={blockLabel}
                onChange={(e) => setBlockLabel(e.target.value)}
                placeholder="p.sh. Pushim"
                disabled={!online}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onAddBlock}
              disabled={adding || !online}
            >
              {t.availability.addBlocked}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
