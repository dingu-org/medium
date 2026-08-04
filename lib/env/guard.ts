import { resolveAppEnv, type AppEnv } from './app-env';
import { requiredVarsFor } from './env-vars';
import {
  ENVIRONMENTS,
  supabaseProjectRefFromDatabaseUrl,
  supabaseProjectRefFromUrl,
  type EnvironmentIdentity,
} from './environments';

type EnvRecord = Readonly<Record<string, string | undefined>>;

/** Injectable so tests exercise the rules, not whichever refs are live today. */
export type EnvironmentManifest = Readonly<Record<AppEnv, EnvironmentIdentity>>;

export type EnvProblem = {
  /** Stable identifier so tests assert on the fault, not on wording. */
  code: 'unprovisioned' | 'wrong-project' | 'unrecognised-url' | 'missing';
  variable: string;
  message: string;
};

export type EnvIntegrityReport = {
  appEnv: AppEnv;
  expectedSupabaseRef: string | null;
  problems: readonly EnvProblem[];
};

/**
 * Every variable that points at a Supabase project, and how to reduce it to a
 * project ref. Kept as one list so a new connection string cannot be added
 * without deciding how it gets checked.
 */
const SUPABASE_POINTERS = [
  { variable: 'NEXT_PUBLIC_SUPABASE_URL', extract: supabaseProjectRefFromUrl },
  { variable: 'SUPABASE_URL', extract: supabaseProjectRefFromUrl },
  { variable: 'DATABASE_URL', extract: supabaseProjectRefFromDatabaseUrl },
] as const;

/**
 * Does this process point at the database its environment is allowed to touch,
 * and is everything it needs actually set? Pure — returns findings rather than
 * throwing, so the CLI can report all of them at once and tests can assert.
 */
export function checkEnvironmentIntegrity(
  env: EnvRecord = process.env,
  manifest: EnvironmentManifest = ENVIRONMENTS,
): EnvIntegrityReport {
  const appEnv = resolveAppEnv(env);
  const expected = manifest[appEnv].supabaseProjectRef;
  const problems: EnvProblem[] = [];

  if (expected === null) {
    problems.push({
      code: 'unprovisioned',
      variable: 'ENVIRONMENTS',
      message:
        `The '${appEnv}' environment has no Supabase project declared in ` +
        `lib/env/environments.ts. Provision it and record its ref before ` +
        `running here — see docs/environments.md.`,
    });
  }

  for (const { variable, extract } of SUPABASE_POINTERS) {
    const raw = env[variable];
    if (!raw) continue; // Absence is the presence check's job, below.
    const actual = extract(raw);
    if (actual === null) {
      problems.push({
        code: 'unrecognised-url',
        variable,
        message:
          `${variable} does not look like a Supabase URL, so it cannot be ` +
          `checked against the '${appEnv}' project.`,
      });
      continue;
    }
    if (expected !== null && actual !== expected) {
      problems.push({
        code: 'wrong-project',
        variable,
        message:
          `${variable} points at Supabase project '${actual}', but the ` +
          `'${appEnv}' environment is declared to use '${expected}'.`,
      });
    }
  }

  for (const spec of requiredVarsFor(appEnv)) {
    if (!env[spec.name]?.trim()) {
      problems.push({
        code: 'missing',
        variable: spec.name,
        message: `${spec.name} is required in '${appEnv}': ${spec.description}`,
      });
    }
  }

  return { appEnv, expectedSupabaseRef: expected, problems };
}

export function formatEnvProblems(report: EnvIntegrityReport): string {
  const lines = report.problems.map((p) => `  • ${p.message}`);
  return (
    `Environment check failed for '${report.appEnv}' ` +
    `(${report.problems.length} problem${report.problems.length === 1 ? '' : 's'}):\n` +
    lines.join('\n')
  );
}

/**
 * Fail closed. One documented escape hatch, `ALLOW_ENV_MISMATCH=1`, which
 * behaves identically in all three environments — deliberately, so there is no
 * environment where a mismatch is quietly tolerated by default and no second
 * mechanism to remember. Use it when you genuinely mean to point a local
 * process at a deployed database (a migration, a one-off backfill).
 */
export function assertEnvironmentIntegrity(
  env: EnvRecord = process.env,
  manifest: EnvironmentManifest = ENVIRONMENTS,
): void {
  const report = checkEnvironmentIntegrity(env, manifest);
  if (report.problems.length === 0) return;

  const message = formatEnvProblems(report);
  if (env.ALLOW_ENV_MISMATCH === '1') {
    console.error(`${message}\n  (continuing: ALLOW_ENV_MISMATCH=1)`);
    return;
  }
  throw new Error(
    `${message}\n` +
      `  Set ALLOW_ENV_MISMATCH=1 to proceed anyway. See docs/environments.md.`,
  );
}
