import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { ConnectionRevokedError } from '@/lib/channels/whatsapp/errors';
import { createServiceClient } from '@/lib/supabase/service';
import { backfillDisplayNumbers } from '../backfill-display-number';

const TOKEN = 'PT_TOKEN_backfill_me';

let accountId = '';
let seq = 0;
const nextPni = () => `PNI_BACKFILL_${Date.now()}_${++seq}`;

async function seedConnection(
  overrides: Partial<typeof whatsappConnections.$inferInsert> = {},
): Promise<string> {
  const [row] = await db
    .insert(whatsappConnections)
    .values({
      accountId,
      phoneNumberId: nextPni(),
      wabaId: 'WABA_BACKFILL',
      accessTokenEncrypted: await encryptToken(TOKEN),
      status: 'active',
      ...overrides,
    })
    .returning({ id: whatsappConnections.id });
  return row.id;
}

async function displayNumberOf(id: string): Promise<string | null> {
  const [row] = await db
    .select({ displayPhoneNumber: whatsappConnections.displayPhoneNumber })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.id, id));
  return row.displayPhoneNumber;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `backfill-${Date.now()}@example.com`,
    password: 'backfill-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  // backfillDisplayNumbers scans the whole table; isolate to only seeded rows.
  await db.delete(whatsappConnections);
});

describe('backfillDisplayNumbers', () => {
  it('updates an active row with a null display number', async () => {
    const id = await seedConnection();

    const result = await backfillDisplayNumbers({
      apply: true,
      getDisplayNumberFn: async () => ({
        displayPhoneNumber: '+355691112233',
        verifiedName: 'V',
      }),
    });

    expect(result).toEqual({
      candidates: 1,
      updated: 1,
      failed: 0,
      skipped: 0,
    });
    expect(await displayNumberOf(id)).toBe('+355691112233');
  });

  it('dry run counts candidates without any Graph call or write', async () => {
    const id = await seedConnection();
    const spy = vi.fn(async () => ({
      displayPhoneNumber: '+355691112233',
      verifiedName: null,
    }));

    const result = await backfillDisplayNumbers({
      apply: false,
      getDisplayNumberFn: spy,
    });

    expect(result).toEqual({
      candidates: 1,
      updated: 0,
      failed: 0,
      skipped: 0,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(await displayNumberOf(id)).toBeNull();
  });

  it('excludes rows that already have a display number', async () => {
    const id = await seedConnection({ displayPhoneNumber: '+355690000000' });
    const spy = vi.fn(async () => ({
      displayPhoneNumber: '+355699999999',
      verifiedName: null,
    }));

    const result = await backfillDisplayNumbers({
      apply: true,
      getDisplayNumberFn: spy,
    });

    expect(result).toEqual({
      candidates: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(await displayNumberOf(id)).toBe('+355690000000');
  });

  it('excludes revoked connections', async () => {
    const id = await seedConnection({ status: 'revoked' });
    const spy = vi.fn(async () => ({
      displayPhoneNumber: '+355699999999',
      verifiedName: null,
    }));

    const result = await backfillDisplayNumbers({
      apply: true,
      getDisplayNumberFn: spy,
    });

    expect(result).toEqual({
      candidates: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(await displayNumberOf(id)).toBeNull();
  });

  it('continues past a failing row and updates the rest', async () => {
    const failId = await seedConnection();
    const okId = await seedConnection();
    const fn = vi.fn(async (connectionId: string) => {
      if (connectionId === failId) throw new ConnectionRevokedError();
      return { displayPhoneNumber: '+355694445566', verifiedName: null };
    });

    const result = await backfillDisplayNumbers({
      apply: true,
      getDisplayNumberFn: fn,
    });

    expect(result).toEqual({
      candidates: 2,
      updated: 1,
      failed: 1,
      skipped: 0,
    });
    expect(await displayNumberOf(failId)).toBeNull();
    expect(await displayNumberOf(okId)).toBe('+355694445566');
  });

  it('counts a null display number from Graph as skipped, writes nothing', async () => {
    const id = await seedConnection();

    const result = await backfillDisplayNumbers({
      apply: true,
      getDisplayNumberFn: async () => ({
        displayPhoneNumber: null,
        verifiedName: null,
      }),
    });

    expect(result).toEqual({
      candidates: 1,
      updated: 0,
      failed: 0,
      skipped: 1,
    });
    expect(await displayNumberOf(id)).toBeNull();
  });
});
