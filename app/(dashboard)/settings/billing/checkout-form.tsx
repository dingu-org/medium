'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type {
  ApplyOrderResult,
  BillingPeriod,
} from '@/lib/billing/payments';
import { Button } from '@/components/ui/button';
import { formatLek, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { confirmCheckoutAction, createCheckoutAction } from './actions';

/**
 * The POK live-payment step is GATED OFF (Phase 16 C6, orchestrator ruling 1).
 * The staging spike could not authenticate against POK, so three things are
 * still unverified: the merchant credentials, the `@nebula-ltd/pok-payments-js`
 * GuestCheckoutForm package, and the minor-unit factor (`ALL_MINOR_FACTOR` in
 * lib/billing/payments.ts). Until `pnpm smoke:pok` confirms all three, no real
 * charge path may render.
 *
 * TODO(pok-spike): once creds + package + factor are confirmed —
 *   1. `pnpm add @nebula-ltd/pok-payments-js`
 *   2. mount <GuestCheckoutForm orderId={pokOrderId} onSuccess={onPaid} /> in the
 *      seam below (replacing the disabled "coming soon" panel), and
 *   3. flip this flag to `true`.
 * The full flow around this seam (period picker → createCheckoutAction →
 * confirmCheckoutAction → applied/pending/failed) is already built and its
 * server actions are tested against the mocked POK client.
 */
const LIVE_PAYMENTS_ENABLED = false;

type Phase = 'picking' | 'paying' | 'confirming';

export function CheckoutForm({
  price,
}: {
  price: { monthly: number; yearly: number };
}) {
  const [period, setPeriod] = useState<BillingPeriod>('yearly');
  const [phase, setPhase] = useState<Phase>('picking');
  const [pokOrderId, setPokOrderId] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyOrderResult | null>(null);
  const [pending, startTransition] = useTransition();

  /** Step 1: create the POK order, then hand off to the (gated) payment step. */
  function startCheckout() {
    startTransition(async () => {
      try {
        const { pokOrderId: id } = await createCheckoutAction(period);
        setPokOrderId(id);
        setPhase('paying');
      } catch {
        toast.error(t.billing.checkoutFailed);
      }
    });
  }

  /**
   * Step 3: settle after the (deferred) GuestCheckoutForm reports success.
   * Server-side truth: confirmCheckoutAction re-fetches the authoritative order.
   * Only an 'applied' result is celebrated; 'pending' renders gracefully and
   * never claims success.
   */
  function onPaid(orderId: string) {
    setPhase('confirming');
    startTransition(async () => {
      const outcome = await confirmCheckoutAction(orderId);
      setResult(outcome);
      setPhase('picking');
      if (outcome === 'applied') toast.success(t.billing.checkoutApplied);
      else if (outcome === 'failed') toast.error(t.billing.checkoutFailed);
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

      {/* Result banners from a prior attempt. */}
      {result === 'pending' && (
        <StateBanner tone="warning">{t.billing.checkoutPending}</StateBanner>
      )}
      {result === 'failed' && (
        <StateBanner tone="error">{t.billing.checkoutFailed}</StateBanner>
      )}

      {/* The payment step. LIVE path is gated; see LIVE_PAYMENTS_ENABLED. */}
      {LIVE_PAYMENTS_ENABLED ? (
        phase === 'paying' && pokOrderId ? (
          <PaymentSeam pokOrderId={pokOrderId} onPaid={onPaid} />
        ) : (
          <Button
            className="w-full"
            disabled={pending || phase === 'confirming'}
            onClick={startCheckout}
          >
            {t.billing.payCta}
          </Button>
        )
      ) : (
        <ComingSoonSeam />
      )}
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

/**
 * The gated payment seam. The real POK GuestCheckoutForm mounts here once the
 * spike unblocks (see the module-level TODO). Today it is a disabled panel so
 * no charge can be initiated.
 */
function ComingSoonSeam() {
  return (
    <div className="border-border bg-muted/40 rounded-lg border border-dashed p-4">
      <p className="text-[13.5px] font-semibold text-foreground">
        {t.billing.paymentsComingSoonTitle}
      </p>
      <p className="text-ink-2 mt-1 text-[13px] leading-5">
        {t.billing.paymentsComingSoonBody}
      </p>
    </div>
  );
}

/**
 * Live payment seam (only reachable when LIVE_PAYMENTS_ENABLED). This is where
 * <GuestCheckoutForm> plugs in; for now it exposes the onSuccess wiring only.
 * TODO(pok-spike): replace the placeholder with the real embedded form.
 */
function PaymentSeam({
  pokOrderId,
  onPaid,
}: {
  pokOrderId: string;
  onPaid: (orderId: string) => void;
}) {
  return (
    <div className="border-border rounded-lg border p-4">
      <p className="text-ink-2 text-[13px]">
        {t.billing.paymentsComingSoonBody}
      </p>
      {/* GuestCheckoutForm goes here: onSuccess={() => onPaid(pokOrderId)} */}
      <Button
        className="mt-3 w-full"
        onClick={() => onPaid(pokOrderId)}
        disabled
      >
        {t.billing.payCta}
      </Button>
    </div>
  );
}

function StateBanner({
  tone,
  children,
}: {
  tone: 'warning' | 'error';
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        'rounded-lg px-3 py-2 text-[13px]',
        tone === 'warning'
          ? 'bg-[var(--warning-50)] text-[var(--warning-700)]'
          : 'bg-destructive/10 text-destructive',
      )}
    >
      {children}
    </p>
  );
}
