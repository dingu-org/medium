import { TZDate } from '@date-fns/tz';
import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { NavBar } from '@/components/dashboard/nav-bar';
import {
  applyOrderOutcome,
  type ApplyOrderResult,
} from '@/lib/billing/payments';
import {
  checkoutBannerTone,
  getBillingSnapshot,
  resolveCheckoutSlot,
  type BillingReceipt,
} from '@/lib/billing/read-model';
import { db } from '@/lib/db';
import { billingOrders } from '@/lib/db/schema';
import { formatDate, formatLek, t } from '@/lib/i18n';
import { createServerClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { CheckoutForm } from './checkout-form';
import { PlanCard } from './plan-card';
import { UsageMeter } from './usage-meter';

export const metadata = { title: `${t.billing.navTitle} · Medium` };

const PERIOD_LABEL = {
  monthly: t.billing.periodMonthly,
  yearly: t.billing.periodYearly,
} as const;

const CHECKOUT_COPY = {
  upgrade: { title: t.billing.upgradeTitle, sub: t.billing.upgradeSub },
  switch: { title: t.billing.switchTitle, sub: t.billing.switchSub },
  renew: { title: t.billing.renewTitle, sub: t.billing.renewSub },
} as const;

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // Return from POK's hosted page (POK appends ?orderId=…). Settle the order
  // server-side — but only one this PT owns — then render the result. Settling
  // before the snapshot means the plan card reflects a fresh upgrade. The settle
  // re-fetches the authoritative order and is idempotent, so a refresh is safe.
  const { orderId } = await searchParams;
  let checkoutResult: ApplyOrderResult | null = null;
  if (orderId) {
    const [owned] = await db
      .select({ id: billingOrders.id })
      .from(billingOrders)
      .where(
        and(
          eq(billingOrders.pokOrderId, orderId),
          eq(billingOrders.ptId, user.id),
        ),
      )
      .limit(1);
    if (owned) checkoutResult = await applyOrderOutcome(orderId);
  }

  const snapshot = await getBillingSnapshot(user.id);
  const slot = resolveCheckoutSlot(snapshot);

  return (
    <div className="-mx-4 -mt-4">
      <NavBar title={t.billing.navTitle} backHref="/settings" />
      <div className="space-y-6 px-5 pt-2 pb-8">
        {checkoutResult && <CheckoutResultBanner result={checkoutResult} />}
        <PlanCard snapshot={snapshot} />

        {/* Usage meters — capacity, never punitive. */}
        <section className="rounded-lg bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-[11.5px] font-bold tracking-[0.07em] uppercase text-ink-3">
            {t.billing.usageTitle}
          </h2>
          <div className="mt-4 space-y-4">
            <UsageMeter
              label={t.billing.meterConversations}
              meter={snapshot.conversations}
            />
            <UsageMeter
              label={t.billing.meterReminders}
              meter={snapshot.reminders}
            />
          </div>
        </section>

        {/* Yearly-Solo reassurance — no form, they already hold the best plan. */}
        {slot.kind === 'reassure' && (
          <section className="rounded-lg bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              {t.billing.reassureTitle}
            </h2>
            <p className="text-ink-2 mt-1 text-[13.5px]">
              {t.billing.reassureBody}
            </p>
          </section>
        )}

        {/* Upgrade / switch / renew — hidden for lifetime pilots and yearly Solo. */}
        {snapshot.price &&
          (slot.kind === 'upgrade' ||
            slot.kind === 'switch' ||
            slot.kind === 'renew') && (
            <section className="rounded-lg bg-card p-5 shadow-[var(--shadow-card)]">
              <h2 className="font-heading text-lg font-semibold text-foreground">
                {CHECKOUT_COPY[slot.kind].title}
              </h2>
              <p className="text-ink-2 mt-1 text-[13.5px]">
                {CHECKOUT_COPY[slot.kind].sub}
              </p>
              <div className="mt-4">
                <CheckoutForm
                  price={snapshot.price}
                  periods={slot.periods}
                  defaultPeriod={slot.defaultPeriod}
                />
              </div>
            </section>
          )}

        {/* Receipts. */}
        <section>
          <h2 className="text-[11.5px] font-bold tracking-[0.07em] uppercase text-ink-3">
            {t.billing.receiptsTitle}
          </h2>
          {snapshot.receipts.length === 0 ? (
            <p className="text-ink-3 mt-3 text-[13.5px]">
              {t.billing.receiptsEmpty}
            </p>
          ) : (
            <ul className="mt-3 overflow-hidden rounded-lg bg-card shadow-[var(--shadow-card)]">
              {snapshot.receipts.map((receipt) => {
                const date = formatDate(
                  new TZDate(new Date(receipt.createdAt), snapshot.timezone),
                );
                return (
                  <li
                    key={receipt.id}
                    className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-foreground tabular-nums">
                        {formatLek(receipt.amountAll)} ALL
                      </p>
                      <p className="text-ink-3 mt-0.5 text-[12.5px]">
                        {date} · {PERIOD_LABEL[receipt.period]}
                      </p>
                    </div>
                    <ReceiptStatus status={receipt.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Post-redirect checkout outcome banner. Only 'applied' celebrates. */
function CheckoutResultBanner({ result }: { result: ApplyOrderResult }) {
  const tone = checkoutBannerTone(result);
  if (!tone) return null;
  const message =
    tone === 'paid'
      ? t.billing.checkoutApplied
      : tone === 'pending'
        ? t.billing.checkoutPending
        : t.billing.checkoutFailed;
  return (
    <p
      className={cn(
        'rounded-lg px-4 py-3 text-[13.5px] font-medium',
        tone === 'paid'
          ? 'bg-[var(--success-50)] text-[var(--success-700)]'
          : tone === 'pending'
            ? 'bg-[var(--warning-50)] text-[var(--warning-700)]'
            : 'bg-destructive/10 text-destructive',
      )}
    >
      {message}
    </p>
  );
}

function ReceiptStatus({ status }: { status: BillingReceipt['status'] }) {
  const paid = status === 'paid';
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold',
        paid
          ? 'bg-[var(--success-50)] text-[var(--success-700)]'
          : 'bg-muted text-ink-3',
      )}
    >
      {paid ? t.billing.receiptPaid : t.billing.receiptFailed}
    </span>
  );
}
