import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

const key = process.env.TOKEN_ENCRYPTION_KEY;
if (!key) {
  throw new Error('TOKEN_ENCRYPTION_KEY is required');
}

export async function encryptToken(plaintext: string): Promise<Buffer> {
  const rows = await db.execute<{ encrypted: Buffer }>(
    sql`SELECT pgp_sym_encrypt(${plaintext}, ${key}) AS encrypted`,
  );
  return rows[0].encrypted;
}

export async function decryptToken(ciphertext: Buffer): Promise<string> {
  const rows = await db.execute<{ decrypted: string }>(
    sql`SELECT pgp_sym_decrypt(${ciphertext}, ${key}) AS decrypted`,
  );
  return rows[0].decrypted;
}
