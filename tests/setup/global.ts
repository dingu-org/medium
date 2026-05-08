import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL missing — Vitest could not load .env.test');
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

  await conn.end({ timeout: 1 });
}
