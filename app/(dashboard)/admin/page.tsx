import { notFound } from 'next/navigation';
import {
  getAdminMetrics,
  getBillingMetrics,
  type BillingMetrics,
  type FunnelWindow,
  type PaymentRow,
  type PtCostRow,
} from '@/lib/metrics/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createServerClient } from '@/lib/supabase/server';
import { isAllowedAdminEmail } from './gate';

export const metadata = { title: 'Admin · Medium' };

/**
 * Internal, cross-tenant ops dashboard. Not linked from DashboardChrome's nav
 * or dock — reachable only by URL, and gated below by an env-var allowlist so
 * a misconfigured/empty ADMIN_EMAILS 404s the route rather than exposing
 * cross-tenant cost data. English copy: this is an operator page, not part of
 * the PT-facing (Albanian) product surface.
 */
export default async function AdminPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAllowedAdminEmail(user?.email, process.env.ADMIN_EMAILS)) {
    notFound();
  }

  const [metrics, billing] = await Promise.all([
    getAdminMetrics(),
    getBillingMetrics(),
  ]);
  const exportMonths = recentMonthKeys(new Date(), 6);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-bold">Admin metrics</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <FunnelCard title="Funnel — yesterday" funnel={metrics.funnelYesterday} />
        <FunnelCard title="Funnel — last 7 days" funnel={metrics.funnel7d} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Onboarding cohort (connected within 24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">
            {(metrics.cohort.pct * 100).toFixed(1)}%
          </p>
          <p className="text-muted-foreground text-sm">
            {metrics.cohort.connectedWithin24h} / {metrics.cohort.totalPts} PTs
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Push delivery — last 7 days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <Stat label="Sent" value={String(metrics.push.sent)} />
            <Stat label="Removed" value={String(metrics.push.removed)} />
            <Stat label="Dispatches" value={String(metrics.push.dispatches)} />
            <Stat
              label="Delivery rate"
              value={
                metrics.push.sent + metrics.push.removed > 0
                  ? `${(
                      (metrics.push.sent /
                        (metrics.push.sent + metrics.push.removed)) *
                      100
                    ).toFixed(1)}%`
                  : '—'
              }
            />
          </div>
        </CardContent>
      </Card>

      <CostCard title="Cost — yesterday" rows={metrics.cost.yesterday} />
      <CostCard title="Cost — current month" rows={metrics.cost.currentMonth} />
      <CostCard
        title="Cost — today (live, not yet rolled up)"
        rows={metrics.cost.today}
      />

      <h2 className="pt-2 text-lg font-bold">Monetization</h2>

      <div className="grid gap-6 md:grid-cols-2">
        <PlanDistributionCard billing={billing} />
        <ConversionCard billing={billing} />
      </div>

      <RenewalChurnCard billing={billing} />
      <CapHitsCard billing={billing} />
      <FreeCogsCard billing={billing} />
      <PaymentsCard
        rows={billing.recentPayments}
        exportMonths={exportMonths}
      />
    </div>
  );
}

/** The last `count` month keys ('YYYY-MM'), current month first, UTC. */
function recentMonthKeys(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      .toISOString()
      .slice(0, 7),
  );
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function PlanDistributionCard({ billing }: { billing: BillingMetrics }) {
  const d = billing.planDistribution;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan distribution (now)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <Stat label="Free" value={String(d.free)} />
          <Stat label="Solo" value={String(d.solo)} />
          <Stat label="Lifetime" value={String(d.lifetime)} />
          <Stat label="Total" value={String(d.total)} />
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Effective plan at request time — a lapsed Solo counts as Free; lifetime
          pilots are their own bucket.
        </p>
      </CardContent>
    </Card>
  );
}

function ConversionCard({ billing }: { billing: BillingMetrics }) {
  const c = billing.conversion;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversion (all-time, lifetime excluded)</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{pct(c.rate)}</p>
        <p className="text-muted-foreground text-sm">
          {c.paidPts} / {c.eligiblePts} eligible PTs have ever paid
        </p>
        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <Stat label="New this month" value={String(c.newThisMonth)} />
          <Stat
            label="Avg to upgrade"
            value={
              c.avgDaysToUpgrade == null
                ? '—'
                : `${c.avgDaysToUpgrade.toFixed(1)}d`
            }
          />
          <Stat
            label="Median to upgrade"
            value={
              c.medianDaysToUpgrade == null
                ? '—'
                : `${c.medianDaysToUpgrade.toFixed(1)}d`
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function RenewalChurnCard({ billing }: { billing: BillingMetrics }) {
  const r = billing.renewal;
  const d = billing.downgrades;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Renewal &amp; churn</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 text-sm md:grid-cols-4">
          <Stat label="Renewal rate (90d)" value={pct(r.rate90d)} />
          <Stat
            label="Renewed / due (90d)"
            value={`${r.renewed90d} / ${r.due90d}`}
          />
          <Stat
            label="Renewed / due (all-time)"
            value={`${r.renewedAllTime} / ${r.dueAllTime}`}
          />
          <Stat
            label="Downgrades this / prev month"
            value={`${d.thisMonth} / ${d.prevMonth}`}
          />
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Ledger-only: a due boundary renews when a later paid order lands within
          the grace window. {d.distinctPtsThisMonth} distinct PT
          {d.distinctPtsThisMonth === 1 ? '' : 's'} downgraded this month.
        </p>
      </CardContent>
    </Card>
  );
}

function CapHitsCard({ billing }: { billing: BillingMetrics }) {
  const { conversations, reminders } = billing.capHits;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cap hits — this month</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Conversations</p>
            <p className="text-lg font-semibold">{pct(conversations.rate)}</p>
            <p className="text-muted-foreground text-xs">
              {conversations.pts} / {conversations.activePts} active PTs
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Reminders</p>
            <p className="text-lg font-semibold">{pct(reminders.rate)}</p>
            <p className="text-muted-foreground text-xs">
              {reminders.pts} / {reminders.activePts} active PTs
            </p>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Distinct PTs that hit each monthly cap, over PTs active this month
          (any conversation-day).
        </p>
      </CardContent>
    </Card>
  );
}

