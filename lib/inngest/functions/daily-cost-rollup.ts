import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { costDaily } from '@/lib/db/schema';
import { estimateMetaConversationCostMicroEur } from '@/lib/billing/meta';
import { inngest } from '../client';

export type CostRollupRow = {
  ptId: string;
  aiCostMicrousd: number;
  aiCachedTokens: number;
  metaConversations: number;
  metaCostMicroEur: number;
};

type AggregateRow = {
  ptId: string;
  aiCost: number | string;
  aiCached: number | string;
  metaConvos: number | string;
};

/** UTC calendar-day bounds `[start, end)` and the `YYYY-MM-DD` string for `day`. */
function utcDayBounds(day: Date): { start: Date; end: Date; dayStr: string } {
  const start = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, dayStr: start.toISOString().slice(0, 10) };
}

/**
 * Aggregate one UTC day of per-PT AI + Meta cost from `messages` and upsert into
 * `cost_daily`. Idempotent on (pt_id, day): re-running the same day overwrites
 * the row (and advances `computed_at`) rather than duplicating.
 *
 * `day` defaults to yesterday (UTC). AI cost/cached tokens come from persisted
 * OpenRouter accounting on AI message rows. `meta_conversations` counts distinct
 * conversations that received >=1 inbound (role='patient') that UTC day — an
 * over-approximation of Meta's 24h-window billing (a conversation already inside
 * an open window is re-counted). Deliberately conservative; refine when Meta's
 * per-message model is wired.
 */
export async function aggregateCostDailyCore(
  day?: Date,
): Promise<CostRollupRow[]> {
  const target = day ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { start, end, dayStr } = utcDayBounds(target);

  const aggregated = await db.execute<AggregateRow>(sql`
    SELECT
      pt_id AS "ptId",
      COALESCE(SUM(ai_cost_microusd) FILTER (WHERE role = 'ai' AND model IS NOT NULL), 0)::bigint AS "aiCost",
      COALESCE(SUM(cached_tokens) FILTER (WHERE role = 'ai' AND model IS NOT NULL), 0)::bigint AS "aiCached",
      COUNT(DISTINCT conversation_id) FILTER (WHERE role = 'patient')::int AS "metaConvos"
    FROM messages
    WHERE created_at >= ${start.toISOString()}::timestamptz
      AND created_at < ${end.toISOString()}::timestamptz
    GROUP BY pt_id
  `);

  const rows: CostRollupRow[] = aggregated.map((row) => {
    const metaConversations = Number(row.metaConvos);
    return {
      ptId: row.ptId,
      aiCostMicrousd: Number(row.aiCost),
      aiCachedTokens: Number(row.aiCached),
      metaConversations,
      metaCostMicroEur: estimateMetaConversationCostMicroEur(metaConversations),
    };
  });

  for (const row of rows) {
    const values = {
      ptId: row.ptId,
      day: dayStr,
      aiCostMicrousd: row.aiCostMicrousd,
      aiCachedTokens: row.aiCachedTokens,
      metaConversations: row.metaConversations,
      metaCostMicroEur: row.metaCostMicroEur,
      computedAt: new Date(),
    };
    await db
      .insert(costDaily)
      .values(values)
      .onConflictDoUpdate({
        target: [costDaily.ptId, costDaily.day],
        set: {
          aiCostMicrousd: values.aiCostMicrousd,
          aiCachedTokens: values.aiCachedTokens,
          metaConversations: values.metaConversations,
          metaCostMicroEur: values.metaCostMicroEur,
          computedAt: values.computedAt,
        },
      });
  }

  return rows;
}

export const dailyCostRollup = inngest.createFunction(
  { id: 'daily-cost-rollup', retries: 2, concurrency: 1 },
  { cron: '0 2 * * *' },
  async ({ step }) =>
    step.run('aggregate-yesterday-cost', () => aggregateCostDailyCore()),
);
