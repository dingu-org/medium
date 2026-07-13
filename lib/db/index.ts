import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required');
}

type Sql = ReturnType<typeof postgres>;

// In dev, Next.js re-evaluates this module on every recompile; without a
// global cache each HMR cycle opens a fresh pool and the old ones linger
// until Postgres runs out of connection slots (53300 on the local stack).
const globalForDb = globalThis as unknown as { __mediumPgClient?: Sql };

// idle_timeout/max_lifetime: Supabase's pooler (and NATs in between) silently
// drop TCP sockets that idle for a few minutes; postgres-js would otherwise
// keep them pooled forever and queries sent on a dead socket hang with no
// timeout. Symptom: routes that fan out many concurrent queries (e.g. /admin's
// Promise.all) stall at the loading skeleton while low-concurrency routes
// keep working on the still-warm connections.
const client =
  globalForDb.__mediumPgClient ??
  postgres(url, {
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });
if (process.env.NODE_ENV !== 'production') {
  globalForDb.__mediumPgClient = client;
}

export const db = drizzle(client, { schema });
export type DB = typeof db;
export type DBTransaction = Parameters<Parameters<DB['transaction']>[0]>[0];
export { schema };
