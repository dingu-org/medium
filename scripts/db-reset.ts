import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
  throw new Error(`Refusing to reset non-local DATABASE_URL: ${url}`);
}

const conn = postgres(url, { prepare: false, max: 1 });

try {
  await conn`DROP SCHEMA IF EXISTS public CASCADE`;
  await conn`CREATE SCHEMA public`;
  await conn`GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role`;
  await conn`GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role`;
  await conn`GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role`;
  await conn`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role`;

  await migrate(drizzle(conn), { migrationsFolder: './drizzle/migrations' });

  await conn`DELETE FROM auth.users`;

  console.log('Local DB reset and migrated.');
} finally {
  await conn.end({ timeout: 1 });
}
