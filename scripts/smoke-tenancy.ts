import { config } from 'dotenv';
config({ path: '.env' });

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditLog, patients, pts } from '@/lib/db/schema';
import { TenancyError, getServiceClient, withAuditLog } from '@/lib/tenancy';
import { createServiceClient } from '@/lib/supabase/service';

async function expect<T>(label: string, actual: T, predicate: (v: T) => boolean) {
  const ok = predicate(actual);
  console.log(`${ok ? 'OK ' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got: ${JSON.stringify(actual)}`);
  return ok;
}

async function main() {
  const results: boolean[] = [];

  // 1. getServiceClient validation.
  let threw = false;
  try {
    getServiceClient(undefined);
  } catch (e) {
    threw = e instanceof TenancyError;
  }
  results.push(await expect('getServiceClient(undefined) throws TenancyError', threw, (v) => v));

  threw = false;
  try {
    getServiceClient('not-a-uuid');
  } catch (e) {
    threw = e instanceof TenancyError;
  }
  results.push(await expect('getServiceClient("not-a-uuid") throws TenancyError', threw, (v) => v));

  // 2. Create two test users via the service client; trigger should populate pts rows.
  const supabase = createServiceClient();
  const stamp = Date.now();
  const userA = `smoke-${stamp}-a@example.com`;
  const userB = `smoke-${stamp}-b@example.com`;

  const { data: aData, error: aErr } = await supabase.auth.admin.createUser({
    email: userA,
    email_confirm: true,
    password: 'smoke-password-1',
  });
  if (aErr || !aData.user) throw new Error(`create user A: ${aErr?.message}`);
  const ptIdA = aData.user.id;

  const { data: bData, error: bErr } = await supabase.auth.admin.createUser({
    email: userB,
    email_confirm: true,
    password: 'smoke-password-2',
  });
  if (bErr || !bData.user) throw new Error(`create user B: ${bErr?.message}`);
  const ptIdB = bData.user.id;

  console.log(`\nCreated test users: ${ptIdA}, ${ptIdB}`);

  // Verify pts rows were created by the trigger.
  const aRow = await db.select().from(pts).where(eq(pts.id, ptIdA));
  const bRow = await db.select().from(pts).where(eq(pts.id, ptIdB));
  results.push(await expect('trigger created pts row for user A', aRow.length, (n) => n === 1));
  results.push(await expect('pts row A has timezone Europe/Berlin', aRow[0]?.timezone, (v) => v === 'Europe/Berlin'));
  results.push(await expect('pts row A has retentionDays 90', aRow[0]?.retentionDays, (v) => v === 90));
  results.push(await expect('pts row A email matches', aRow[0]?.email, (v) => v === userA));
  results.push(await expect('trigger created pts row for user B', bRow.length, (n) => n === 1));

  // 3. getServiceClient with valid id returns ctx.
  const ctx = getServiceClient(ptIdA);
  results.push(await expect('getServiceClient returns the same ptId', ctx.ptId, (v) => v === ptIdA));

  // 4. Drizzle query through ctx.db works.
  const viaCtx = await ctx.db.select().from(pts).where(eq(pts.id, ctx.ptId));
  results.push(await expect('ctx.db query returns the pts row', viaCtx.length, (n) => n === 1));

  // 5. withAuditLog success path inserts one row.
  const beforeOk = await db.select().from(auditLog).where(eq(auditLog.ptId, ptIdA));
  const out = await withAuditLog(
    { ptId: ptIdA, actor: 'smoke', action: 'noop', targetTable: 'patients' },
    async () => 'fn-result' as const,
  );
  const afterOk = await db.select().from(auditLog).where(eq(auditLog.ptId, ptIdA));
  results.push(await expect('withAuditLog returns fn result', out, (v) => v === 'fn-result'));
  results.push(
    await expect('withAuditLog inserts exactly one audit row on success', afterOk.length - beforeOk.length, (d) => d === 1),
  );

  // 6. withAuditLog throw path inserts zero rows.
  let captured: unknown = null;
  try {
    await withAuditLog(
      { ptId: ptIdA, actor: 'smoke', action: 'fail', targetTable: 'patients' },
      async () => {
        throw new Error('boom');
      },
    );
  } catch (e) {
    captured = e;
  }
  const afterFail = await db.select().from(auditLog).where(eq(auditLog.ptId, ptIdA));
  results.push(await expect('withAuditLog rethrows on inner error', captured instanceof Error, (v) => v));
  results.push(
    await expect('withAuditLog writes nothing when inner throws', afterFail.length - afterOk.length, (d) => d === 0),
  );

  // 7. RLS smoke: cross-tenant query as user A should not see B's data.
  // Insert a patient row for B via service-role, then attempt to read it as user A.
  await db.insert(patients).values({ ptId: ptIdB, name: 'B-patient', phone: '+490000' });

  const { data: signedInA, error: signInErrA } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userA,
  });
  if (signInErrA) throw new Error(`magic link: ${signInErrA.message}`);
  // The properties.action_link contains a URL we'd hit to set cookies; for a server-side RLS
  // probe, simpler: sign in directly with password.
  void signedInA;

  const { createClient } = await import('@supabase/supabase-js');
  const userClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const { data: sess, error: sessErr } = await userClient.auth.signInWithPassword({
    email: userA,
    password: 'smoke-password-1',
  });
  if (sessErr || !sess.session) throw new Error(`sign in A: ${sessErr?.message}`);

  // userClient is now bound to A's JWT; RLS should filter B's rows out.
  const visibleAsA = await userClient.from('patients').select('*');
  if (visibleAsA.error) throw visibleAsA.error;
  results.push(
    await expect(
      'RLS: user A sees zero of B\'s patient rows',
      visibleAsA.data?.filter((r: { pt_id: string }) => r.pt_id === ptIdB).length,
      (n) => n === 0,
    ),
  );

  // Direct insert attempt for B's pt_id while authed as A should fail.
  const insertAsA = await userClient.from('patients').insert({ pt_id: ptIdB, name: 'x', phone: '+491' });
  results.push(
    await expect('RLS: user A cannot insert into B\'s tenant', insertAsA.error?.code, (v) => !!v),
  );

  // 8. Cleanup: deleting auth.users should cascade pts (and patients via FK).
  await supabase.auth.admin.deleteUser(ptIdA);
  await supabase.auth.admin.deleteUser(ptIdB);
  const aGone = await db.select().from(pts).where(eq(pts.id, ptIdA));
  const bGone = await db.select().from(pts).where(eq(pts.id, ptIdB));
  results.push(await expect('CASCADE: pts row A deleted with auth user', aGone.length, (n) => n === 0));
  results.push(await expect('CASCADE: pts row B deleted with auth user', bGone.length, (n) => n === 0));

  const ok = results.every(Boolean);
  console.log(`\n${ok ? 'ALL OK' : 'FAILURES'}: ${results.filter(Boolean).length}/${results.length}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
