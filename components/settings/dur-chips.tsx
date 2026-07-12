'use client';

import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

const PRESETS = [30, 45, 60, 90] as const;
export const DURATION_PRESETS = PRESETS;

/** Design DurChips: preset duration chips + `Tjetër` revealing the free
 *  minutes input. Presentational — duration state is owned by the parent form. */
export function DurChips({
  minutes,
  custom,
  onPreset,
  onCustom,
  disabled,
}: {
  minutes: number;
  custom: boolean;
  onPreset: (m: number) => void;
  onCustom: () => void;
  disabled?: boolean;
}) {
  const chip = (active: boolean, extra?: string) =>
    cn(
      'rounded-[14px] border py-[11px] text-[13px] tabular-nums transition-colors disabled:opacity-40',
      active
        ? 'border-primary bg-primary font-bold text-primary-foreground'
        : 'border-input bg-card font-medium text-ink-2',
      extra,
    );
  return (
    <div className="flex gap-[7px]">
      {PRESETS.map((m) => {
        const active = !custom && minutes === m;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onPreset(m)}
            className={chip(active, 'flex-1')}
          >
            {t.settings.serviceDurationChip(m)}
          </button>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        aria-pressed={custom}
        onClick={onCustom}
        className={chip(custom, 'flex-[1.2]')}
      >
        {t.settings.serviceDurationOther}
      </button>
    </div>
  );
}
