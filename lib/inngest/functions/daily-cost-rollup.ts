import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { costDaily } from '@/lib/db/schema';
import {
  META_ROLLUP_LOOKBACK_DAYS,
  estimateMetaConversationCostMicroEur,
  metaCostFromBillableCounts,
} from '@/lib/billing/meta';
import { logger } from '@/lib/log';
import { inngest } from '../client';

export type CostRollupRow = {
  accountId: string;
  aiCostMicrousd: number;
  aiCachedTokens: number;
  metaConversations: number;
  metaCostMicroEur: number;
  metaBillableMessages: number;
  metaCostSource: 'actual' | 'estimated';
};

type AggregateRow = {
  accountId: string;
  aiCost: number | string;
  aiCached: number | string;
  metaConvos: number | string;
};

type StatusAggregateRow = {
  accountId: string;
  category: string;
  rows: number | string;
  billable: number | string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC calendar-day bounds `[start, end)` and the `YYYY-MM-DD` string for `day`. */
function utcDayBounds(day: Date): { start: Date; end: Date; dayStr: string } {
  const start = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
  );
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end, dayStr: start.toISOString().slice(0, 10) };
}

/**
 * Aggregate one UTC day of per-PT AI + Meta cost and upsert into `cost_daily`.
 * Idempotent on (account_id, day): re-running overwrites the row (and advances
 * `computed_at`) rather than duplicating. `day` defaults to yesterday (UTC).
 *
 * AI cost/cached tokens come from persisted OpenRouter accounting on `messages`
 * (micro-USD). Meta cost is **actual-first** (Phase 16 C4):
 *
 * - If the PT-day has ANY `wa_message_statuses` row (bucketed by
 *   `COALESCE(sent_at, created_at)`), the row is priced from the per-category
 *   rate card — `meta_cost_source = 'actual'`, `meta_billable_messages` = the
 *   count of `billable = true` rows, cost = Σ billable × the category rate. This
 *   holds even when every status row is non-billable: that is a real €0 truth.
 * - If the PT-day has ZERO status rows, it falls back to the legacy
 *   per-conversation estimate — `meta_cost_source = 'estimated'`,
 *   `meta_billable_messages = 0`. Re-running the day later (once Meta's status
 *   webhooks land) flips it to 'actual' for free.
 *
 * We do NOT join statuses to `messages`: the status table survives message
 * retention purges, so a join would drop cost for purged free-plan messages.
 * `meta_conversations` stays the legacy distinct-inbound-conversation count for
 * continuity (informational only once actual costing is in play).
 */
