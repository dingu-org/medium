import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManualPatient } from '@/lib/clients/mutations';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getClientDetail, getClientDirectory } from '../queries';

let ptIdA = '';
let ptIdB = '';

async function user(label: string) {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `clients-${label}-${Date.now()}@example.com`,
    password: 'clients-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  return data.user.id;
}

beforeAll(async () => {
  [ptIdA, ptIdB] = await Promise.all([user('a'), user('b')]);
  await db
    .update(pts)
    .set({ timezone: 'Europe/Tirane' })
    .where(eq(pts.id, ptIdA));
});

afterAll(async () => {
  if (ptIdA) await createServiceClient().auth.admin.deleteUser(ptIdA);
  if (ptIdB) await createServiceClient().auth.admin.deleteUser(ptIdB);
});

describe('client directory', () => {
  it('normalizes phones, blocks practice-local duplicates, and isolates tenants', async () => {
    const first = await createManualPatient({
      ptId: ptIdA,
      name: 'Arta Kola',
      phone: '+355 69 123 4567',
    });
    expect(first).toMatchObject({ id: expect.any(String) });
    await expect(
      createManualPatient({
        ptId: ptIdA,
        name: 'Duplicate',
        phone: '355691234567',
      }),
    ).resolves.toEqual({ failure: 'DUPLICATE_PHONE' });
    await expect(
      createManualPatient({
        ptId: ptIdB,
        name: 'Other tenant',
        phone: '355691234567',
      }),
    ).resolves.toMatchObject({ id: expect.any(String) });

    const directory = await getClientDirectory(ptIdA, 'arta');
    expect(directory.rows).toHaveLength(1);
    expect(directory.rows[0]).toMatchObject({
      name: 'Arta Kola',
      phone: '+355691234567',
      manual: true,
    });
    const id = 'id' in first ? first.id : '';
    await expect(getClientDetail(ptIdB, id)).resolves.toBeNull();
  });
});
