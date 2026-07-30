import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManualPatient } from '@/lib/clients/mutations';
import { db } from '@/lib/db';
import { appointments, patients, pts } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getClientDetail, getClientDirectory } from '../queries';

let ptIdA = '';
let ptIdB = '';
let ptIdC = '';
let ptIdD = '';

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
  [ptIdA, ptIdB, ptIdC, ptIdD] = await Promise.all([
    user('a'),
    user('b'),
    user('c'),
    user('d'),
  ]);
  await db
    .update(pts)
    .set({ timezone: 'Europe/Tirane' })
    .where(eq(pts.id, ptIdA));
});

afterAll(async () => {
  for (const ptId of [ptIdA, ptIdB, ptIdC, ptIdD]) {
    if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
  }
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

  it('treats a locally-written number as the same client as its E.164 form', async () => {
    await expect(
      createManualPatient({
        ptId: ptIdA,
        name: 'Ana Local',
        phone: '069 234 5678',
      }),
    ).resolves.toMatchObject({ id: expect.any(String) });
    await expect(
      createManualPatient({
        ptId: ptIdA,
        name: 'Ana Again',
        phone: '+355 69 234 5678',
      }),
    ).resolves.toEqual({ failure: 'DUPLICATE_PHONE' });

    const directory = await getClientDirectory(ptIdA, 'ana local');
    expect(directory.rows[0]).toMatchObject({ phone: '+355692345678' });
  });

  it('finds diacritic names typed without accents and phones typed with separators', async () => {
    await db.insert(patients).values([
      { ptId: ptIdC, name: 'Ërmira Çela', phone: '+355691234567' },
      { ptId: ptIdC, name: 'Blerta Hoxha', phone: '+355681111222' },
    ]);

    for (const query of ['ermira', 'cela', 'ËRM', '69 123 4567', '069 123']) {
      const directory = await getClientDirectory(ptIdC, query);
      expect(
        directory.rows.map((row) => row.name),
        `query ${query}`,
      ).toEqual(['Ërmira Çela']);
    }

    // '%' is a literal in the search box, not a wildcard that lists everyone.
    const wildcard = await getClientDirectory(ptIdC, '%');
    expect(wildcard.rows).toHaveLength(0);
    expect(wildcard.total).toBe(0);
  });

  it('reports the true total when capped and bounds the appointment history', async () => {
    await db.insert(patients).values(
      Array.from({ length: 250 }, (_, index) => ({
        ptId: ptIdD,
        name: `Klient ${String(index).padStart(3, '0')}`,
        phone: `+3556900${String(index).padStart(4, '0')}`,
      })),
    );
    const [last] = await db
      .insert(patients)
      .values({ ptId: ptIdD, name: 'Zana Vata', phone: '+355699999999' })
      .returning({ id: patients.id });

    const stale = new Date();
    stale.setMonth(stale.getMonth() - 18);
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(appointments).values([
      {
        ptId: ptIdD,
        patientId: last.id,
        startsAt: stale,
        endsAt: new Date(stale.getTime() + 60 * 60 * 1000),
        status: 'completed',
      },
      {
        ptId: ptIdD,
        patientId: last.id,
        startsAt: soon,
        endsAt: new Date(soon.getTime() + 60 * 60 * 1000),
        status: 'confirmed',
      },
    ]);

    const directory = await getClientDirectory(ptIdD);
    expect(directory.rows).toHaveLength(250);
    expect(directory.total).toBe(251);
    expect(directory.truncated).toBe(true);
    expect(directory.rows.map((row) => row.id)).not.toContain(last.id);

    // Past the cap but still reachable by search — with only recent history.
    const found = await getClientDirectory(ptIdD, 'zana');
    expect(found.truncated).toBe(false);
    expect(found.total).toBe(1);
    expect(found.rows[0]).toMatchObject({
      name: 'Zana Vata',
      nextAppointment: { startsAt: soon.toISOString() },
      lastAppointment: null,
    });
  });
});