export async function aggregateCostDailyCore(
  day?: Date,
): Promise<CostRollupRow[]> {
  const target = day ?? new Date(Date.now() - DAY_MS);
  const { start, end, dayStr } = utcDayBounds(target);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const aggregated = await db.execute<AggregateRow>(sql`
    SELECT
      account_id AS "accountId",
      COALESCE(SUM(ai_cost_microusd) FILTER (WHERE role = 'ai' AND model IS NOT NULL), 0)::bigint AS "aiCost",
      COALESCE(SUM(cached_tokens) FILTER (WHERE role = 'ai' AND model IS NOT NULL), 0)::bigint AS "aiCached",
      COUNT(DISTINCT conversation_id) FILTER (WHERE role = 'customer')::int AS "metaConvos"
    FROM messages
    WHERE created_at >= ${startIso}::timestamptz
      AND created_at < ${endIso}::timestamptz
    GROUP BY account_id
  `);

  // Meta delivery truth for the same UTC day, bucketed by send time. One row per
  // (PT, normalized pricing category) with the total and billable-only counts.
  const statusAggregated = await db.execute<StatusAggregateRow>(sql`
    SELECT
      account_id AS "accountId",
      lower(coalesce(pricing_category, '')) AS "category",
      count(*)::int AS "rows",
      count(*) FILTER (WHERE billable IS TRUE)::int AS "billable"
    FROM wa_message_statuses
    WHERE coalesce(sent_at, created_at) >= ${startIso}::timestamptz
      AND coalesce(sent_at, created_at) < ${endIso}::timestamptz
    GROUP BY account_id, category
  `);

  type StatusFold = { hasRows: boolean; billableByCategory: Map<string, number> };
  const statusByAccount = new Map<string, StatusFold>();
  for (const row of statusAggregated) {
    const fold = statusByAccount.get(row.accountId) ?? {
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
    statusByAccount.set(row.accountId, fold);
  }

  const messagesByAccount = new Map<
    string,
    { aiCost: number; aiCached: number; metaConvos: number }
  >();
  for (const row of aggregated) {
    messagesByAccount.set(row.accountId, {
      aiCost: Number(row.aiCost),
      aiCached: Number(row.aiCached),
      metaConvos: Number(row.metaConvos),
    });
  }

  const accountIds = new Set<string>([
    ...messagesByAccount.keys(),
    ...statusByAccount.keys(),
  ]);

  const rows: CostRollupRow[] = [];
  for (const accountId of accountIds) {
    const msg = messagesByAccount.get(accountId) ?? {
      aiCost: 0,
      aiCached: 0,
      metaConvos: 0,
    };
    const status = statusByAccount.get(accountId);

    let metaCostSource: 'actual' | 'estimated';
    let metaBillableMessages: number;
    let metaCostMicroEur: number;
    if (status?.hasRows) {
      const { microEur, billableMessages, unknownCategories } =
        metaCostFromBillableCounts(status.billableByCategory);
      if (unknownCategories.length > 0) {
        logger.warn(
          'cost_rollup.unknown_pricing_category',
          'Billable Meta message with unknown pricing category priced at the utility fallback rate',
          { account_id: accountId, day: dayStr, categories: unknownCategories },
        );
      }
      metaCostSource = 'actual';
      metaBillableMessages = billableMessages;
      metaCostMicroEur = microEur;
    } else {
      metaCostSource = 'estimated';
      metaBillableMessages = 0;
      metaCostMicroEur = estimateMetaConversationCostMicroEur(msg.metaConvos);
    }

    rows.push({
      accountId,
      aiCostMicrousd: msg.aiCost,
      aiCachedTokens: msg.aiCached,
      metaConversations: msg.metaConvos,
      metaCostMicroEur,
      metaBillableMessages,
      metaCostSource,
    });
  }

  for (const row of rows) {
    const values = {
      accountId: row.accountId,
      day: dayStr,
      aiCostMicrousd: row.aiCostMicrousd,
      aiCachedTokens: row.aiCachedTokens,
      metaConversations: row.metaConversations,
      metaCostMicroEur: row.metaCostMicroEur,
      metaBillableMessages: row.metaBillableMessages,
      metaCostSource: row.metaCostSource,
      computedAt: new Date(),
    };
    await db
      .insert(costDaily)
      .values(values)
      .onConflictDoUpdate({
        target: [costDaily.accountId, costDaily.day],
        set: {
          aiCostMicrousd: values.aiCostMicrousd,
          aiCachedTokens: values.aiCachedTokens,
          metaConversations: values.metaConversations,
          metaCostMicroEur: values.metaCostMicroEur,
          metaBillableMessages: values.metaBillableMessages,
          metaCostSource: values.metaCostSource,
          computedAt: values.computedAt,
        },
      });
  }

  return rows;
}

/** Runs a single day's aggregation; injectable so the cron wraps each day in its own `step.run`. */
type DayRunner = (
  id: string,
  fn: () => Promise<CostRollupRow[]>,
) => Promise<CostRollupRow[]>;

const inlineDayRunner: DayRunner = (_id, fn) => fn();

/**
 * Aggregate a trailing window of UTC days, oldest → newest, one `run` step per
 * day. `endDay` defaults to yesterday (UTC); `lookbackDays` (default
 * `META_ROLLUP_LOOKBACK_DAYS`) covers `[endDay − (lookback − 1) … endDay]`.
 *
 * Re-processing recent days is how late-arriving Meta status webhooks flip a
 * day from 'estimated' to 'actual': the upsert is idempotent and never
 * regresses, since status rows are only removed on PT-erasure cascade.
 */
export async function aggregateCostDailyWindow(
  endDay?: Date,
  lookbackDays: number = META_ROLLUP_LOOKBACK_DAYS,
  run: DayRunner = inlineDayRunner,
): Promise<CostRollupRow[]> {
  const end = endDay ?? new Date(Date.now() - DAY_MS);
  const lookback = Math.max(1, Math.floor(lookbackDays));
  const all: CostRollupRow[] = [];
  for (let i = lookback - 1; i >= 0; i--) {
    const day = new Date(end.getTime() - i * DAY_MS);
    const { dayStr } = utcDayBounds(day);
    const rows = await run(`aggregate-cost-${dayStr}`, () =>
      aggregateCostDailyCore(day),
    );
    all.push(...rows);
  }
  return all;
}

export const dailyCostRollup = inngest.createFunction(
  { id: 'daily-cost-rollup', retries: 2, concurrency: 1 },
  { cron: '0 2 * * *' },
  async ({ step }) =>
    aggregateCostDailyWindow(
      undefined,
      META_ROLLUP_LOOKBACK_DAYS,
      (id, fn) => step.run(id, fn) as Promise<CostRollupRow[]>,
    ),
);
