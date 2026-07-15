'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { BillingPeriod } from '@/lib/billing/payments';
import { Button } from '@/components/ui/button';
import { formatLek, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { createCheckoutAction } from './actions';

/**
 * Upgrade to Solo via POK. This is a REDIRECT flow (POK has no embeddable SDK for
 * us): pick a period → createCheckoutAction creates the order and returns POK's
 * hosted payment-page URL → we send the customer there. POK captures on its page
 * and redirects back to /settings/billing?orderId=…, where the page settles the
 * order server-side (the authoritative re-fetch). The hourly reconcile cron is
 * the safety net if the customer never returns.
 */
export function CheckoutForm({
  price,
}: {
  price: { monthly: number; yearly: number };
}) {
  const [period, setPeriod] = useState<BillingPeriod>('yearly');
  const [pending, startTransition] = useTransition();

  function startCheckout() {
    startTransition(async () => {
      try {
        const { confirmUrl } = await createCheckoutAction(period);
        // Hand off to POK's hosted payment page.
        window.location.href = confirmUrl;
      } catch {
        toast.error(t.billing.checkoutFailed);
      }
    });
  }

  const monthlyLabel = t.billing.priceMonthly(formatLek(price.monthly));
  const yearlyLabel = t.billing.priceYearly(formatLek(price.yearly));

  return (
    <div className="space-y-4">
      {/* Period picker — annual favored ("2 muaj falas"). */}
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        <PeriodOption
          selected={period === 'monthly'}
          onSelect={() => setPeriod('monthly')}
          label={t.billing.periodMonthly}
          price={monthlyLabel}
        />
        <PeriodOption
          selected={period === 'yearly'}
          onSelect={() => setPeriod('yearly')}
          label={t.billing.periodYearly}
          price={yearlyLabel}
          badge={t.billing.twoMonthsFree}
        />
      </div>

      <p className="text-ink-3 text-[12.5px]">{t.billing.vatNote}</p>

      <Button className="w-full" disabled={pending} onClick={startCheckout}>
        {t.billing.payCta}
      </Button>
    </div>
  );
}

function PeriodOption({
  selected,
  onSelect,
  label,
  price,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  price: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'relative rounded-lg border p-3 text-left transition-colors',
        selected
          ? 'border-[var(--brand-500)] bg-[var(--brand-50)]'
          : 'border-border bg-card',
      )}
    >
      <span className="text-[13.5px] font-semibold text-foreground">
        {label}
      </span>
      <span className="text-ink-2 mt-0.5 block text-[13px] tabular-nums">
        {price}
      </span>
      {badge && (
        <span className="mt-1.5 inline-block rounded-full bg-[var(--brand-500)] px-2 py-0.5 text-[10.5px] font-semibold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
