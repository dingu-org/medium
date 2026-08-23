import { ne } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core/query-builders/update';
import { db } from '@/lib/db';

/**
 * Isolation helpers for integration tests that drive a CROSS-TENANT production
 * query.
 *
 * Most of the suite is safe by construction: each file owns a PT and every
 * query it makes is scoped to that `accountId`. The exceptions are the operator-level
 * code paths — the admin funnel, the outbox publisher, the token-expiry claim —
 * which deliberately scan the whole table on the RLS-bypassing owner connection
 * because that is what a cron or an admin dashboard does. A test asserting on
 * one of those sees every other tenant's rows too, so its result depends on
 * whatever else happens to be in the local database.
 *
 * There are exactly two ways to make such an assertion deterministic, and which
 * one applies is decided by what the production function returns:
 *
 * - it returns a **tally** you cannot attribute to a tenant -> `excludeForeignRows`,
 *   so the test's own rows are the only candidates the scan can find;
 * - it returns a **measurement** you can take twice -> `deltaOf`, so the test
 *   asserts the change it caused rather than the absolute total.
 */

type TenantTable = PgTable & { accountId: PgColumn };

/**
 * Take every row of `table` that belongs to some OTHER tenant out of a global
 * scan's candidate set, by applying `patch` to it.
 *
 * `patch` should set whichever column the scan's own predicate excludes on
 * (`published_at` for the outbox publisher, `expiry_warning_sent_at` for the
 * token-expiry claim) — that is, it makes the foreign rows *ineligible*, not
 * absent. Prefer this to deleting them: deletion fights foreign keys, and
 * "already handled" is the true statement about another suite's leftovers.
 *
 * Safe because `fileParallelism` is off (see vitest.config.ts): no other file is
 * mid-run when this executes, and files that run later create their PT after it.
 */
export async function excludeForeignRows<T extends TenantTable>(
  table: T,
  accountId: string,
  patch: PgUpdateSetSource<T>,
): Promise<void> {
  await db.update(table).set(patch).where(ne(table.accountId, accountId));
}

/**
 * Field-by-field difference between two readings of the same numeric record —
 * for asserting what a test's own fixtures contributed to a cross-tenant
 * aggregate, instead of asserting a total that other tenants also feed.
 */
export function deltaOf<T extends Record<string, number>>(
  after: T,
  before: T,
): T {
  const out = {} as Record<string, number>;
  for (const key of Object.keys(after)) {
    out[key] = after[key] - before[key];
  }
  return out as T;
}
