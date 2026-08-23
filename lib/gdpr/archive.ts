import { db } from '@/lib/db';
import { erasureArchive } from '@/lib/db/schema';

/**
 * Record a compliance proof that an erasure happened. Uses the raw service-role
 * db so the row is written even as the tenant is being torn down (RLS is
 * deny-all for authenticated). Metadata must never carry PII.
 */
export async function recordErasureArchive(input: {
  accountId: string;
  scope: 'customer' | 'account';
  targetId?: string | null;
  beforeStateHash?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await db.insert(erasureArchive).values({
    accountId: input.accountId,
    scope: input.scope,
    targetId: input.targetId ?? null,
    beforeStateHash: input.beforeStateHash ?? null,
    metadata: input.metadata ?? null,
  });
}
