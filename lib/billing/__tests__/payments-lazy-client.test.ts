import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The POK client must be built on FIRST USE, not at module scope: payments.ts is
 * in the import graph of the Inngest function registry (/api/inngest), so a
 * module-top throw for a missing POK_* var would fail the load of the endpoint
 * that serves every background job — AI replies, reminders, outbox, push — over
 * a payments credential. Lazily, only checkout/settle fail.
 */
const POK_VARS = ['POK_MERCHANT_ID', 'POK_KEY_ID', 'POK_KEY_SECRET', 'VITEST'];

describe('POK client construction', () => {
  const saved = new Map(POK_VARS.map((k) => [k, process.env[k]]));

  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  });

  it('imports without POK env and fails only when a payment call is made', async () => {
    for (const key of POK_VARS) delete process.env[key];
    vi.resetModules();

    // Import must resolve — this is what /api/inngest depends on.
    const payments = await import('@/lib/billing/payments');
    expect(typeof payments.createCheckout).toBe('function');
    expect(typeof payments.applyOrderOutcome).toBe('function');

    await expect(
      payments.createCheckout(
        '00000000-0000-0000-0000-000000000000',
        'monthly',
        'https://medium.test/settings/billing',
      ),
    ).rejects.toThrow('POK_MERCHANT_ID is required');
  });
});
