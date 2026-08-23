import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import { TenancyError } from './errors';

export type AuditInput = {
  accountId: string;
  actor: string;
  action: string;
  targetTable: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function withAuditLog<T>(
  input: AuditInput,
  fn: () => Promise<T>,
): Promise<T> {
  if (!input.accountId) {
    throw new TenancyError('withAuditLog requires a accountId');
  }
  const result = await fn();
  await db.insert(auditLog).values({
    accountId: input.accountId,
    actor: input.actor,
    action: input.action,
    targetTable: input.targetTable,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? null,
  });
  return result;
}
