import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { TenancyError, withAuditLog } from '@/lib/tenancy';

const stamp = Date.now();
const email = `audit-${stamp}@example.com`;
let ptId = '';

beforeAll(async () => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: 'audit-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  ptId = data.user.id;
});

afterAll(async () => {
  if (ptId) {
    const supabase = createServiceClient();
    await supabase.auth.admin.deleteUser(ptId);
  }
});

describe('withAuditLog', () => {
  it('throws TenancyError if ptId is missing', async () => {
    await expect(
      withAuditLog(
        { ptId: '', actor: 'svc', action: 'a', targetTable: 'patients' },
        async () => null,
      ),
    ).rejects.toBeInstanceOf(TenancyError);
  });

  it('returns the inner result and writes one audit row on success', async () => {
    const before = await db.select().from(auditLog).where(eq(auditLog.ptId, ptId));

    const result = await withAuditLog(
      { ptId, actor: 'svc', action: 'unit-test', targetTable: 'patients' },
      async () => 'inner-result' as const,
    );
    expect(result).toBe('inner-result');

    const after = await db.select().from(auditLog).where(eq(auditLog.ptId, ptId));
    expect(after.length - before.length).toBe(1);
    expect(after.at(-1)?.action).toBe('unit-test');
  });

  it('rethrows and writes nothing when the inner fn throws', async () => {
    const before = await db.select().from(auditLog).where(eq(auditLog.ptId, ptId));

    await expect(
      withAuditLog(
        { ptId, actor: 'svc', action: 'fail', targetTable: 'patients' },
        async () => {
          throw new Error('boom');
        },
      ),
    ).rejects.toThrow('boom');

    const after = await db.select().from(auditLog).where(eq(auditLog.ptId, ptId));
    expect(after.length).toBe(before.length);
  });
});
