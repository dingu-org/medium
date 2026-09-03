import { TZDate } from '@date-fns/tz';
import { formatDateLong, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { BillingSnapshot } from '@/lib/billing/read-model';

const PLAN_LABEL: Record<string, string> = {
  free: t.billing.planFree,
  solo: t.billing.planSolo,
};

/** Current-plan hero card: plan name + lifecycle state + expiry/renewal line. */
export function PlanCard({ snapshot }: { snapshot: BillingSnapshot }) {
  const planLabel = snapshot.planLifetime
    ? t.billing.planLifetime
    : (PLAN_LABEL[snapshot.plan] ?? t.billing.planFree);

  const expiryDate =
    snapshot.planExpiresAt &&
    formatDateLong(new TZDate(new Date(snapshot.planExpiresAt), snapshot.timezone));

  let stateLine: string;
  switch (snapshot.state) {
    case 'lifetime':
      stateLine = t.billing.stateLifetime;
      break;
    case 'free':
      stateLine = t.billing.stateFree;
      break;
    case 'grace':
      stateLine = t.billing.stateGrace(snapshot.daysLeft ?? 0);
      break;
    case 'expiring':
      stateLine = t.billing.stateExpiring(snapshot.daysLeft ?? 0);
      break;
    default:
      stateLine = expiryDate
        ? t.billing.renewsOn(expiryDate)
        : t.billing.stateActive;
  }

  const attention = snapshot.state === 'grace' || snapshot.state === 'expiring';

  return (
    <div className="border-line rounded-lg border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-bold tracking-[0.07em] uppercase text-ink-3">
          {t.billing.title}
        </span>
      </div>
      <p className="mt-1 font-heading text-2xl font-semibold text-foreground">
        {planLabel}
      </p>
      <p
        className={cn(
          'mt-1 text-[14px]',
          attention ? 'text-[var(--warning-600)] font-medium' : 'text-ink-2',
        )}
      >
        {stateLine}
      </p>
    </div>
  );
}
