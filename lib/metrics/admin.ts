import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { estimateMetaConversationCostMicroEur } from '@/lib/billing/meta';

/**
 * Cross-tenant operator metrics for the Phase 11 admin dashboard.
 *
 * These queries deliberately use the bare, RLS-bypassing `db` (owner
 * connection) rather than `lib/tenancy` helpers: they span ALL tenants, and the
 * tenancy layer refuses to run without a single PT in scope. The ONLY access
 * gate is `ADMIN_EMAILS`, enforced in the admin page's server component — keep
 * that env empty by default so a misconfigured deploy 404s instead of leaking
 * cross-tenant cost data.
 */

export type FunnelWindow = {
  signups: number;
  whatsappConnections: number;
  ptsWithFirstMessage: number;
  ptsWithFirstBooking: number;
};

export type OnboardingCohort = {
  totalPts: number;
  connectedWithin24h: number;
  pct: number;
};

export type PtCostRow = {
  ptId: string;
  email: string;
  aiCostMicrousd: number;
  metaCostMicroEur: number;
};

export type CostSummary = {
  yesterday: PtCostRow[];
  currentMonth: PtCostRow[];
  today: PtCostRow[];
};

export type PushDeliverySummary = {
  sent: number;
  removed: number;
  dispatches: number;
};

export type AdminMetrics = {
  funnelYesterday: FunnelWindow;
  funnel7d: FunnelWindow;
  cohort: OnboardingCohort;
  cost: CostSummary;
  push: PushDeliverySummary;
};

function utcMidnight(day: Date): Date {
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
  );
}

async function loadFunnelWindow(
  start: Date,
  end: Date,
): Promise<FunnelWindow> {
  const [row] = await db.execute<{
    signups: number | string;
    whatsappConnections: number | string;
    ptsWithFirstMessage: number | string;
    ptsWithFirstBooking: number | string;
  }>(sql`
    SELECT
      (SELECT count(*) FROM pts
        WHERE created_at >= ${start.toISOString()}::timestamptz
          AND created_at < ${end.toISOString()}::timestamptz) AS "signups",
      (SELECT count(*) FROM whatsapp_connections
        WHERE connected_at >= ${start.toISOString()}::timestamptz
          AND connected_at < ${end.toISOString()}::timestamptz) AS "whatsappConnections",
      (SELECT count(*) FROM (
        SELECT pt_id, min(created_at) AS m FROM messages GROUP BY pt_id
      ) fm WHERE fm.m >= ${start.toISOString()}::timestamptz
        AND fm.m < ${end.toISOString()}::timestamptz) AS "ptsWithFirstMessage",
      (SELECT count(*) FROM (
        SELECT pt_id, min(created_at) AS m FROM appointments GROUP BY pt_id
      ) fb WHERE fb.m >= ${start.toISOString()}::timestamptz
        AND fb.m < ${end.toISOString()}::timestamptz) AS "ptsWithFirstBooking"
  `);
  return {
    signups: Number(row.signups),
    whatsappConnections: Number(row.whatsappConnections),
    ptsWithFirstMessage: Number(row.ptsWithFirstMessage),
    ptsWithFirstBooking: Number(row.ptsWithFirstBooking),
  };
}

async function loadCohort(): Promise<OnboardingCohort> {
  const [row] = await db.execute<{
    total: number | string;
    within: number | string;
  }>(sql`
    SELECT
      count(*) AS total,
      count(*) FILTER (
        WHERE fc.first_connected IS NOT NULL
          AND fc.first_connected <= p.created_at + interval '24 hours'
      ) AS within
    FROM pts p
    LEFT JOIN (
      SELECT pt_id, min(connected_at) AS first_connected
      FROM whatsapp_connections
      WHERE connected_at IS NOT NULL
      GROUP BY pt_id
    ) fc ON fc.pt_id = p.id
  `);
  const totalPts = Number(row.total);
  const connectedWithin24h = Number(row.within);
  return {
    totalPts,
    connectedWithin24h,
    pct: totalPts ? connectedWithin24h / totalPts : 0,
  };
}

