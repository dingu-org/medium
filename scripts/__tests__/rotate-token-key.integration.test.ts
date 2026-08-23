import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { rotateTokenKey } from '../rotate-token-key';

const OLD_KEY = process.env.TOKEN_ENCRYPTION_KEY!;
const NEW_KEY = 'rotation-test-new-key-9f3a';
const TOKEN = 'PT_TOKEN_rotate_me';

let accountId = '';
let seq = 0;
const nextPni = () => `PNI_ROTATE_${Date.now()}_${++seq}`;

async function decryptWith(id: string, key: string): Promise<string> {
  const rows = await db.execute<{ plain: string }>(sql`
    SELECT pgp_sym_decrypt(access_token_encrypted, ${key}) AS plain
    FROM whatsapp_connections WHERE id = ${id}
  `);
  return rows[0].plain;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `rotate-${Date.now()}@example.com`,
    password: 'rotate-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  // rotateTokenKey operates on the whole table; isolate to only seeded rows.
  await db.delete(whatsappConnections);
});

describe('rotateTokenKey', () => {
  it('re-encrypts every token under the new key and invalidates the old key', async () => {
    const [row] = await db
      .insert(whatsappConnections)
      .values({
        accountId,
        phoneNumberId: nextPni(),
        wabaId: 'WABA_ROT',
        accessTokenEncrypted: await encryptToken(TOKEN),
        status: 'active',
      })
      .returning({ id: whatsappConnections.id });

    const result = await rotateTokenKey({ oldKey: OLD_KEY, newKey: NEW_KEY });
    expect(result.rotated).toBe(1);

    expect(await decryptWith(row.id, NEW_KEY)).toBe(TOKEN);
    await expect(decryptWith(row.id, OLD_KEY)).rejects.toThrow();
  });

  it('rolls back the whole batch when a row cannot decrypt with the old key', async () => {
    const [good] = await db
      .insert(whatsappConnections)
      .values({
        accountId,
        phoneNumberId: nextPni(),
        wabaId: 'WABA_GOOD',
        accessTokenEncrypted: await encryptToken(TOKEN),
        status: 'active',
      })
      .returning({ id: whatsappConnections.id });

    const [bad] = await db
      .insert(whatsappConnections)
      .values({
        accountId,
        phoneNumberId: nextPni(),
        wabaId: 'WABA_BAD',
        accessTokenEncrypted: await encryptToken(TOKEN),
        status: 'active',
      })
      .returning({ id: whatsappConnections.id });
    // Re-encrypt the bad row under a key that is NOT oldKey.
    await db.execute(sql`
      UPDATE whatsapp_connections
      SET access_token_encrypted = pgp_sym_encrypt(${TOKEN}, ${'unrelated-key-xyz'})
      WHERE id = ${bad.id}
    `);

    const [beforeGood] = await db
      .select({ ct: whatsappConnections.accessTokenEncrypted })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, good.id));

    await expect(
      rotateTokenKey({ oldKey: OLD_KEY, newKey: NEW_KEY }),
    ).rejects.toThrow();

    // The good row was not rotated: still decrypts under the old key, ciphertext unchanged.
    expect(await decryptWith(good.id, OLD_KEY)).toBe(TOKEN);
    const [afterGood] = await db
      .select({ ct: whatsappConnections.accessTokenEncrypted })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, good.id));
    expect(Buffer.from(afterGood.ct!).equals(Buffer.from(beforeGood.ct!))).toBe(
      true,
    );
  });
});
