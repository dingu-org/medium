import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { assertEnvironmentIntegrity } from './lib/env/guard';

// Which environment's credentials to load. Defaults to development so a bare
// `drizzle-kit` invocation can only ever reach the local stack; the deployed
// environments are opt-in through the `db:migrate:preview` / `db:migrate:prod`
// scripts, which set both variables explicitly.
//
// `override: true` because the point of naming a file is that the file wins —
// a DATABASE_URL left over in the shell must not silently redirect a migration.
const envFile = process.env.ENV_FILE ?? '.env.local';
config({ path: envFile, override: true });

// A migration is the single most destructive thing pointed at a database, so
// it gets the same project-ref assertion the running app does: refuse to
// migrate unless the credentials belong to the environment being targeted.
assertEnvironmentIntegrity();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(`DATABASE_URL is required (check ${envFile})`);
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
