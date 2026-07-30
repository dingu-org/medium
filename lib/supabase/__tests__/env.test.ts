import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabaseAnonKey, supabaseUrl } from '../env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('supabase env accessors', () => {
  it('returns the configured values', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    expect(supabaseUrl()).toBe('http://127.0.0.1:54321');
    expect(supabaseAnonKey()).toBe('anon-key');
  });

  it('throws a named error when a value is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    expect(() => supabaseUrl()).toThrow('NEXT_PUBLIC_SUPABASE_URL is required');
    expect(() => supabaseAnonKey()).toThrow(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY is required',
    );
  });
});
