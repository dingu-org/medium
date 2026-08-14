import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Deletes the auth user with `email` (and, via FK cascade from `pts`, every row
 * scoped to it). No-op if absent.
 *
 * The address is resolved against `auth.users` directly rather than by scanning
 * `auth.admin.listUsers`: that API is paged newest-first, so every caller that
 * reached for it was really asking "is this user among the 200 most recent?".
 * Seed users are by nature old — you seed once and then keep working — and a
 * developer's local database accumulates users fast, since every integration
 * test file creates one and an interrupted run never cleans them up. Past 200
 * newer users the lookup missed, the delete silently no-op'd, and the
 * `createUser` that follows failed on the duplicate address. That made both seed
 * scripts fail as a function of how much junk was already in the database, which
 * is precisely the failure mode seeding exists to remove. Verified: with the
 * seed user plus 250 newer ones, the paged lookup does not find it.
 *
 * `db` is the RLS-bypassing owner connection; the GoTrue admin API still
 * performs the delete so its own bookkeeping (sessions, identities) is honoured.
 */
export async function deleteAuthUserByEmail(
  email: string,
  supabase: ReturnType<typeof createServiceClient> = createServiceClient(),
): Promise<void> {
  const rows = await db.execute<{ id: string }>(
    sql`SELECT id FROM auth.users WHERE email = ${email}`,
  );
  for (const row of rows) {
    const { error } = await supabase.auth.admin.deleteUser(row.id);
    if (error) throw error;
  }
}
