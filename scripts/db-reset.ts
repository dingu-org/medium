import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
  throw new Error(`Refusing to reset non-local DATABASE_URL: ${url}`);
}

const conn = postgres(url, { prepare: false, max: 1 });

async function main() {
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

    await conn`DELETE FROM auth.users`;

    console.log('Local DB reset and migrated.');
  } finally {
    await conn.end({ timeout: 1 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
