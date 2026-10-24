import { db } from '@/lib/db';
import { services } from '@/lib/db/schema';

/**
 * The three services the signup trigger created before migration 0036. New
 * accounts have none now; tests that were written against those rows seed them
 * explicitly with `seedLegacyDefaultServices`.
 */
export const LEGACY_DEFAULT_SERVICES = [
  { name: 'Vlerësim i parë', durationMin: 45, active: true },
  { name: 'Seancë vijuese', durationMin: 30, active: true },
  { name: 'Terapi manuale', durationMin: 60, active: false },
] as const;

export async function seedLegacyDefaultServices(
  accountId: string,
): Promise<void> {
  await db
    .insert(services)
    .values(LEGACY_DEFAULT_SERVICES.map((s) => ({ accountId, ...s })));
}
