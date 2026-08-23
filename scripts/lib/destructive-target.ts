import { resolveAppEnv } from '@/lib/env/app-env';
import {
  ENVIRONMENTS,
  supabaseProjectRefFromDatabaseUrl,
  supabaseProjectRefFromUrl,
} from '@/lib/env/environments';

/**
 * The one gate every destructive data script passes through — seeds, seed
 * resets, and the full database reset alike. They may target development (the
 * local stack, the default) or preview (`APP_ENV=preview` + the pulled env
 * file) — never production, under any flag. `ALLOW_ENV_MISMATCH` is the escape
 * hatch for migrations and backfills, not data wipes, so this gate
 * deliberately does not consult it.
 *
 * Both endpoints are checked because they are two different blast radii: the
 * Postgres URL is where rows are written and dropped, the Supabase URL is
 * where auth-admin calls (deleteUser/createUser) land. Each must belong to the
 * target environment, or a mixed configuration could pass on one and destroy
 * through the other.
 */
export function assertDestructiveTarget(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  const appEnv = resolveAppEnv(env);
  if (appEnv === 'production') {
    throw new Error(
      'Wiping production is not a thing. There is no override for this.',
    );
  }

  const expected = ENVIRONMENTS[appEnv].supabaseProjectRef;
  if (expected === null) {
    throw new Error(
      `The '${appEnv}' environment has no Supabase project declared in ` +
        `lib/env/environments.ts — provision it before wiping it.`,
    );
  }
  const productionRef = ENVIRONMENTS.production.supabaseProjectRef;

  const pointers = [
    {
      name: 'DATABASE_URL',
      ref: supabaseProjectRefFromDatabaseUrl(env.DATABASE_URL),
    },
    { name: 'SUPABASE_URL', ref: supabaseProjectRefFromUrl(env.SUPABASE_URL) },
  ];
  for (const { name, ref } of pointers) {
    // Belt and braces: even if the manifest were misdeclared, the production
    // ref is never a legal target.
    if (productionRef !== null && ref === productionRef) {
      throw new Error(`Refusing to run: ${name} points at production.`);
    }
    if (ref !== expected) {
      throw new Error(
        `Refusing to run: ${name} resolves to Supabase project ` +
          `'${ref ?? 'unrecognised'}', but the '${appEnv}' environment uses ` +
          `'${expected}'.`,
      );
    }
  }
}
