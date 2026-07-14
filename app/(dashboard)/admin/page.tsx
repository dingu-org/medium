import { notFound } from 'next/navigation';
import {
  getAdminMetrics,
  type FunnelWindow,
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

  const metrics = await getAdminMetrics();

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
    </div>
  );
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
