/**
 * Wipes the seed test PT and re-seeds it from scratch (Phase 12).
 *
 * Run: pnpm seed:reset   (local stack via .env)
 */
import { fileURLToPath } from 'node:url';
import { createServiceClient } from '@/lib/supabase/service';
import { assertSeedTarget } from './lib/seed-target';
import { deleteSeedAccount, seedCore, SEED_EMAIL, SEED_PASSWORD } from './seed';

assertSeedTarget();

async function main(): Promise<void> {
  const supabase = createServiceClient();
  await deleteSeedAccount(supabase);
  const result = await seedCore({ supabase });
  console.log(`Reset and reseeded test PT ${SEED_EMAIL} (${result.accountId})`);
  console.log(`Sign in with ${SEED_EMAIL} / ${SEED_PASSWORD}`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
