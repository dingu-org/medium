/**
 * Backfill whatsapp_connections.display_phone_number for existing active
 * connections whose column is still NULL, fetching it from Graph with the stored
 * (encrypted) token. Dry-run by default; pass --yes to apply.
 *
 *   pnpm backfill:wa-display-number          # dry run — counts candidates, no writes
 *   pnpm backfill:wa-display-number --yes    # apply
 *
 * Per-row failures are logged and skipped (idempotent, re-runnable) — this is NOT
 * atomic like rotate-token-key; partial progress is intentional.
 */
import { fileURLToPath } from 'node:url';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { getDisplayNumber } from '@/lib/channels/whatsapp/client';
import { ConnectionRevokedError } from '@/lib/channels/whatsapp/errors';

export async function backfillDisplayNumbers(args: {
  apply: boolean;
  getDisplayNumberFn?: typeof getDisplayNumber;
}): Promise<{
  candidates: number;
  updated: number;
  failed: number;
  skipped: number;
}> {
  const fetchFn = args.getDisplayNumberFn ?? getDisplayNumber;

  const rows = await db
    .select({ id: whatsappConnections.id })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.status, 'active'),
        isNull(whatsappConnections.displayPhoneNumber),
        isNotNull(whatsappConnections.accessTokenEncrypted),
      ),
    );

  // Dry run must stay side-effect-free: getDisplayNumber can markRevoked (a write).
  if (!args.apply) {
    return { candidates: rows.length, updated: 0, failed: 0, skipped: 0 };
  }

  let updated = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const { displayPhoneNumber } = await fetchFn(row.id);
      if (!displayPhoneNumber) {
        skipped++;
        console.warn(
          `[backfill] ${row.id}: no display_phone_number returned, skipping`,
        );
        continue;
      }
      await db
        .update(whatsappConnections)
        .set({ displayPhoneNumber })
        .where(eq(whatsappConnections.id, row.id));
      updated++;
    } catch (err) {
      failed++;
      const reason =
        err instanceof ConnectionRevokedError
          ? 'revoked'
          : err instanceof Error
            ? err.name
            : 'unknown';
      console.warn(`[backfill] ${row.id}: failed (${reason}), continuing`);
    }
  }
  return { candidates: rows.length, updated, failed, skipped };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--yes');
  const result = await backfillDisplayNumbers({ apply });
  if (!apply) {
    console.log(
      `Dry run: ${result.candidates} connection(s) would be backfilled. Re-run with --yes to apply.`,
    );
  } else {
    console.log(
      `Backfilled ${result.updated}/${result.candidates} connection(s) ` +
        `(skipped ${result.skipped}, failed ${result.failed}).`,
    );
  }
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
