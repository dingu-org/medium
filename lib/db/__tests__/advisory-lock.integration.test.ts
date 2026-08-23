import { describe, it, expect } from 'vitest';
import { withAdvisoryLock } from '../advisory-lock';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Unique per run so concurrent suites never share a lock key. */
const k = (name: string) => `test:${name}:${crypto.randomUUID()}`;

describe('withAdvisoryLock (integration)', () => {
  it('runs the callback and returns its value', async () => {
    const result = await withAdvisoryLock(k('plain'), async () => 'ok');
    expect(result).toBe('ok');
  });

  it('releases the lock when the callback throws', async () => {
    const key = k('throws');
    await expect(
      withAdvisoryLock(key, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // Would block forever if the transaction had not rolled back.
    await expect(withAdvisoryLock(key, async () => 'reacquired')).resolves.toBe(
      'reacquired',
    );
  });

  it('serialises concurrent holders of the same key', async () => {
    const key = k('mutex');
    const order: string[] = [];
    const hold = (name: string) =>
      withAdvisoryLock(key, async () => {
        order.push(`${name}:in`);
        await sleep(60);
        order.push(`${name}:out`);
      });

    await Promise.all([hold('a'), hold('b')]);

    // Whoever wins, neither holder overlaps the other.
    expect([
      ['a:in', 'a:out', 'b:in', 'b:out'],
      ['b:in', 'b:out', 'a:in', 'a:out'],
    ]).toContainEqual(order);
  });

  it('gives up on a contended key instead of blocking forever', async () => {
    // The reentrant hold pins a nested key to the OUTER transaction, so
    // `appointments:<accountId>` stays locked for a whole AI turn. Pre-fix a waiter had
    // no lock_timeout and parked on it indefinitely, holding a pooled connection
    // with no error to explain it.
    const key = k('timeout');
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signalAcquired = () => {};
    const acquired = new Promise<void>((resolve) => {
      signalAcquired = resolve;
    });
    const holder = withAdvisoryLock(key, async () => {
      signalAcquired();
      await held;
    });
    await acquired;

    await expect(
      withAdvisoryLock(key, async () => 'never', { timeoutMs: 250 }),
    ).rejects.toThrow(/lock timeout/i);

    release();
    await holder;
    // The holder's transaction committed, so the key is free again.
    await expect(withAdvisoryLock(key, async () => 'ok')).resolves.toBe('ok');
  });

  it('is reentrant: a nested lock reuses the enclosing transaction', async () => {
    const key = k('reentrant');
    // Re-taking the SAME key can only succeed on the same transaction; a nested
    // transaction would block on the lock its own parent holds.
    const result = await withAdvisoryLock(key, () =>
      withAdvisoryLock(key, async () => 'nested'),
    );
    expect(result).toBe('nested');
  });

  it('does not exhaust the pool when nested chains run concurrently', async () => {
    // More chains than the pool has connections: pre-fix each nested lock
    // reserved a second connection and every chain hung once the pool drained.
    const chains = Array.from({ length: 12 }, (_, i) =>
      withAdvisoryLock(k(`outer-${i}`), () =>
        withAdvisoryLock(k(`inner-${i}`), async () => {
          await sleep(50);
          return i;
        }),
      ),
    );

    await expect(Promise.all(chains)).resolves.toEqual(
      Array.from({ length: 12 }, (_, i) => i),
    );
  }, 20_000);
});
