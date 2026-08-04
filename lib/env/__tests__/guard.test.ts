import { describe, expect, it, vi } from 'vitest';
import { requiredVarsFor } from '../env-vars';
import type { EnvironmentManifest } from '../guard';
import { assertEnvironmentIntegrity, checkEnvironmentIntegrity } from '../guard';

/**
 * A fixture manifest, so these tests describe the *rules* and keep passing
 * while the real refs in `environments.ts` are still being provisioned. The
 * real manifest's own invariants are covered in `environments.test.ts`.
 */
const MANIFEST: EnvironmentManifest = {
  development: { supabaseProjectRef: 'local', appUrl: 'http://localhost:3000' },
  preview: { supabaseProjectRef: 'previewref', appUrl: 'https://preview.test' },
  production: { supabaseProjectRef: null, appUrl: 'https://prod.test' },
};

const OTHER_REF = 'previewref';

/** Every var required in `development`, filled with a plausible local value. */
function localEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    APP_ENV: 'development',
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  };
  for (const spec of requiredVarsFor('development')) {
    base[spec.name] ??= 'set';
  }
  return { ...base, ...overrides };
}

function codes(env: Record<string, string | undefined>) {
  return checkEnvironmentIntegrity(env, MANIFEST).problems.map((p) => p.code);
}

describe('checkEnvironmentIntegrity', () => {
  it('passes a fully configured local development environment', () => {
    const report = checkEnvironmentIntegrity(localEnv(), MANIFEST);
    expect(report.appEnv).toBe('development');
    expect(report.expectedSupabaseRef).toBe('local');
    expect(report.problems).toEqual([]);
  });

  // The original defect, inverted into a test: one environment's process
  // pointed at another environment's database.
  it('rejects an environment pointed at another environment’s project', () => {
    const report = checkEnvironmentIntegrity(
      localEnv({
        NEXT_PUBLIC_SUPABASE_URL: `https://${OTHER_REF}.supabase.co`,
        SUPABASE_URL: `https://${OTHER_REF}.supabase.co`,
        DATABASE_URL: `postgresql://postgres.${OTHER_REF}:pw@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`,
      }),
      MANIFEST,
    );
    expect(new Set(report.problems.map((p) => p.code))).toEqual(
      new Set(['wrong-project']),
    );
    expect(report.problems.map((p) => p.variable).sort()).toEqual([
      'DATABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_URL',
    ]);
  });

  it('catches a single pointer left behind after a partial repoint', () => {
    expect(
      codes(
        localEnv({
          DATABASE_URL: `postgresql://postgres.${OTHER_REF}:pw@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`,
        }),
      ),
    ).toEqual(['wrong-project']);
  });

  it('reports an environment with no declared project as unprovisioned', () => {
    expect(codes(localEnv({ APP_ENV: 'production' }))).toContain('unprovisioned');
  });

  it('reports missing required variables', () => {
    const report = checkEnvironmentIntegrity(
      localEnv({ TOKEN_ENCRYPTION_KEY: undefined }),
      MANIFEST,
    );
    expect(report.problems).toEqual([
      expect.objectContaining({
        code: 'missing',
        variable: 'TOKEN_ENCRYPTION_KEY',
      }),
    ]);
  });

  it('treats a blank value as missing', () => {
    expect(codes(localEnv({ VAPID_PRIVATE_KEY: '   ' }))).toEqual(['missing']);
  });

  it('flags a URL it cannot classify rather than passing it through', () => {
    expect(
      codes(localEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.com' })),
    ).toEqual(['unrecognised-url']);
  });
});

describe('assertEnvironmentIntegrity', () => {
  it('does nothing when the environment is coherent', () => {
    expect(() => assertEnvironmentIntegrity(localEnv(), MANIFEST)).not.toThrow();
  });

  it('throws, naming the offending variable', () => {
    expect(() =>
      assertEnvironmentIntegrity(
        localEnv({ SUPABASE_URL: `https://${OTHER_REF}.supabase.co` }),
        MANIFEST,
      ),
    ).toThrow(/SUPABASE_URL points at Supabase project/);
  });

  it('honours the documented escape hatch in every environment', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const appEnv of ['development', 'preview', 'production'] as const) {
        expect(() =>
          assertEnvironmentIntegrity(
            localEnv({
              APP_ENV: appEnv,
              SUPABASE_URL: `https://unrelated.supabase.co`,
              ALLOW_ENV_MISMATCH: '1',
            }),
            MANIFEST,
          ),
        ).not.toThrow();
      }
      expect(stderr).toHaveBeenCalledTimes(3);
    } finally {
      stderr.mockRestore();
    }
  });
});
