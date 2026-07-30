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
import { addMonths, format, startOfMonth } from 'date-fns';
import {
  and,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import { db, type DB, type DBTransaction } from '@/lib/db';
import {
  appointments,
  conversationDays,
  events,
  messages,
  pts,
  reminderDeliveries,
  reminderJobs,
  waMessageStatuses,
} from '@/lib/db/schema';
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

type BillingEventArgs =
  | {
      type: 'billing.limit_reached';
      /** Defaults to 'conversations' (C2). C3 passes 'reminders'. */
      kind?: 'conversations' | 'reminders';
      ptId: string;
      monthKey: string;
      used: number;
      limit: number;
      traceId?: string;
    }
  | {
      type: 'billing.limit_warning';
      /** Defaults to 'conversations' (C2). C3 passes 'reminders_predictive'. */
      kind?: 'conversations' | 'reminders' | 'reminders_predictive';
      ptId: string;
      monthKey: string;
      used: number;
      limit: number;
      remaining: number;
      /** Predictive-warning only: upcoming scheduled reminders this month. */
      upcoming?: number;
      traceId?: string;
    };

/**
 * Emit a billing limit event at most once per (PT, type, kind, month). Returns
 * the new event id (to publish immediately) or null when one already exists.
 * The events-exists dedupe runs inside the caller's transaction. `kind` defaults
 * to `conversations` (C2's gate); C3's reminder gate + monitor cron pass
 * `reminders` / `reminders_predictive` — the wider enum lives in the shared
 * background-event schema.
 */
async function emitBillingEventOnce(
  tx: DBTransaction,
  args: BillingEventArgs,
): Promise<string | null> {
  const dedupeKind = args.kind ?? 'conversations';
  const [existing] = await tx
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.ptId, args.ptId),
        eq(events.type, args.type),
        sql`${events.payload}->>'kind' = ${dedupeKind}`,
        sql`${events.payload}->>'monthKey' = ${args.monthKey}`,
      ),
    )
    .limit(1);
  if (existing) return null;

  if (args.type === 'billing.limit_reached') {
    const kind = args.kind ?? 'conversations';
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
  const kind = args.kind ?? 'conversations';
  return appendBackgroundEvent(tx, {
    type: 'billing.limit_warning',
    data: {
      ptId: args.ptId,
      kind,
      used: args.used,
      limit: args.limit,
      remaining: args.remaining,
      monthKey: args.monthKey,
      ...(args.upcoming !== undefined ? { upcoming: args.upcoming } : {}),
      traceId: args.traceId,
    },
  });
}

/**
 * Emit a billing limit event in its OWN transaction, then best-effort publish.
 * For callers outside the conversation gate's advisory-lock/transaction: the
 * reminder quota gate in `send-reminder` and the `billing-usage-monitor` cron.
 */
async function emitBillingLimitEventOnce(args: BillingEventArgs): Promise<void> {
  const publishEventId = await db.transaction((tx) =>
    emitBillingEventOnce(tx, args),
  );
  if (publishEventId) await tryPublishOutboxEvent(publishEventId);
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

// ---------------------------------------------------------------------------
// Reminder quota (Phase 16 C3). Reminders are counted ONLY on Meta delivery
// confirmation — one `reminder_deliveries` row per delivered wamid, written by
// the statuses webhook — never on send/queue. There is no stored counter: usage
// is derived per month.
// ---------------------------------------------------------------------------

/**
 * Half-open UTC bounds `[start, end)` of the calendar month containing `instant`
 * in the PT's timezone, plus the `YYYY-MM` key. Same zoned instant drives both,
 * so a 23:59 Tirane message counts against the Tirane month it happened in.
 */
function reminderMonthBounds(
  instant: Date,
  timezone: string,
): { monthKey: string; start: Date; end: Date } {
  const zoned = new TZDate(instant, timezone);
  const monthStart = startOfMonth(zoned);
  return {
    monthKey: format(zoned, 'yyyy-MM'),
    start: new Date(monthStart.getTime()),
    end: new Date(addMonths(monthStart, 1).getTime()),
  };
}

/**
 * Reminder templates Meta confirmed delivered within `[start, end)`.
 *
 * Counted from `reminder_deliveries` (one row per delivered wamid, 0026), not
 * from `reminder_jobs.delivered_at`: that column is a single scalar on a row
 * unique per appointment, so a rescheduled appointment's second — separately
 * billed — template was never counted, and the whole history vanished with the
 * patient when erasure cascaded the job rows away.
 */
async function countDeliveredReminders(
  ptId: string,
  start: Date,
  end: Date,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reminderDeliveries)
    .where(
      and(
        eq(reminderDeliveries.ptId, ptId),
        gte(reminderDeliveries.deliveredAt, start),
        lt(reminderDeliveries.deliveredAt, end),
      ),
    );
  return row?.count ?? 0;
}

