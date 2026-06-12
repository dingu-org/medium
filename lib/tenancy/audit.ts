import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import { TenancyError } from './errors';

export type AuditInput = {
  ptId: string;
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
  if (!input.ptId) {
    throw new TenancyError('withAuditLog requires a ptId');
  }
  const result = await fn();
  await db.insert(auditLog).values({
    ptId: input.ptId,
    actor: input.actor,
    action: input.action,
    targetTable: input.targetTable,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? null,
  });
  return result;
}
