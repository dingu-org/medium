/**
 * Conversation metering + cap enforcement (Phase 16 C2). A "conversation" for
 * billing is an active patient-day: the first inbound patient message the
 * assistant processes for a given patient on a given calendar day (in the PT's
 * timezone) inserts one `conversation_days` fact and counts once. Every limit
 * read here comes from `lib/billing/plans.ts` — never hardcoded.
 *
 * The gate runs under a per-PT advisory lock so two different patients hitting
 * the boundary at the same moment can't both slip past the cap. Warning/reached
 * events are emitted at most once per (PT, type, kind, month) via an
 * events-exists check that C3's belt-and-braces monitor cron shares.
 */
import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { and, eq, sql } from 'drizzle-orm';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import { db, type DB, type DBTransaction } from '@/lib/db';
import { conversationDays, events, pts } from '@/lib/db/schema';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { resolveEffectivePlan } from './entitlements';
import { getPlan, USAGE_WARN_RATIO, type PlanId } from './plans';

/**
 * Stable local-day + month keys in the PT's timezone. Both derive from the SAME
 * zoned instant, so a 23:59 Europe/Tirane message that is already "tomorrow" in
 * UTC still counts against the Tirane day (and month) it actually happened on.
 */
export function conversationDayKeys(
  instant: Date,
  timezone: string,
): { localDay: string; monthKey: string } {
  const zoned = new TZDate(instant, timezone);
  return {
    localDay: format(zoned, 'yyyy-MM-dd'),
    monthKey: format(zoned, 'yyyy-MM'),
  };
}

/** Usage crossing this count (ceil of the ratio × cap) warns once per month. */
export function warnThreshold(limit: number): number {
  return Math.ceil(USAGE_WARN_RATIO * limit);
}

export type ConversationGateResult =
  | { status: 'allowed'; counted: boolean; used: number; limit: number }
  | { status: 'at_cap'; used: number; limit: number };

async function countConversationDays(
  executor: DB | DBTransaction,
  ptId: string,
  monthKey: string,
): Promise<number> {
  const [row] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(conversationDays)
    .where(
      and(
        eq(conversationDays.ptId, ptId),
        eq(conversationDays.monthKey, monthKey),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Emit a billing limit event at most once per (PT, type, kind, month). Returns
 * the new event id (to publish immediately) or null when one already exists.
 * C2 only ever passes kind `conversations`; the wider `kind` enum is declared
 * in the shared schema for C3's reminder events.
 */
async function emitBillingEventOnce(
  tx: DBTransaction,
  args:
    | {
        type: 'billing.limit_reached';
        ptId: string;
        monthKey: string;
        used: number;
        limit: number;
        traceId?: string;
      }
    | {
        type: 'billing.limit_warning';
        ptId: string;
        monthKey: string;
        used: number;
        limit: number;
        remaining: number;
        traceId?: string;
      },
): Promise<string | null> {
  const kind = 'conversations' as const;
  const [existing] = await tx
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.ptId, args.ptId),
        eq(events.type, args.type),
        sql`${events.payload}->>'kind' = ${kind}`,
        sql`${events.payload}->>'monthKey' = ${args.monthKey}`,
      ),
    )
    .limit(1);
  if (existing) return null;

  if (args.type === 'billing.limit_reached') {
    return appendBackgroundEvent(tx, {
      type: 'billing.limit_reached',
      data: {
        ptId: args.ptId,
        kind,
        used: args.used,
        limit: args.limit,
        monthKey: args.monthKey,
        traceId: args.traceId,
      },
    });
  }
  return appendBackgroundEvent(tx, {
    type: 'billing.limit_warning',
    data: {
      ptId: args.ptId,
      kind,
      used: args.used,
      limit: args.limit,
      remaining: args.remaining,
      monthKey: args.monthKey,
      traceId: args.traceId,
    },
  });
}

