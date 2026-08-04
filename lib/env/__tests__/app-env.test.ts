import { describe, expect, it } from 'vitest';
import { isAppEnv, resolveAppEnv } from '../app-env';

describe('resolveAppEnv', () => {
  it('defaults to development when nothing is set', () => {
    expect(resolveAppEnv({})).toBe('development');
  });

  it('maps the three VERCEL_ENV values onto the three app environments', () => {
    expect(resolveAppEnv({ VERCEL_ENV: 'production' })).toBe('production');
    expect(resolveAppEnv({ VERCEL_ENV: 'preview' })).toBe('preview');
    expect(resolveAppEnv({ VERCEL_ENV: 'development' })).toBe('development');
  });

  it('lets APP_ENV override the platform signal', () => {
    expect(resolveAppEnv({ APP_ENV: 'preview', VERCEL_ENV: 'production' })).toBe(
      'preview',
    );
  });

  it('prefers APP_ENV over its NEXT_PUBLIC_ mirror', () => {
    expect(
      resolveAppEnv({ APP_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'preview' }),
    ).toBe('production');
  });

  it('falls through unrecognised values instead of trusting them', () => {
    expect(resolveAppEnv({ APP_ENV: 'staging', VERCEL_ENV: 'preview' })).toBe(
      'preview',
    );
    expect(resolveAppEnv({ APP_ENV: 'staging' })).toBe('development');
  });

  // NODE_ENV is production on Vercel Preview builds; it must not leak in.
  it('ignores NODE_ENV entirely', () => {
    expect(resolveAppEnv({ NODE_ENV: 'production' })).toBe('development');
  });

  it('narrows only the three known names', () => {
    expect(isAppEnv('preview')).toBe(true);
    expect(isAppEnv('staging')).toBe(false);
    expect(isAppEnv(undefined)).toBe(false);
  });
});
