import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  estimateMetaConversationCostMicroEur,
  metaCostFromBillableCounts,
} from '@/lib/billing/meta';
import { resolveEffectivePlan } from '@/lib/billing/entitlements';
import { EXPIRY_GRACE_DAYS, type PlanId } from '@/lib/billing/plans';

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
  /**
   * Meta cost provenance for the row's window. Per `cost_daily` row this is
   * strictly 'actual' | 'estimated'; 'mixed' is a DERIVED label only, when an
   * aggregate window spans both (never written to the DB column).
   */
  metaCostSource: 'actual' | 'estimated' | 'mixed';
  /** Count of billable Meta messages backing the actual cost (0 when estimated). */
  metaBillableMessages: number;
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
    billableMsgs: number | string;
    actualDays: number | string;
    totalDays: number | string;
  }>(sql`
    SELECT c.pt_id AS "ptId", pts.email AS email,
      COALESCE(SUM(c.ai_cost_microusd), 0)::bigint AS "ai",
      COALESCE(SUM(c.meta_cost_micro_eur), 0)::bigint AS "meta",
      COALESCE(SUM(c.meta_billable_messages), 0)::bigint AS "billableMsgs",
      count(*) FILTER (WHERE c.meta_cost_source = 'actual')::int AS "actualDays",
      count(*)::int AS "totalDays"
    FROM cost_daily c
    JOIN pts ON pts.id = c.pt_id
    WHERE ${where}
    GROUP BY c.pt_id, pts.email
    ORDER BY "ai" DESC, pts.email ASC
  `);
  return rows.map((row) => {
    const actualDays = Number(row.actualDays);
    const totalDays = Number(row.totalDays);
    // Every grouped row has >=1 day. All-actual → 'actual', none-actual →
    // 'estimated', otherwise a 'mixed' window (derived label, never stored).
    const metaCostSource: PtCostRow['metaCostSource'] =
      actualDays === totalDays
        ? 'actual'
        : actualDays === 0
          ? 'estimated'
          : 'mixed';
    return {
      ptId: row.ptId,
      email: row.email,
      aiCostMicrousd: Number(row.ai),
      metaCostMicroEur: Number(row.meta),
      metaCostSource,
      metaBillableMessages: Number(row.billableMsgs),
    };
  });
}

/**
 * Live per-PT cost for the current UTC day (no `cost_daily` row yet). AI cost +
 * conversation count come from `messages`; Meta cost mirrors the rollup's
 * actual-first logic directly off `wa_message_statuses` — any status row for the
 * window ⇒ 'actual' (rate-card priced), otherwise the per-conversation estimate.
 * Rows are the UNION of PTs with messages today and PTs with status rows today
 * (e.g. a reminder that produced no `messages` row still shows its Meta cost).
 */
