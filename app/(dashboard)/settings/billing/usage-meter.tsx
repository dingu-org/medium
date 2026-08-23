import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { BillingUsageMeter } from '@/lib/billing/read-model';

/**
 * A labeled monthly-usage bar (Phase 16 C6). Presentational — the ≥80% warning
 * tone comes precomputed on the meter. Caps are shown as capacity, never as an
 * error: an at-cap bar is full and amber, not red.
 */
export function UsageMeter({
  label,
  meter,
}: {
  label: string;
  meter: BillingUsageMeter;
}) {
  const pct =
    meter.limit > 0 ? Math.min(100, Math.round((meter.used / meter.limit) * 100)) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[13.5px] font-semibold text-foreground">
          {label}
        </span>
        <span className="text-[13px] text-ink-2 tabular-nums">
          {t.billing.meterValue(meter.used, meter.limit)}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={meter.used}
        aria-valuemin={0}
        aria-valuemax={meter.limit}
        aria-label={label}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            meter.warn ? 'bg-[var(--warning-500)]' : 'bg-[var(--brand-500)]',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {meter.warn && (
        <p className="text-[12px] text-[var(--warning-600)]">
          {t.billing.meterWarn}
        </p>
      )}
    </div>
  );
}
