/**
 * The backstop against the real thing: the local stack is migrated by the
 * vitest global setup, so the journal must reconcile cleanly with the actual
 * `drizzle.__drizzle_migrations` table — proving the join key (`created_at`
 * mirrors the journal's `when`) holds for the migrator we actually use, not
 * just for the fixtures in the unit test.
 */
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import journal from '@/drizzle/migrations/meta/_journal.json';
import { missingMigrations } from '../check-migrations';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe('check-migrations against the local stack', () => {
  it('finds every journal entry applied', async () => {
    const applied = await sql<{ created_at: string | number }[]>`
      select created_at from drizzle.__drizzle_migrations
    `;
    const appliedWhens = new Set(applied.map((row) => Number(row.created_at)));

    expect(missingMigrations(journal.entries, appliedWhens)).toEqual([]);
    expect(appliedWhens.size).toBeGreaterThanOrEqual(journal.entries.length);
  });

  it('would flag a migration that exists in the repo but was never applied', async () => {
    const applied = await sql<{ created_at: string | number }[]>`
      select created_at from drizzle.__drizzle_migrations
    `;
    const appliedWhens = new Set(applied.map((row) => Number(row.created_at)));

    const phantom = { when: Date.now() + 1_000_000, tag: '9999_not_applied' };
    expect(missingMigrations([...journal.entries, phantom], appliedWhens)).toEqual(
      [phantom],
    );
  });
});
