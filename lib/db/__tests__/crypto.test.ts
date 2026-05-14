import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('lib/db/crypto', () => {
  const original = process.env.TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    vi.resetModules();
    process.env.TOKEN_ENCRYPTION_KEY = original;
  });

  it('throws when TOKEN_ENCRYPTION_KEY is unset', async () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    await expect(import('../crypto')).rejects.toThrow(/TOKEN_ENCRYPTION_KEY is required/);
  });

  it('loads when TOKEN_ENCRYPTION_KEY is set', async () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'dev';
    const mod = await import('../crypto');
    expect(mod.encryptToken).toBeInstanceOf(Function);
    expect(mod.decryptToken).toBeInstanceOf(Function);
  });
});