/**
 * How long a sent-but-unconfirmed reminder can still hold a quota slot. Meta
 * queues an accepted template for up to ~30 days, so a reminder to a phone that
 * is simply switched off overnight IS still going to be delivered — and billed —
 * and must keep holding its slot. A shorter window traded the stuck-slot bug for
 * a quota bypass: ten evening reminders would drop out of `in_flight` before
 * midnight, re-open the whole cap, and bill twice the plan limit by morning.
 * The month clamp below is the practical bound; a send Meta has already reported
 * `failed` frees its slot immediately, whatever its age.
 */
const IN_FLIGHT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Reminders whose template Meta accepted (`status='sent'`, `sent_at` set) but
 * that Meta has neither delivered nor failed, within `[start, end)`. The gate
 * counts these so a burst can't overshoot the cap while `delivered` webhooks are
 * in transit.
 *
 * Delivery is read per-wamid from `wa_message_statuses`, not from
 * `reminder_jobs.delivered_at`: that column is a single scalar on a row that is
 * unique per appointment, so a reschedule leaves the PREVIOUS cycle's
 * `delivered_at` in place and the new cycle would be invisible to the gate.
 */
async function countInFlightReminders(
  ptId: string,
  start: Date,
  end: Date,
  now: Date,
): Promise<number> {
  // Never widen past the month clamp.
  const sentSince = new Date(
    Math.max(start.getTime(), now.getTime() - IN_FLIGHT_TTL_MS),
  );
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reminderJobs)
    .leftJoin(messages, eq(messages.id, reminderJobs.messageId))
    .leftJoin(
      waMessageStatuses,
      and(
        eq(waMessageStatuses.ptId, reminderJobs.ptId),
        eq(waMessageStatuses.externalId, messages.externalId),
      ),
    )
    .where(
      and(
        eq(reminderJobs.ptId, ptId),
        eq(reminderJobs.status, 'sent'),
        isNotNull(reminderJobs.sentAt),
        gte(reminderJobs.sentAt, sentSince),
        lt(reminderJobs.sentAt, end),
        isNull(waMessageStatuses.deliveredAt),
        isNull(waMessageStatuses.failedAt),
        // A stamped `delivered_at` with no message left to join (retention
        // purged it) is a delivery we can no longer see per-wamid — trust the
        // stamp rather than resurrecting the row as outstanding. With the
        // message still there, the stamp may belong to an earlier cycle, which
        // is exactly the case the per-wamid lookup above resolves.
        or(isNull(reminderJobs.deliveredAt), isNotNull(messages.id)),
      ),
    );
  return row?.count ?? 0;
}

export type ReminderUsage = {
  /** Meta-confirmed deliveries this month (authoritative usage). */
  delivered: number;
  /** Sent this month, neither delivered nor failed yet (gate-only guard). */
  inFlight: number;
  /** delivered + inFlight — the value the gate compares to the limit. */
  used: number;
  limit: number;
  remaining: number;
  monthKey: string;
};

/**
 * Monthly reminder usage for the PT's grace-aware effective plan. `used` counts
 * delivered + still-outstanding sends (conservative, for the send-time gate);
 * `delivered` alone is the authoritative figure for reporting.
 */
