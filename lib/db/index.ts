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

const client =
  globalForDb.__mediumPgClient ?? postgres(url, { prepare: false });
if (process.env.NODE_ENV !== 'production') {
  globalForDb.__mediumPgClient = client;
}

export const db = drizzle(client, { schema });
export type DB = typeof db;
export type DBTransaction = Parameters<Parameters<DB['transaction']>[0]>[0];
export { schema };