async function loadRolledUpCost(where: ReturnType<typeof sql>): Promise<PtCostRow[]> {
  const rows = await db.execute<{
    ptId: string;
    email: string;
    ai: number | string;
    meta: number | string;
  }>(sql`
    SELECT c.pt_id AS "ptId", pts.email AS email,
      COALESCE(SUM(c.ai_cost_microusd), 0)::bigint AS "ai",
      COALESCE(SUM(c.meta_cost_micro_eur), 0)::bigint AS "meta"
    FROM cost_daily c
    JOIN pts ON pts.id = c.pt_id
    WHERE ${where}
    GROUP BY c.pt_id, pts.email
    ORDER BY "ai" DESC, pts.email ASC
  `);
  return rows.map((row) => ({
    ptId: row.ptId,
    email: row.email,
    aiCostMicrousd: Number(row.ai),
    metaCostMicroEur: Number(row.meta),
  }));
}

async function loadTodayLiveCost(
  start: Date,
  end: Date,
): Promise<PtCostRow[]> {
  const rows = await db.execute<{
    ptId: string;
    email: string;
    ai: number | string;
    convos: number | string;
  }>(sql`
    SELECT m.pt_id AS "ptId", pts.email AS email,
      COALESCE(SUM(m.ai_cost_microusd) FILTER (WHERE m.role = 'ai' AND m.model IS NOT NULL), 0)::bigint AS "ai",
      COUNT(DISTINCT m.conversation_id) FILTER (WHERE m.role = 'patient')::int AS "convos"
    FROM messages m
    JOIN pts ON pts.id = m.pt_id
    WHERE m.created_at >= ${start.toISOString()}::timestamptz
      AND m.created_at < ${end.toISOString()}::timestamptz
    GROUP BY m.pt_id, pts.email
    ORDER BY "ai" DESC, pts.email ASC
  `);
  return rows.map((row) => ({
    ptId: row.ptId,
    email: row.email,
    aiCostMicrousd: Number(row.ai),
    metaCostMicroEur: estimateMetaConversationCostMicroEur(Number(row.convos)),
  }));
}

async function loadPushDelivery(since: Date): Promise<PushDeliverySummary> {
  const [row] = await db.execute<{
    sent: number | string;
    removed: number | string;
    dispatches: number | string;
  }>(sql`
    SELECT
      COALESCE(SUM((payload->>'sent')::int), 0)::bigint AS "sent",
      COALESCE(SUM((payload->>'removed')::int), 0)::bigint AS "removed",
      count(*)::bigint AS "dispatches"
    FROM events
    WHERE type = 'push.dispatched'
      AND occurred_at >= ${since.toISOString()}::timestamptz
  `);
  return {
    sent: Number(row.sent),
    removed: Number(row.removed),
    dispatches: Number(row.dispatches),
  };
}

/**
 * Wall-clock cap on the metrics fan-out. With the supporting indexes in place
 * these queries return in well under a second; this only trips on a real
 * regression (missing index, or a pooled socket the Supabase pooler silently
 * dropped). Failing fast turns a black-holed, "pending forever" /admin request
 * — which otherwise sits until Vercel kills the function — into a visible error.
 */
const METRICS_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      ).unref?.(),
    ),
  ]);
}

export async function getAdminMetrics(now?: Date): Promise<AdminMetrics> {
  const nowDate = now ?? new Date();
  const todayStart = utcMidnight(nowDate);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayEnd = todayStart;
  const ydayStr = yesterdayStart.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const nowIso = nowDate.toISOString();

  const [funnelYesterday, funnel7d, cohort, yesterday, currentMonth, today, push] =
    await withTimeout(
      Promise.all([
        loadFunnelWindow(yesterdayStart, yesterdayEnd),
        loadFunnelWindow(sevenDaysAgo, nowDate),
        loadCohort(),
        loadRolledUpCost(sql`c.day = ${ydayStr}::date`),
        loadRolledUpCost(
          sql`c.day >= date_trunc('month', ${nowIso}::timestamptz)::date`,
        ),
        loadTodayLiveCost(todayStart, todayEnd),
        loadPushDelivery(sevenDaysAgo),
      ]),
      METRICS_TIMEOUT_MS,
      'getAdminMetrics',
    );

  return {
    funnelYesterday,
    funnel7d,
    cohort,
    cost: { yesterday, currentMonth, today },
    push,
  };
}
