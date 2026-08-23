/**
 * Wipes a database back to bare migrated schema: no rows, no auth users,
 * nothing seeded. Development (the local stack) and preview are the only legal
 * targets — `assertDestructiveTarget` refuses production under any flag.
 *
 * Run: pnpm db:reset:test        (local stack via .env)
 *      pnpm db:reset:preview     (preview project via .env.vercel.preview)
 *
 * Unlike `seed:reset`, this does not reseed. Follow it with `pnpm seed:qa` /
 * `pnpm seed:qa:preview` if you want fixtures back.
 */
import { createInterface } from 'node:readline/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { resolveAppEnv } from '@/lib/env/app-env';
import { assertDestructiveTarget } from './lib/destructive-target';

assertDestructiveTarget();

const appEnv = resolveAppEnv();
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  return url;
}

/**
 * The guard already proved which project this is; the prompt is about intent,
 * not identity. Local resets are cheap and routine, so only a remote target
 * asks — and `--yes` exists for non-interactive runs.
 */
async function confirm(): Promise<void> {
  if (appEnv === 'development' || process.argv.includes('--yes')) return;
  if (!process.stdin.isTTY) {
    throw new Error(
      `Refusing to wipe '${appEnv}' non-interactively without --yes.`,
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `This deletes ALL data and users in the '${appEnv}' database.\n` +
        `Type '${appEnv}' to confirm: `,
    );
    if (answer.trim() !== appEnv) throw new Error('Aborted.');
  } finally {
    rl.close();
  }
}

async function main() {
  await confirm();

  const conn = postgres(databaseUrl(), { prepare: false, max: 1 });
  try {
    await conn`DROP SCHEMA IF EXISTS drizzle CASCADE`;
    await conn`DROP SCHEMA IF EXISTS public CASCADE`;
    await conn`CREATE SCHEMA public`;
    // A recreated schema grants nothing, and this Supabase image has no
    // pg_default_acl row for `public`, so PostgREST/Realtime cannot reach the
    // migrated objects until the API roles get USAGE back.
    await conn`GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role`;

    await migrate(drizzle(conn), { migrationsFolder: './drizzle/migrations' });

    // Re-grant at the posture 0024 defines, never wider: the tenant surface on
    // /rest/v1 is read-only, so anon/authenticated get SELECT (all Realtime
    // postgres_changes needs) and nothing else. `GRANT ALL` here would re-open
    // INSERT/UPDATE/DELETE on every table and silently undo 0024 in dev and QA.
    await conn`GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role`;
    await conn`GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, service_role`;
    await conn`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role`;
    await conn`GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated`;

    // The auth schema is untouched by the drop above, so this is the step that
    // actually empties it. It runs after the migration so the 0003 trigger
    // (auth.users -> public.accounts) is back in place and the two stay consistent.
    await conn`DELETE FROM auth.users`;

    console.log(
      `Reset '${appEnv}' DB: schema re-migrated, all data and users deleted.`,
    );
  } finally {
    await conn.end({ timeout: 1 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
