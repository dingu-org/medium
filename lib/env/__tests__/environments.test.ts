import { describe, expect, it } from 'vitest';
import { APP_ENVS } from '../app-env';
import {
  ENVIRONMENTS,
  supabaseProjectRefFromDatabaseUrl,
  supabaseProjectRefFromUrl,
} from '../environments';

describe('ENVIRONMENTS', () => {
  it('declares an entry for every app environment', () => {
    for (const env of APP_ENVS) {
      expect(ENVIRONMENTS[env]).toBeDefined();
    }
  });

  // The whole point of the manifest. Two environments sharing a project ref is
  // the defect this file exists to prevent, so it fails here rather than in
  // production. Unprovisioned (`null`) entries are excluded — the guard rejects
  // those on its own; this asserts the refs that *have* been filled in are
  // distinct, which is what stops a copy-paste during provisioning.
  it('never points two environments at the same Supabase project', () => {
    const refs = Object.values(ENVIRONMENTS)
      .map((identity) => identity.supabaseProjectRef)
      .filter((ref): ref is string => ref !== null);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('never points two environments at the same origin', () => {
    const urls = Object.values(ENVIRONMENTS).map((identity) => identity.appUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('supabaseProjectRefFromUrl', () => {
  it('reads the ref out of a hosted project URL', () => {
    expect(supabaseProjectRefFromUrl('https://abcdefgh.supabase.co')).toBe(
      'abcdefgh',
    );
  });

  it('maps the local Docker stack onto the local sentinel', () => {
    expect(supabaseProjectRefFromUrl('http://127.0.0.1:54321')).toBe('local');
    expect(supabaseProjectRefFromUrl('http://localhost:54321')).toBe('local');
  });

  it('returns null for values it cannot classify', () => {
    expect(supabaseProjectRefFromUrl(undefined)).toBeNull();
    expect(supabaseProjectRefFromUrl('not a url')).toBeNull();
    expect(supabaseProjectRefFromUrl('https://example.com')).toBeNull();
  });
});

describe('supabaseProjectRefFromDatabaseUrl', () => {
  // The pooler host carries the region, not the project — the ref is smuggled
  // into the username as `postgres.<ref>`.
  it('reads the ref out of a pooled connection string', () => {
    expect(
      supabaseProjectRefFromDatabaseUrl(
        'postgresql://postgres.abcdefgh:pw@aws-1-eu-central-1.pooler.supabase.com:6543/postgres',
      ),
    ).toBe('abcdefgh');
  });

  it('reads the ref out of a direct connection string', () => {
    expect(
      supabaseProjectRefFromDatabaseUrl(
        'postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres',
      ),
    ).toBe('abcdefgh');
  });

  it('maps the local stack onto the local sentinel', () => {
    expect(
      supabaseProjectRefFromDatabaseUrl(
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      ),
    ).toBe('local');
  });

  it('returns null for values it cannot classify', () => {
    expect(supabaseProjectRefFromDatabaseUrl(undefined)).toBeNull();
    expect(supabaseProjectRefFromDatabaseUrl('postgres://nope')).toBeNull();
  });
});
