import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('lib/inngest/client', () => {
  const original = process.env.INNGEST_EVENT_KEY;

  beforeEach(() => {
    vi.resetModules();
    process.env.INNGEST_EVENT_KEY = original;
  });

  it('throws when INNGEST_EVENT_KEY is unset', async () => {
    delete process.env.INNGEST_EVENT_KEY;
    await expect(import('../client')).rejects.toThrow(/INNGEST_EVENT_KEY is required/);
  });

  it('constructs the client when INNGEST_EVENT_KEY is set', async () => {
    process.env.INNGEST_EVENT_KEY = 'dev';
    const mod = await import('../client');
    expect(mod.inngest).toBeDefined();
  });
});
