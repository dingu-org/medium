import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL missing — Vitest could not load .env (cp .env.example .env)');
  }
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error(`Refusing to run tests against non-local DATABASE_URL: ${url}`);
  }

  const conn = postgres(url, { prepare: false, max: 1 });

  try {
    await conn`SELECT 1`;
  } catch (e) {
    await conn.end({ timeout: 1 }).catch(() => {});
    throw new Error(
      `Cannot connect to local Supabase Postgres at ${url}. Run \`supabase start\` first. ${(e as Error).message}`,
    );
  }

  await migrate(drizzle(conn), { migrationsFolder: './drizzle/migrations' });

  // Clear users (and cascades to all tenant data) from any prior run.
  await conn`DELETE FROM auth.users`;

  // `erasure_archive` is the ONE table the cascade above cannot reach: it has
  // no FK to `pts` by design, because a GDPR erasure record has to outlive the
  // account it describes. On a developer's box that means it is also the one
  // table that accumulates across every run forever, so clear it explicitly —
  // otherwise "clean database" quietly stops being true after the first run.
  await conn`DELETE FROM public.erasure_archive`;

  await conn.end({ timeout: 1 });
}
