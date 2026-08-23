import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required');
}

type Sql = ReturnType<typeof postgres>;

// Same HMR guard as lib/db/index.ts: without it every dev recompile opens a
// fresh pool and the old ones linger until Postgres runs out of slots.
const globalForLock = globalThis as unknown as { __mediumPgLockClient?: Sql };

// Every lock reserves a whole pooled connection for the lifetime of its
// transaction, and locks nest (an AI turn holds `ai-turn:<id>` while its tool
// calls take `appointments:<accountId>`), so the pool must be comfortably wider than
// the number of concurrent turns. connect_timeout/max_lifetime mirror
// lib/db/index.ts — postgres-js queues forever on a dead socket otherwise.
const lockClient =
  globalForLock.__mediumPgLockClient ??
  postgres(url, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });
if (process.env.NODE_ENV !== 'production') {
  globalForLock.__mediumPgLockClient = lockClient;
}

/** Takes an advisory lock on the transaction already open in this async chain. */
type LockAcquirer = (key: string) => Promise<void>;

const activeLock = new AsyncLocalStorage<LockAcquirer>();

/**
 * Upper bound on how long a waiter blocks for a contended key. Postgres waits on
 * an advisory lock FOREVER by default, and a reentrant hold outlives its own
 * critical section: engine.ts keeps `ai-turn:<id>` open across the turn's LLM
 * round-trips, so the nested `appointments:<accountId>` stays held for the whole turn.
 * Without a bound, a same-PT booking from another conversation (or the PT's own
 * calendar action) parks on the lock indefinitely while occupying one of the 10
 * pooled connections, and the caller just hangs. Generous enough to sit out a
 * normal turn, short enough that a stuck holder surfaces as a real error.
 * Overridable per call via `options.timeoutMs` for a caller that must fail faster;
 * a reentrant call inherits the enclosing transaction's bound instead.
 */
const LOCK_TIMEOUT_MS = 30_000;

export async function withAdvisoryLock<T>(
  key: string,
  fn: () => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T> {
  const outer = activeLock.getStore();
  if (outer) {
    // Reentrant call: piggyback on the enclosing transaction instead of
    // reserving a second connection. Nesting is unavoidable (engine.ts holds
    // `ai-turn:<id>` around tool calls that take `appointments:<accountId>`), and a
    // nested `begin` waits on a pool whose connections are all held by outer
    // locks — a deadlock postgres-js never times out of. Advisory locks are
    // reentrant per transaction, so re-taking the same key is a no-op.
    await outer(key);
    return fn();
  }

  return (await lockClient.begin(async (transaction) => {
    // set_config(..., is_local => true) is SET LOCAL: scoped to this transaction,
    // so it bounds only the advisory-lock waits taken on this connection. `fn`
    // runs on the main pool (lib/db/index.ts) and is unaffected.
    const timeoutMs = options?.timeoutMs ?? LOCK_TIMEOUT_MS;
    await transaction`select set_config('lock_timeout', ${String(timeoutMs)}, true)`;
    const acquire: LockAcquirer = async (lockKey) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    };
    await acquire(key);
    return activeLock.run(acquire, fn);
  })) as T;
}