/**
 * Record this inbound as a metered conversation-day and decide whether it may
 * proceed. Idempotent: a repeat for the same (PT, patient, local day) — an
 * Inngest retry or a later same-day message — returns `counted:false` and
 * always flows, even once the month is at cap (mid-conversation replies are
 * never cut off). Only a fresh patient-day that would exceed the cap is turned
 * away with `at_cap`.
 *
 * The whole insert → count → (compensating delete | event) sequence runs in one
 * transaction inside the advisory lock, so a crash can never leave a committed
 * over-limit row that a retry would then wave through.
 */
export async function checkAndRecordConversation(args: {
  ptId: string;
  patientId: string;
  conversationId: string;
  plan: PlanId;
  timezone: string;
  inboundMessageId: string;
  instant: Date;
  traceId?: string;
}): Promise<ConversationGateResult> {
  const limit = getPlan(args.plan).conversationsPerMonth;
  const { localDay, monthKey } = conversationDayKeys(
    args.instant,
    args.timezone,
  );

  const { result, publishEventId } = await withAdvisoryLock(
    `usage:conv:${args.ptId}`,
    () =>
      db.transaction(async (tx) => {
        const inserted = await tx
          .insert(conversationDays)
          .values({
            ptId: args.ptId,
            patientId: args.patientId,
            conversationId: args.conversationId,
            localDay,
            monthKey,
            firstMessageId: args.inboundMessageId,
          })
          .onConflictDoNothing({
            target: [
              conversationDays.ptId,
              conversationDays.patientId,
              conversationDays.localDay,
            ],
          })
          .returning({ id: conversationDays.id });

        // This patient-day is already paid for → always allowed, never re-counts.
        if (inserted.length === 0) {
          const used = await countConversationDays(tx, args.ptId, monthKey);
          return {
            result: {
              status: 'allowed' as const,
              counted: false,
              used,
              limit,
            },
            publishEventId: null as string | null,
          };
        }

        const count = await countConversationDays(tx, args.ptId, monthKey);

        // Over cap: undo the day-fact so the month total stays at the limit and
        // hand off. Nothing is counted for a turned-away patient-day.
        if (limit > 0 && count > limit) {
          await tx
            .delete(conversationDays)
            .where(eq(conversationDays.id, inserted[0].id));
          return {
            result: { status: 'at_cap' as const, used: count - 1, limit },
            publishEventId: null as string | null,
          };
        }

        let publishEventId: string | null = null;
        if (limit > 0 && count >= limit) {
          publishEventId = await emitBillingEventOnce(tx, {
            type: 'billing.limit_reached',
            ptId: args.ptId,
            monthKey,
            used: count,
            limit,
            traceId: args.traceId,
          });
        } else if (limit > 0 && count >= warnThreshold(limit)) {
          publishEventId = await emitBillingEventOnce(tx, {
            type: 'billing.limit_warning',
            ptId: args.ptId,
            monthKey,
            used: count,
            limit,
            remaining: limit - count,
            traceId: args.traceId,
          });
        }

        return {
          result: {
            status: 'allowed' as const,
            counted: true,
            used: count,
            limit,
          },
          publishEventId,
        };
      }),
  );

  // Best-effort immediate publish; the outbox cron is the durable safety net,
  // so this stays outside the transaction (matches the escalation emitter).
  if (publishEventId) await tryPublishOutboxEvent(publishEventId);
  return result;
}

/**
 * Read-only monthly conversation usage for UI (chat cap banner now,
 * /settings/billing in C6). Resolves the grace-aware effective plan so a lapsed
 * Solo shows Free limits.
 */
export async function getConversationUsage(
  ptId: string,
  now: Date = new Date(),
): Promise<{ used: number; limit: number; monthKey: string; atCap: boolean }> {
  const [pt] = await db
    .select({
      plan: pts.plan,
      planLifetime: pts.planLifetime,
      planExpiresAt: pts.planExpiresAt,
      timezone: pts.timezone,
    })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);
  if (!pt) return { used: 0, limit: 0, monthKey: '', atCap: false };

  const plan = resolveEffectivePlan(pt, now);
  const limit = getPlan(plan).conversationsPerMonth;
  const { monthKey } = conversationDayKeys(now, pt.timezone);
  const used = await countConversationDays(db, ptId, monthKey);
  return { used, limit, monthKey, atCap: limit > 0 && used >= limit };
}
