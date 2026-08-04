/**
 * Environment checks, in two modes.
 *
 *   pnpm check:env          validate the environment this process is running in
 *   pnpm check:env:vercel   validate how the Vercel project is wired
 *
 * The second mode is the important one. The defect it exists to catch is not a
 * wrong value — it is a *shared* value: until 2026-08-04 every variable was a
 * single Vercel entry whose `target` was `["preview","production"]`, so the two
 * deployed environments were the same environment wearing two names. Vercel
 * marks most of them sensitive, so their values cannot be read back and
 * compared; the target list can, and it is the stronger signal anyway — two
 * environments are only genuinely separate when each has its own entry.
 *
 * Neither mode ever prints a value.
 */
import { execFileSync } from 'node:child_process';
import type { AppEnv } from '@/lib/env/app-env';
import { ENV_VARS_BY_NAME, requiredVarsFor } from '@/lib/env/env-vars';
import { checkEnvironmentIntegrity, formatEnvProblems } from '@/lib/env/guard';

/** Vercel's target names for the two deployed environments. */
const DEPLOYED_TARGETS = ['preview', 'production'] as const satisfies readonly AppEnv[];

type VercelEnvEntry = { key: string; target?: string[] };

function checkLocal(): number {
  const report = checkEnvironmentIntegrity(process.env);
  if (report.problems.length === 0) {
    console.log(
      `✓ ${report.appEnv}: ${requiredVarsFor(report.appEnv).length} required ` +
        `variables present, Supabase project '${report.expectedSupabaseRef}' as declared.`,
    );
    return 0;
  }
  console.error(formatEnvProblems(report));
  return 1;
}

function readVercelEnv(): VercelEnvEntry[] {
  const stdout = execFileSync('vercel', ['env', 'ls', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  // The CLI prefixes its banner on some versions; start at the JSON payload.
  const start = stdout.indexOf('{');
  if (start === -1) throw new Error('`vercel env ls --json` returned no JSON');
  const parsed = JSON.parse(stdout.slice(start)) as { envs?: VercelEnvEntry[] };
  if (!parsed.envs) throw new Error('`vercel env ls --json` returned no envs');
  return parsed.envs;
}

function checkVercel(): number {
  const entries = readVercelEnv();

  /** name → the set of targets it is configured for, across all entries. */
  const targets = new Map<string, Set<string>>();
  /** name → true when one single entry serves both deployed targets. */
  const shared = new Set<string>();

  for (const entry of entries) {
    const entryTargets = entry.target ?? [];
    const existing = targets.get(entry.key) ?? new Set<string>();
    for (const target of entryTargets) existing.add(target);
    targets.set(entry.key, existing);

    if (DEPLOYED_TARGETS.every((target) => entryTargets.includes(target))) {
      shared.add(entry.key);
    }
  }

  const problems: string[] = [];

  for (const name of [...shared].sort()) {
    const spec = ENV_VARS_BY_NAME.get(name);
    if (!spec?.mustDiffer) continue;
    problems.push(
      `${name} is one variable targeting both Preview and Production, so the ` +
        `two environments share it. Split it: ${spec.description}`,
    );
  }

  for (const target of DEPLOYED_TARGETS) {
    for (const spec of requiredVarsFor(target)) {
      if (!targets.get(spec.name)?.has(target)) {
        problems.push(`${spec.name} is not set for ${target}.`);
      }
    }
  }

  const undocumented = [...targets.keys()]
    .filter((name) => !ENV_VARS_BY_NAME.has(name))
    .sort();

  if (problems.length > 0) {
    console.error(
      `Vercel environment check failed (${problems.length} problem${
        problems.length === 1 ? '' : 's'
      }):`,
    );
    for (const problem of problems) console.error(`  • ${problem}`);
  } else {
    console.log(
      `✓ Vercel: Preview and Production have separate entries for every ` +
        `variable that must differ, and all required variables are set.`,
    );
  }

  if (undocumented.length > 0) {
    // Not a failure: an operator may add something ahead of the code. But an
    // undocumented variable is one nobody is checking, so say so.
    console.warn(
      `\n  Set in Vercel but absent from lib/env/env-vars.ts (unchecked): ` +
        undocumented.join(', '),
    );
  }

  return problems.length > 0 ? 1 : 0;
}

function main(): number {
  const mode = process.argv[2];
  if (mode === '--vercel') return checkVercel();
  if (mode && mode !== '--local') {
    console.error(`Usage: check-env [--local|--vercel]`);
    return 2;
  }
  return checkLocal();
}

process.exitCode = main();