async function loadTodayLiveCost(
  start: Date,
  end: Date,
): Promise<PtCostRow[]> {
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const messageRows = await db.execute<{
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
    WHERE m.created_at >= ${startIso}::timestamptz
      AND m.created_at < ${endIso}::timestamptz
    GROUP BY m.pt_id, pts.email
  `);

  const statusRows = await db.execute<{
    ptId: string;
    email: string;
    category: string;
    rows: number | string;
    billable: number | string;
  }>(sql`
    SELECT s.pt_id AS "ptId", pts.email AS email,
      lower(coalesce(s.pricing_category, '')) AS "category",
      count(*)::int AS "rows",
      count(*) FILTER (WHERE s.billable IS TRUE)::int AS "billable"
    FROM wa_message_statuses s
    JOIN pts ON pts.id = s.pt_id
    WHERE coalesce(s.sent_at, s.created_at) >= ${startIso}::timestamptz
      AND coalesce(s.sent_at, s.created_at) < ${endIso}::timestamptz
    GROUP BY s.pt_id, pts.email, category
  `);

  const messageByPt = new Map<
    string,
    { email: string; ai: number; convos: number }
  >();
  for (const row of messageRows) {
    messageByPt.set(row.ptId, {
      email: row.email,
      ai: Number(row.ai),
      convos: Number(row.convos),
    });
  }

  const statusByPt = new Map<
    string,
    { email: string; hasRows: boolean; billableByCategory: Map<string, number> }
  >();
  for (const row of statusRows) {
    const fold = statusByPt.get(row.ptId) ?? {
      email: row.email,
      hasRows: false,
      billableByCategory: new Map<string, number>(),
    };
    if (Number(row.rows) > 0) fold.hasRows = true;
    const billable = Number(row.billable);
    if (billable > 0) {
      fold.billableByCategory.set(
        row.category,
        (fold.billableByCategory.get(row.category) ?? 0) + billable,
      );
    }
    statusByPt.set(row.ptId, fold);
  }

  const ptIds = new Set<string>([
    ...messageByPt.keys(),
    ...statusByPt.keys(),
  ]);
  const out: PtCostRow[] = [];
  for (const ptId of ptIds) {
    const msg = messageByPt.get(ptId);
    const status = statusByPt.get(ptId);
    const email = msg?.email ?? status?.email ?? '';
    let metaCostSource: 'actual' | 'estimated';
    let metaBillableMessages: number;
    let metaCostMicroEur: number;
    if (status?.hasRows) {
      const { microEur, billableMessages } = metaCostFromBillableCounts(
        status.billableByCategory,
      );
      metaCostSource = 'actual';
      metaBillableMessages = billableMessages;
      metaCostMicroEur = microEur;
    } else {
      metaCostSource = 'estimated';
      metaBillableMessages = 0;
      metaCostMicroEur = estimateMetaConversationCostMicroEur(msg?.convos ?? 0);
    }
    out.push({
      ptId,
      email,
      aiCostMicrousd: msg?.ai ?? 0,
      metaCostMicroEur,
      metaCostSource,
      metaBillableMessages,
    });
  }

  // Match the rolled-up query ordering: AI cost desc, then email asc.
  out.sort(
    (a, b) =>
      b.aiCostMicrousd - a.aiCostMicrousd || a.email.localeCompare(b.email),
  );
  return out;
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

// ---------------------------------------------------------------------------
// Phase 16 C7 — Monetization success metrics.
//
// A SEPARATE fan-out from getAdminMetrics (its own Promise.all + withTimeout) so
// the existing AdminMetrics type/query set stays untouched. Every loader takes
// an explicit `nowDate` for deterministic tests. All queries run on the same
// RLS-bypassing owner `db`, cross-tenant, gated only by ADMIN_EMAILS in the
// caller. Currency discipline holds end to end: AI cost is µUSD, Meta cost is
// µEUR — surfaced separately, never summed or converted.
// ---------------------------------------------------------------------------

/** Point-in-time PT count by EFFECTIVE plan (lapsed solo folds into free). */
export type PlanDistribution = {
  free: number;
  solo: number;
  lifetime: number;
  total: number;
};

/**
 * All-time conversion (lifetime PTs excluded — pilots never "converted"), plus a
 * this-month first-payment counter and average/median time-to-upgrade. Every
 * rate ships with its raw numerator/denominator so a tiny launch N reads honestly.
 */
export type ConversionMetric = {
  paidPts: number;
  eligiblePts: number;
  rate: number;
  newThisMonth: number;
  avgDaysToUpgrade: number | null;
  medianDaysToUpgrade: number | null;
};

/**
 * Ledger-only renewal signal. A "due boundary" is a paid order whose granted
 * expiry has already passed; it counts as renewed iff a later paid order landed
 * by expiry + EXPIRY_GRACE_DAYS. 90d window + all-time, both with raw counts.
 */
export type RenewalMetric = {
  renewed90d: number;
  due90d: number;
  rate90d: number;
  renewedAllTime: number;
  dueAllTime: number;
};

/** Downgrade counts from the C6 `billing.downgraded` event (0 until C6 emits). */
export type DowngradeMetric = {
  thisMonth: number;
  prevMonth: number;
  distinctPtsThisMonth: number;
};

/** Per-kind cap-hit: distinct capped PTs over active PTs (shared denominator). */
export type CapHitKind = { pts: number; activePts: number; rate: number };
export type CapHitMetric = { conversations: CapHitKind; reminders: CapHitKind };

/**
 * Current-month cost of the effective-FREE cohort. AI (µUSD) and Meta (µEUR)
 * stay in separate figures — never summed. `metaCostSource` is a window-level
 * label derived from the actual/estimated PT-day split (see PtCostRow's note).
 */
export type FreeCogsMetric = {
  freePtCount: number;
  aiCostMicrousd: number;
  metaCostMicroEur: number;
  metaCostSource: 'actual' | 'estimated' | 'mixed';
  metaBillableMessages: number;
  actualPtDays: number;
  estimatedPtDays: number;
  avgAiCostMicrousd: number;
  avgMetaCostMicroEur: number;
};

/**
 * A billing_orders row joined to the PT email. Amounts stay RAW: `amountMinor`
 * is POK minor units and the ALL minor-unit factor is UNCONFIRMED (C5 spike),
 * so there is deliberately no converted major-unit field here.
 */
export type PaymentRow = {
  orderId: string;
  ptId: string;
  email: string;
  plan: string;
  period: string;
  amountMinor: number;
  currency: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  pokOrderId: string;
  previousExpiresAt: string | null;
  newExpiresAt: string | null;
};

export type BillingMetrics = {
  planDistribution: PlanDistribution;
  conversion: ConversionMetric;
  renewal: RenewalMetric;
  downgrades: DowngradeMetric;
  capHits: CapHitMetric;
  freeCogs: FreeCogsMetric;
  recentPayments: PaymentRow[];
};

function num(value: number | string | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function numOrNull(value: number | string | null | undefined): number | null {
  return value == null ? null : Number(value);
}

// `db.execute` returns timestamptz columns as Postgres text
// ("2026-04-10 10:00:00+00"), not JS Dates — normalize to ISO 8601.
function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

const SECONDS_PER_DAY = 86_400;

async function loadPlanDistribution(nowDate: Date): Promise<PlanDistribution> {
  const rows = await db.execute<{
    plan: string;
    planLifetime: boolean;
    planExpiresAt: Date | string | null;
  }>(sql`
    SELECT plan AS "plan",
      plan_lifetime AS "planLifetime",
      plan_expires_at AS "planExpiresAt"
    FROM pts
  `);
  let free = 0;
  let solo = 0;
  let lifetime = 0;
  for (const row of rows) {
    if (row.planLifetime === true) {
      lifetime += 1;
      continue;
    }
    const effective = resolveEffectivePlan(
      {
        plan: row.plan as PlanId,
        planLifetime: false,
        planExpiresAt: row.planExpiresAt ? new Date(row.planExpiresAt) : null,
      },
      nowDate,
    );
    if (effective === 'solo') solo += 1;
    else free += 1;
  }
  return { free, solo, lifetime, total: free + solo + lifetime };
}

async function loadConversion(nowDate: Date): Promise<ConversionMetric> {
  const nowIso = nowDate.toISOString();
  const [row] = await db.execute<{
    eligiblePts: string | number;
    paidPts: string | number;
    newThisMonth: string | number;
    avgSeconds: string | number | null;
    medianSeconds: string | number | null;
  }>(sql`
    WITH first_paid AS (
      SELECT o.pt_id, MIN(o.paid_at) AS first_paid_at
      FROM billing_orders o
      WHERE o.status = 'paid' AND o.paid_at IS NOT NULL
      GROUP BY o.pt_id
    )
    SELECT
      (SELECT count(*) FROM pts WHERE plan_lifetime = false)::bigint
        AS "eligiblePts",
      (SELECT count(*) FROM first_paid fp
        JOIN pts p ON p.id = fp.pt_id
        WHERE p.plan_lifetime = false)::bigint AS "paidPts",
      (SELECT count(*) FROM first_paid fp
        JOIN pts p ON p.id = fp.pt_id
        WHERE p.plan_lifetime = false
          AND fp.first_paid_at >= date_trunc('month', ${nowIso}::timestamptz)
          AND fp.first_paid_at
            < date_trunc('month', ${nowIso}::timestamptz) + interval '1 month'
        )::bigint AS "newThisMonth",
      (SELECT avg(EXTRACT(EPOCH FROM (fp.first_paid_at - p.created_at)))
        FROM first_paid fp
        JOIN pts p ON p.id = fp.pt_id
        WHERE p.plan_lifetime = false) AS "avgSeconds",
      (SELECT percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (fp.first_paid_at - p.created_at)))
        FROM first_paid fp
        JOIN pts p ON p.id = fp.pt_id
        WHERE p.plan_lifetime = false) AS "medianSeconds"
  `);
  const eligiblePts = num(row.eligiblePts);
  const paidPts = num(row.paidPts);
  const avgSeconds = numOrNull(row.avgSeconds);
  const medianSeconds = numOrNull(row.medianSeconds);
  return {
    paidPts,
    eligiblePts,
    rate: eligiblePts ? paidPts / eligiblePts : 0,
    newThisMonth: num(row.newThisMonth),
    avgDaysToUpgrade: avgSeconds == null ? null : avgSeconds / SECONDS_PER_DAY,
    medianDaysToUpgrade:
      medianSeconds == null ? null : medianSeconds / SECONDS_PER_DAY,
  };
}

async function loadRenewalRate(nowDate: Date): Promise<RenewalMetric> {
  const nowIso = nowDate.toISOString();
  const [row] = await db.execute<{
    due90d: string | number;
    renewed90d: string | number;
    dueAllTime: string | number;
    renewedAllTime: string | number;
  }>(sql`
    WITH paid AS (
      SELECT pt_id, new_expires_at, paid_at
      FROM billing_orders
      WHERE status = 'paid'
        AND new_expires_at IS NOT NULL
        AND paid_at IS NOT NULL
    ),
    boundaries AS (
      SELECT b.new_expires_at,
        EXISTS (
          SELECT 1 FROM paid r
          WHERE r.pt_id = b.pt_id
            AND r.new_expires_at > b.new_expires_at
            AND r.paid_at
              <= b.new_expires_at + (${EXPIRY_GRACE_DAYS}::int * interval '1 day')
        ) AS renewed
      FROM paid b
      WHERE b.new_expires_at < ${nowIso}::timestamptz
    )
    SELECT
      count(*) FILTER (
        WHERE new_expires_at >= ${nowIso}::timestamptz - interval '90 days'
      )::bigint AS "due90d",
      count(*) FILTER (
        WHERE new_expires_at >= ${nowIso}::timestamptz - interval '90 days'
          AND renewed
      )::bigint AS "renewed90d",
      count(*)::bigint AS "dueAllTime",
      count(*) FILTER (WHERE renewed)::bigint AS "renewedAllTime"
    FROM boundaries
  `);
  const due90d = num(row.due90d);
  const renewed90d = num(row.renewed90d);
  return {
    renewed90d,
    due90d,
    rate90d: due90d ? renewed90d / due90d : 0,
    renewedAllTime: num(row.renewedAllTime),
    dueAllTime: num(row.dueAllTime),
  };
}

async function loadDowngrades(nowDate: Date): Promise<DowngradeMetric> {
  const nowIso = nowDate.toISOString();
  // `billing.downgraded` is a C6 event read here by string type. Until C6 emits
  // it there are simply no matching rows and every count is 0.
  const [row] = await db.execute<{
    thisMonth: string | number;
    prevMonth: string | number;
    distinctPtsThisMonth: string | number;
  }>(sql`
    SELECT
      count(*) FILTER (
        WHERE occurred_at >= date_trunc('month', ${nowIso}::timestamptz)
          AND occurred_at
            < date_trunc('month', ${nowIso}::timestamptz) + interval '1 month'
      )::bigint AS "thisMonth",
      count(*) FILTER (
        WHERE occurred_at
            >= date_trunc('month', ${nowIso}::timestamptz) - interval '1 month'
          AND occurred_at < date_trunc('month', ${nowIso}::timestamptz)
      )::bigint AS "prevMonth",
      count(DISTINCT pt_id) FILTER (
        WHERE occurred_at >= date_trunc('month', ${nowIso}::timestamptz)
          AND occurred_at
            < date_trunc('month', ${nowIso}::timestamptz) + interval '1 month'
      )::bigint AS "distinctPtsThisMonth"
    FROM events
    WHERE type = 'billing.downgraded'
  `);
  return {
    thisMonth: num(row.thisMonth),
    prevMonth: num(row.prevMonth),
    distinctPtsThisMonth: num(row.distinctPtsThisMonth),
  };
}

async function loadCapHits(nowDate: Date): Promise<CapHitMetric> {
  const nowIso = nowDate.toISOString();
  const monthKey = nowIso.slice(0, 7);
  const [hits] = await db.execute<{
    conversations: string | number;
    reminders: string | number;
  }>(sql`
    SELECT
      count(DISTINCT pt_id) FILTER (WHERE payload->>'kind' = 'conversations')::bigint
        AS "conversations",
      count(DISTINCT pt_id) FILTER (WHERE payload->>'kind' = 'reminders')::bigint
        AS "reminders"
    FROM events
    WHERE type = 'billing.limit_reached'
      AND occurred_at >= date_trunc('month', ${nowIso}::timestamptz)
      AND occurred_at
        < date_trunc('month', ${nowIso}::timestamptz) + interval '1 month'
  `);
  const [active] = await db.execute<{ activePts: string | number }>(sql`
    SELECT count(DISTINCT pt_id)::bigint AS "activePts"
    FROM conversation_days
    WHERE month_key = ${monthKey}
  `);
  const activePts = num(active.activePts);
  const convPts = num(hits.conversations);
  const remPts = num(hits.reminders);
  return {
    conversations: {
      pts: convPts,
      activePts,
      rate: activePts ? convPts / activePts : 0,
    },
    reminders: {
      pts: remPts,
      activePts,
      rate: activePts ? remPts / activePts : 0,
    },
  };
}

async function loadFreeCogs(nowDate: Date): Promise<FreeCogsMetric> {
  const nowIso = nowDate.toISOString();
  const rows = await db.execute<{
    plan: string;
    planLifetime: boolean;
    planExpiresAt: Date | string | null;
    ai: string | number;
    meta: string | number;
    billableMsgs: string | number;
    actualDays: string | number;
    totalDays: string | number;
  }>(sql`
    SELECT p.plan AS "plan",
      p.plan_lifetime AS "planLifetime",
      p.plan_expires_at AS "planExpiresAt",
      COALESCE(SUM(c.ai_cost_microusd), 0)::bigint AS "ai",
      COALESCE(SUM(c.meta_cost_micro_eur), 0)::bigint AS "meta",
      COALESCE(SUM(c.meta_billable_messages), 0)::bigint AS "billableMsgs",
      count(*) FILTER (WHERE c.meta_cost_source = 'actual')::int AS "actualDays",
      count(*)::int AS "totalDays"
    FROM cost_daily c
    JOIN pts p ON p.id = c.pt_id
    WHERE c.day >= date_trunc('month', ${nowIso}::timestamptz)::date
      AND c.day
        < (date_trunc('month', ${nowIso}::timestamptz) + interval '1 month')::date
    GROUP BY c.pt_id, p.plan, p.plan_lifetime, p.plan_expires_at
  `);

  let freePtCount = 0;
  let aiCostMicrousd = 0;
  let metaCostMicroEur = 0;
  let metaBillableMessages = 0;
  let actualPtDays = 0;
  let totalPtDays = 0;
  for (const row of rows) {
    if (row.planLifetime === true) continue;
    const effective = resolveEffectivePlan(
      {
        plan: row.plan as PlanId,
        planLifetime: false,
        planExpiresAt: row.planExpiresAt ? new Date(row.planExpiresAt) : null,
      },
      nowDate,
    );
    if (effective !== 'free') continue;
    freePtCount += 1;
    aiCostMicrousd += num(row.ai);
    metaCostMicroEur += num(row.meta);
    metaBillableMessages += num(row.billableMsgs);
    actualPtDays += num(row.actualDays);
    totalPtDays += num(row.totalDays);
  }
  const estimatedPtDays = totalPtDays - actualPtDays;
  const metaCostSource: FreeCogsMetric['metaCostSource'] =
    totalPtDays === 0 || actualPtDays === 0
      ? 'estimated'
      : actualPtDays === totalPtDays
        ? 'actual'
        : 'mixed';
  return {
    freePtCount,
    aiCostMicrousd,
    metaCostMicroEur,
    metaCostSource,
    metaBillableMessages,
    actualPtDays,
    estimatedPtDays,
    avgAiCostMicrousd: freePtCount ? aiCostMicrousd / freePtCount : 0,
    avgMetaCostMicroEur: freePtCount ? metaCostMicroEur / freePtCount : 0,
  };
}

async function loadRecentPayments(nowDate: Date): Promise<PaymentRow[]> {
  const nowIso = nowDate.toISOString();
  const rows = await db.execute<{
    orderId: string;
    ptId: string;
    email: string;
    plan: string;
    period: string;
    amountMinor: number;
    currency: string;
    status: string;
    createdAt: Date | string;
    paidAt: Date | string | null;
    pokOrderId: string;
    previousExpiresAt: Date | string | null;
    newExpiresAt: Date | string | null;
  }>(sql`
    SELECT o.id AS "orderId", o.pt_id AS "ptId", p.email AS "email",
      o.plan AS "plan", o.period AS "period", o.amount_minor AS "amountMinor",
      o.currency AS "currency", o.status AS "status",
      o.created_at AS "createdAt", o.paid_at AS "paidAt",
      o.pok_order_id AS "pokOrderId",
      o.previous_expires_at AS "previousExpiresAt",
      o.new_expires_at AS "newExpiresAt"
    FROM billing_orders o
    JOIN pts p ON p.id = o.pt_id
    WHERE o.created_at >= date_trunc('month', ${nowIso}::timestamptz)
      AND o.created_at
        < date_trunc('month', ${nowIso}::timestamptz) + interval '1 month'
    ORDER BY o.created_at DESC
    LIMIT 50
  `);
  return rows.map((row) => ({
    orderId: row.orderId,
    ptId: row.ptId,
    email: row.email,
    plan: row.plan,
    period: row.period,
    amountMinor: num(row.amountMinor),
    currency: row.currency,
    status: row.status,
    createdAt: toIso(row.createdAt) ?? '',
    paidAt: toIso(row.paidAt),
    pokOrderId: row.pokOrderId,
    previousExpiresAt: toIso(row.previousExpiresAt),
    newExpiresAt: toIso(row.newExpiresAt),
  }));
}

export async function getBillingMetrics(now?: Date): Promise<BillingMetrics> {
  const nowDate = now ?? new Date();
  const [
    planDistribution,
    conversion,
    renewal,
    downgrades,
    capHits,
    freeCogs,
    recentPayments,
  ] = await withTimeout(
    Promise.all([
      loadPlanDistribution(nowDate),
      loadConversion(nowDate),
      loadRenewalRate(nowDate),
      loadDowngrades(nowDate),
      loadCapHits(nowDate),
      loadFreeCogs(nowDate),
      loadRecentPayments(nowDate),
    ]),
    METRICS_TIMEOUT_MS,
    'getBillingMetrics',
  );

  return {
    planDistribution,
    conversion,
    renewal,
    downgrades,
    capHits,
    freeCogs,
    recentPayments,
  };
}