function FreeCogsCard({ billing }: { billing: BillingMetrics }) {
  const f = billing.freeCogs;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Free-tier COGS — current month</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Stat label="AI cost" value={formatMicro(f.aiCostMicrousd, '$')} />
          <Stat label="Meta cost" value={formatMicro(f.metaCostMicroEur, '€')} />
          <Stat label="Free PTs" value={String(f.freePtCount)} />
          <Stat label="Meta source" value={metaSourceLabel(f.metaCostSource)} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Stat
            label="Avg AI / PT"
            value={formatMicro(f.avgAiCostMicrousd, '$')}
          />
          <Stat
            label="Avg Meta / PT"
            value={formatMicro(f.avgMetaCostMicroEur, '€')}
          />
          <Stat label="Billable msgs" value={String(f.metaBillableMessages)} />
          <Stat
            label="Actual / est. PT-days"
            value={`${f.actualPtDays} / ${f.estimatedPtDays}`}
          />
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          AI µUSD and Meta µEUR are separate — not summed.
        </p>
      </CardContent>
    </Card>
  );
}

function PaymentsCard({
  rows,
  exportMonths,
}: {
  rows: PaymentRow[];
  exportMonths: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments — current month</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          <span className="text-muted-foreground">Export CSV:</span>
          {exportMonths.map((month) => (
            <a
              key={month}
              href={`/admin/payments-export?month=${month}`}
              download
              className="underline"
            >
              {month}
            </a>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No payments this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-1 pr-4 font-medium">Created</th>
                  <th className="py-1 pr-4 font-medium">Email</th>
                  <th className="py-1 pr-4 font-medium">Plan</th>
                  <th className="py-1 pr-4 font-medium">Period</th>
                  <th className="py-1 pr-4 font-medium">Amount</th>
                  <th className="py-1 pr-4 font-medium">Currency</th>
                  <th className="py-1 pr-4 font-medium">Status</th>
                  <th className="py-1 pr-4 font-medium">Paid at</th>
                  <th className="py-1 font-medium">POK order</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.orderId} className="border-t">
                    <td className="py-1 pr-4">{formatInstant(row.createdAt)}</td>
                    <td className="py-1 pr-4">{row.email}</td>
                    <td className="py-1 pr-4">{row.plan}</td>
                    <td className="py-1 pr-4">{row.period}</td>
                    <td className="py-1 pr-4">
                      {row.amountMinor} {row.currency}
                    </td>
                    <td className="py-1 pr-4">{row.currency}</td>
                    <td className="py-1 pr-4">{row.status}</td>
                    <td className="py-1 pr-4">{formatInstant(row.paidAt)}</td>
                    <td className="py-1">{row.pokOrderId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-muted-foreground mt-2 text-xs">
          Amounts are POK minor units; the ALL minor-unit factor is UNCONFIRMED
          pending the POK spike — do not divide.
        </p>
      </CardContent>
    </Card>
  );
}

/** ISO instant → compact `YYYY-MM-DD HH:MM` (UTC); em dash when absent. */
function formatInstant(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ');
}

function FunnelCard({
  title,
  funnel,
}: {
  title: string;
  funnel: FunnelWindow;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Stat label="Signups" value={String(funnel.signups)} />
          <Stat
            label="WhatsApp connections"
            value={String(funnel.whatsappConnections)}
          />
          <Stat
            label="First message"
            value={String(funnel.ptsWithFirstMessage)}
          />
          <Stat
            label="First booking"
            value={String(funnel.ptsWithFirstBooking)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CostCard({ title, rows }: { title: string; rows: PtCostRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No cost recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-1 pr-4 font-medium">PT</th>
                  <th className="py-1 pr-4 font-medium">AI cost</th>
                  <th className="py-1 font-medium">Meta cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.ptId} className="border-t">
                    <td className="py-1 pr-4">{row.email}</td>
                    <td className="py-1 pr-4">
                      {formatMicro(row.aiCostMicrousd, '$')}
                    </td>
                    <td className="py-1">
                      {formatMicro(row.metaCostMicroEur, '€')}
                      <span className="text-muted-foreground">
                        {' · '}
                        {metaSourceLabel(row.metaCostSource)}
                      </span>
                      {row.metaBillableMessages > 0 && (
                        <span className="text-muted-foreground block text-xs">
                          {row.metaBillableMessages} billable msg
                          {row.metaBillableMessages === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

/** Micro-currency (1e6 units) → a 2-decimal display amount with symbol. */
function formatMicro(micro: number, symbol: string): string {
  return `${symbol}${(micro / 1_000_000).toFixed(2)}`;
}

/** Short operator-facing label for the Meta cost provenance. */
function metaSourceLabel(source: PtCostRow['metaCostSource']): string {
  return source === 'estimated' ? 'est.' : source;
}
