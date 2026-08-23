import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { services } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getActiveServiceByName, getServices } from '../queries';

let accountId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `services-${Date.now()}@example.com`,
    password: 'services-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('services schema and defaults', () => {
  it('seeds the three design presets with the first two active', async () => {
    const rows = await getServices(accountId);
    expect(
      rows.map(({ name, durationMinutes, active }) => ({
        name,
        durationMinutes,
        active,
      })),
    ).toEqual(
      expect.arrayContaining([
        { name: 'Vlerësim i parë', durationMinutes: 45, active: true },
        { name: 'Seancë vijuese', durationMinutes: 30, active: true },
        { name: 'Terapi manuale', durationMinutes: 60, active: false },
      ]),
    );
  });

  it('resolves only active names and enforces case-insensitive uniqueness', async () => {
    await expect(
      getActiveServiceByName(accountId, 'vlerësim I PARË'),
    ).resolves.toMatchObject({ durationMinutes: 45 });
    await expect(
      db.insert(services).values({
        accountId,
        name: '  VLERËSIM I PARË ',
        durationMin: 30,
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    await expect(
      getActiveServiceByName(accountId, 'Terapi manuale'),
    ).resolves.toBeNull();
  });

  it('enforces duration bounds and realtime publication membership', async () => {
    await expect(
      db.insert(services).values({ accountId, name: 'Invalid', durationMin: 4 }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });

    const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    const rows = await sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND tablename IN ('customers', 'reminder_jobs', 'services')
      ORDER BY tablename
    `;
    await sql.end({ timeout: 1 });
    expect(rows.map((row) => row.tablename)).toEqual([
      'customers',
      'reminder_jobs',
      'services',
    ]);
  });
});
