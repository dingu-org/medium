import { db } from '@/lib/db';
import { auditLog, pts } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { inngest } from '../client';

export type PurgeResult = {
  ptId: string;
  retentionDays: number;
  deletedCount: number;
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

export async function purgePtExpiredMessages(args: {
  ptId: string;
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
      WHERE message.pt_id = ${args.ptId}
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

    const result = {
      ptId: args.ptId,
      retentionDays: args.retentionDays,
      deletedCount: deleted.length,
    };
    await tx.insert(auditLog).values({
      ptId: args.ptId,
      actor: 'system',
      action: 'messages.retention_purge',
      targetTable: 'messages',
      metadata: {
        deletedCount: result.deletedCount,
        retentionDays: args.retentionDays,
        cutoff: cutoff.toISOString(),
      },
    });
    return result;
  });
}

export async function purgeExpiredMessagesCore(
  now = new Date(),
): Promise<PurgeResult[]> {
  const tenants = await db
    .select({ ptId: pts.id, retentionDays: pts.retentionDays })
    .from(pts);
  const results: PurgeResult[] = [];
  for (const tenant of tenants) {
    results.push(await purgePtExpiredMessages({ ...tenant, now }));
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
      db.select({ ptId: pts.id, retentionDays: pts.retentionDays }).from(pts),
    );
    const results: PurgeResult[] = [];
    for (const tenant of tenants) {
      results.push(
        await step.run(`purge-messages-${tenant.ptId}`, () =>
          purgePtExpiredMessages(tenant),
        ),
      );
    }
    const auditPurge = await step.run('purge-audit-log', () =>
      purgeExpiredAuditLog(),
    );
    return { tenants: results, auditPurge };
  },
);
