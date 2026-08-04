import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS } from '@/lib/env/environments';
import { assertSeedTarget } from '../seed-target';

const PROD_REF = ENVIRONMENTS.production.supabaseProjectRef;

const LOCAL = {
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  SUPABASE_URL: 'http://127.0.0.1:54321',
};

describe('assertSeedTarget', () => {
  it('admits the local stack in development', () => {
    expect(() => assertSeedTarget({ ...LOCAL })).not.toThrow();
  });

  it('refuses production regardless of configuration', () => {
    expect(() =>
      assertSeedTarget({ ...LOCAL, APP_ENV: 'production' }),
    ).toThrow(/not a thing/);
  });

  // The escape hatch is for migrations and backfills — seeding ignores it.
  it('refuses production even with ALLOW_ENV_MISMATCH=1', () => {
    expect(() =>
      assertSeedTarget({
        ...LOCAL,
        APP_ENV: 'production',
        ALLOW_ENV_MISMATCH: '1',
      }),
    ).toThrow(/not a thing/);
  });

  it('refuses any endpoint that resolves to the production project', () => {
    expect(PROD_REF).not.toBeNull();
    expect(() =>
      assertSeedTarget({
        ...LOCAL,
        SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
      }),
    ).toThrow(/points at production/);
  });

  it('refuses a mixed configuration where only one endpoint is wrong', () => {
    expect(() =>
      assertSeedTarget({
        ...LOCAL,
        DATABASE_URL:
          'postgresql://postgres.someotherref:pw@aws-1-eu-central-1.pooler.supabase.com:6543/postgres',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('refuses an unprovisioned environment', () => {
    // Preview is unprovisioned until its ref lands in the manifest; once it
    // is, this test still holds for any env whose ref is null — skip if all
    // provisioned.
    if (ENVIRONMENTS.preview.supabaseProjectRef !== null) return;
    expect(() => assertSeedTarget({ ...LOCAL, APP_ENV: 'preview' })).toThrow(
      /no Supabase project declared/,
    );
  });

  it('admits preview only when both endpoints belong to the preview project', () => {
    const previewRef = ENVIRONMENTS.preview.supabaseProjectRef;
    if (previewRef === null) return; // becomes live once provisioned
    expect(() =>
      assertSeedTarget({
        APP_ENV: 'preview',
        DATABASE_URL: `postgresql://postgres.${previewRef}:pw@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`,
        SUPABASE_URL: `https://${previewRef}.supabase.co`,
      }),
    ).not.toThrow();
  });
});
