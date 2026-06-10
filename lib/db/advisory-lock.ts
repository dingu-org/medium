import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required');
}

const lockClient = postgres(url, {
  prepare: false,
  max: 4,
  idle_timeout: 20,
});

export async function withAdvisoryLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  return (await lockClient.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    return fn();
  })) as T;
}
