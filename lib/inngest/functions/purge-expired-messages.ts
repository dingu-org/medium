import { db } from '@/lib/db';
import { auditLog, accounts } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { effectiveRetentionDays } from '@/lib/billing/entitlements';
import { inngest } from '../client';

export type PurgeResult = {
  accountId: string;
  retentionDays: number;
  deletedCount: number;
  /** Domain-event rows dropped by the same window (see purgeAccountExpiredMessages). */
  deletedEventCount: number;
};

export const AUDIT_LOG_RETENTION_DAYS = 730; // GDPR-minimum for healthcare-adjacent context — pending legal confirmation

/**
 * Purge audit-log rows older than the retention window. Flat global window (not
 * per-tenant), so a single delete suffices.
 */
export async function purgeExpiredAuditLog(
  now = new Date(),
): Promise<{ deletedCount: number }> {
  const cutoff = new Date(
    now.getTime() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const deleted = await db.execute<{ id: string }>(sql`
    DELETE FROM audit_log
    WHERE occurred_at < ${cutoff.toISOString()}::timestamptz
    RETURNING id
  `);
  return { deletedCount: deleted.length };
}

export async function purgeAccountExpiredMessages(args: {
  accountId: string;
  retentionDays: number;
  now?: Date;
}): Promise<PurgeResult> {
  const now = args.now ?? new Date();
  const cutoff = new Date(
    now.getTime() - args.retentionDays * 24 * 60 * 60 * 1000,
  );

  return db.transaction(async (tx) => {
    const deleted = await tx.execute<{ id: string }>(sql`
      DELETE FROM messages AS message
      WHERE message.account_id = ${args.accountId}
        AND message.created_at < ${cutoff.toISOString()}::timestamptz
        AND NOT EXISTS (
          SELECT 1
          FROM reminder_jobs AS reminder
          INNER JOIN appointments AS appointment
            ON appointment.id = reminder.appointment_id
          WHERE reminder.message_id = message.id
            AND appointment.status IN ('pending', 'confirmed')
        )
      RETURNING message.id
    `);

    // `events` is a personal-data store too: appointment events carry the
    // customer id and the schedule (and erasure itself appends them), so leaving
    // the table out of retention kept an erased customer's appointments forever.
    // Two carve-outs: a row the outbox has not published yet is still owed to a
    // consumer (and event_outbox cascades from it), and `billing.*` rows ARE the
    // once-per-month dedupe key for limit warnings — deleting one late in a long
    // month would re-notify the PT for usage they were already told about.
    const deletedEvents = await tx.execute<{ id: string }>(sql`
      DELETE FROM events AS event
      WHERE event.account_id = ${args.accountId}
        AND event.occurred_at < ${cutoff.toISOString()}::timestamptz
        AND event.type NOT LIKE 'billing.%'
        AND NOT EXISTS (
          SELECT 1
          FROM event_outbox AS outbox
          WHERE outbox.event_id = event.id
            AND outbox.published_at IS NULL
        )
      RETURNING event.id
    `);

    const result = {
      accountId: args.accountId,
      retentionDays: args.retentionDays,
      deletedCount: deleted.length,
      deletedEventCount: deletedEvents.length,
    };
    await tx.insert(auditLog).values({
      accountId: args.accountId,
      actor: 'system',
      action: 'messages.retention_purge',
      targetTable: 'messages',
      metadata: {
        deletedCount: result.deletedCount,
        deletedEventCount: result.deletedEventCount,
        retentionDays: args.retentionDays,
        cutoff: cutoff.toISOString(),
      },
    });
    return result;
  });
}

/**
 * Load every tenant with the retention window that applies at `now` (Phase 16
 * C6). `effectiveRetentionDays` honors the PT's stored setting for 30 days after
 * a plan downgrade, then clamps to the effective plan's max (30d on Free) —
 * applyOrderOutcome nulls plan_downgraded_at on re-upgrade so the clamp lifts.
 * Both purge entry points (this core AND the Inngest step) use this to stay
 * identical.
 */
export async function loadRetentionTenants(
  now: Date,
): Promise<{ accountId: string; retentionDays: number }[]> {
  const rows = await db
    .select({
      id: accounts.id,
      plan: accounts.plan,
      planLifetime: accounts.planLifetime,
      planExpiresAt: accounts.planExpiresAt,
      planDowngradedAt: accounts.planDowngradedAt,
      retentionDays: accounts.retentionDays,
    })
    .from(accounts);
  return rows.map((account) => ({
    accountId: account.id,
    retentionDays: effectiveRetentionDays(account, now),
  }));
}

export async function purgeExpiredMessagesCore(
  now = new Date(),
): Promise<PurgeResult[]> {
  const tenants = await loadRetentionTenants(now);
  const results: PurgeResult[] = [];
  for (const tenant of tenants) {
    results.push(await purgeAccountExpiredMessages({ ...tenant, now }));
  }
  return results;
}

export const purgeExpiredMessages = inngest.createFunction(
  {
    id: 'purge-expired-messages',
    retries: 2,
    concurrency: 1,
  },
  { cron: '0 3 * * *' },
  async ({ step }) => {
    const tenants = await step.run('load-retention-tenants', () =>
      loadRetentionTenants(new Date()),
    );
    const results: PurgeResult[] = [];
    for (const tenant of tenants) {
      results.push(
        await step.run(`purge-messages-${tenant.accountId}`, () =>
          purgeAccountExpiredMessages(tenant),
        ),
      );
    }
    const auditPurge = await step.run('purge-audit-log', () =>
      purgeExpiredAuditLog(),
    );
    return { tenants: results, auditPurge };
  },
);