export async function getReminderUsage(
  ptId: string,
  now: Date = new Date(),
): Promise<ReminderUsage> {
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
  if (!pt) {
    return {
      delivered: 0,
      inFlight: 0,
      used: 0,
      limit: 0,
      remaining: 0,
      monthKey: '',
    };
  }

  const plan = resolveEffectivePlan(pt, now);
  const limit = getPlan(plan).remindersPerMonth;
  const { monthKey, start, end } = reminderMonthBounds(now, pt.timezone);
  const [delivered, inFlight] = await Promise.all([
    countDeliveredReminders(ptId, start, end),
    countInFlightReminders(ptId, start, end, now),
  ]);
  const used = delivered + inFlight;
  return {
    delivered,
    inFlight,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    monthKey,
  };
}

/**
 * Whether the PT may send another reminder now. Fails open when the limit can't
 * be resolved (pt missing → limit 0), matching the conversation gate's
 * `limit > 0` guards.
 */
export async function reminderQuotaAvailable(
  ptId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const { used, limit } = await getReminderUsage(ptId, now);
  return limit <= 0 ? true : used < limit;
}

/**
 * Reminders still queued (`scheduled`/`requeued`) for active appointments that
 * start between `now` and month end (PT tz) — the predictive-warning cron
 * compares this to `remaining`.
 */
export async function countScheduledRemindersInMonth(
  ptId: string,
  now: Date = new Date(),
): Promise<number> {
  const [pt] = await db
    .select({ timezone: pts.timezone })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);
  if (!pt) return 0;
  const { end } = reminderMonthBounds(now, pt.timezone);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reminderJobs)
    .innerJoin(appointments, eq(appointments.id, reminderJobs.appointmentId))
    .where(
      and(
        eq(reminderJobs.ptId, ptId),
        inArray(reminderJobs.status, ['scheduled', 'requeued']),
        inArray(appointments.status, ['pending', 'confirmed']),
        gt(appointments.startsAt, now),
        lt(appointments.startsAt, end),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Emit `billing.limit_reached{kind:'reminders'}` once this month — the reminder
 * gate calls this when a send is turned away at the cap, so the hard stop is
 * never silent (in addition to the flagged appointment badge).
 */
export async function emitReminderLimitReachedOnce(
  ptId: string,
  now: Date = new Date(),
  traceId?: string,
): Promise<void> {
  const { used, limit, monthKey } = await getReminderUsage(ptId, now);
  if (!monthKey || limit <= 0) return;
  await emitBillingLimitEventOnce({
    type: 'billing.limit_reached',
    kind: 'reminders',
    ptId,
    monthKey,
    used,
    limit,
    traceId,
  });
}

/**
 * Emit `billing.limit_warning{kind:'reminders_predictive'}` once this month when
 * upcoming scheduled reminders would exhaust the remaining quota.
 */
export async function emitReminderPredictiveWarningOnce(args: {
  ptId: string;
  monthKey: string;
  used: number;
  limit: number;
  remaining: number;
  upcoming: number;
  traceId?: string;
}): Promise<void> {
  await emitBillingLimitEventOnce({
    type: 'billing.limit_warning',
    kind: 'reminders_predictive',
    ptId: args.ptId,
    monthKey: args.monthKey,
    used: args.used,
    limit: args.limit,
    remaining: args.remaining,
    upcoming: args.upcoming,
    traceId: args.traceId,
  });
}

/**
 * Belt-and-braces conversation re-check for the monitor cron: re-emit the 80%
 * warning (or the reached event) if a race let the inline gate miss it. Deduped,
 * so this never double-fires with `checkAndRecordConversation`.
 */
export async function emitConversationUsageEventIfCrossed(
  ptId: string,
  now: Date = new Date(),
  traceId?: string,
): Promise<'reached' | 'warned' | 'none'> {
  const { used, limit, monthKey } = await getConversationUsage(ptId, now);
  if (!monthKey || limit <= 0) return 'none';
  if (used >= limit) {
    await emitBillingLimitEventOnce({
      type: 'billing.limit_reached',
      kind: 'conversations',
      ptId,
      monthKey,
      used,
      limit,
      traceId,
    });
    return 'reached';
  }
  if (used >= warnThreshold(limit)) {
    await emitBillingLimitEventOnce({
      type: 'billing.limit_warning',
      kind: 'conversations',
      ptId,
      monthKey,
      used,
      limit,
      remaining: limit - used,
      traceId,
    });
    return 'warned';
  }
  return 'none';
}
