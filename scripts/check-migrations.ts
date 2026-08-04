/**
 * The applied-migrations backstop (`pnpm check:migrations`).
 *
 * Vercel runs this before `next build` (vercel.json `buildCommand`), so a
 * merge whose migration was never applied becomes a red deploy instead of a
 * runtime crash — the failure mode this exists for is "merged to preview/main,
 * forgot `db:migrate:*`".
 *
 * Direction matters: the database being *ahead* of the code is fine — the
 * documented order is migrate first, merge second, so every deploy briefly
 * runs against a database newer than itself. Only *behind* fails.
 */
import { config as loadDotenv } from 'dotenv';
import postgres from 'postgres';
import { assertEnvironmentIntegrity } from '@/lib/env/guard';
import journal from '@/drizzle/migrations/meta/_journal.json';

// Ambient env wins (dotenv never overrides), so on Vercel — where no env file
// exists — this is a no-op and the deployment's own variables are checked.
// Locally it defaults to the dev environment; ENV_FILE targets another one.
loadDotenv({ path: process.env.ENV_FILE ?? '.env.local', quiet: true });

type JournalEntry = { when: number; tag: string };

/**
 * Journal entries with no matching applied row. The drizzle migrator records
 * one row per applied migration with `created_at` equal to the journal's
 * `when`, which makes the timestamp the join key.
 */
export function missingMigrations(
  entries: readonly JournalEntry[],
  appliedWhens: ReadonlySet<number>,
): JournalEntry[] {
  return entries.filter((entry) => !appliedWhens.has(entry.when));
}

async function main(): Promise<number> {
  // Never validate against the wrong database: the same project-ref assertion
  // the app boots with runs first, so on a misconfigured deploy this fails
  // for the real reason (wrong project) rather than a confusing one (schema).
  assertEnvironmentIntegrity();

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    return 1;
  }

  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });
  try {
    // A database with no migrations table at all has everything missing —
    // treat it as zero applied rather than crashing on the query.
    const applied = await sql<{ created_at: string | number }[]>`
      select created_at
      from drizzle.__drizzle_migrations
    `.catch(() => []);

    const appliedWhens = new Set(applied.map((row) => Number(row.created_at)));
    const missing = missingMigrations(journal.entries, appliedWhens);

    if (missing.length === 0) {
      console.log(
        `✓ migrations: all ${journal.entries.length} in the repo are applied` +
          (appliedWhens.size > journal.entries.length
            ? ` (database is ${appliedWhens.size - journal.entries.length} ahead — fine)`
            : ''),
      );
      return 0;
    }

    console.error(
      `Database is behind the code by ${missing.length} migration${
        missing.length === 1 ? '' : 's'
      }:`,
    );
    for (const entry of missing) console.error(`  • ${entry.tag}`);
    console.error(
      `Apply them first (pnpm db:migrate / db:migrate:preview / db:migrate:prod).`,
    );
    return 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Import-safe so the unit test can use missingMigrations without connecting.
if (process.argv[1]?.endsWith('check-migrations.ts')) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
