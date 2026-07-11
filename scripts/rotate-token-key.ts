/**
 * Re-encrypt every whatsapp_connections token from TOKEN_ENCRYPTION_KEY to
 * TOKEN_ENCRYPTION_KEY_NEXT in a single transaction, verifying each row round
 * trips under the new key before committing. Run in a maintenance window:
 *
 *   pnpm rotate:token-key --yes
 *
 * Issues raw pgcrypto SQL with both keys directly — it must NOT import
 * lib/db/crypto, which binds a single key at module load.
 */
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export async function rotateTokenKey(args: {
  oldKey: string;
  newKey: string;
}): Promise<{ rotated: number }> {
  const { oldKey, newKey } = args;
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string; plain: string }>(sql`
      SELECT id, pgp_sym_decrypt(access_token_encrypted, ${oldKey}) AS plain
      FROM whatsapp_connections
      WHERE access_token_encrypted IS NOT NULL
      FOR UPDATE
    `);

    for (const row of rows) {
      await tx.execute(sql`
        UPDATE whatsapp_connections
        SET access_token_encrypted = pgp_sym_encrypt(${row.plain}, ${newKey})
        WHERE id = ${row.id}
      `);
      const verified = await tx.execute<{ plain: string }>(sql`
        SELECT pgp_sym_decrypt(access_token_encrypted, ${newKey}) AS plain
        FROM whatsapp_connections
        WHERE id = ${row.id}
      `);
      if (verified[0]?.plain !== row.plain) {
        throw new Error(
          `Round-trip verification failed for connection ${row.id}; rolling back.`,
        );
      }
    }

    return { rotated: rows.length };
  });
}

async function main(): Promise<void> {
  const oldKey = process.env.TOKEN_ENCRYPTION_KEY;
  const newKey = process.env.TOKEN_ENCRYPTION_KEY_NEXT;
  if (!oldKey) {
    console.error('TOKEN_ENCRYPTION_KEY (current key) is required.');
    process.exit(1);
  }
  if (!newKey) {
    console.error('TOKEN_ENCRYPTION_KEY_NEXT (new key) is required.');
    process.exit(1);
  }
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to run without --yes (production maintenance op).');
    process.exit(1);
  }

  const { rotated } = await rotateTokenKey({ oldKey, newKey });
  console.log(`Re-encrypted ${rotated} whatsapp_connections row(s).`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
