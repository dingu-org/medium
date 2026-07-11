/**
 * Wipes the seed test PT and re-seeds it from scratch (Phase 12).
 *
 * Run: pnpm seed:reset   (tsx --env-file=.env.test — LOCAL Supabase only)
 */
import { fileURLToPath } from 'node:url';
import { createServiceClient } from '@/lib/supabase/service';
import { deleteSeedPt, seedCore, SEED_EMAIL, SEED_PASSWORD } from './seed';

const dbUrl = process.env.DATABASE_URL ?? '';
if (!dbUrl.includes('127.0.0.1') && !dbUrl.includes('localhost')) {
  throw new Error(`Refusing to seed non-local DATABASE_URL: ${dbUrl}`);
}

async function main(): Promise<void> {
  const supabase = createServiceClient();
  await deleteSeedPt(supabase);
  const result = await seedCore({ supabase });
  console.log(`Reset and reseeded test PT ${SEED_EMAIL} (${result.ptId})`);
  console.log(`Sign in with ${SEED_EMAIL} / ${SEED_PASSWORD}`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
