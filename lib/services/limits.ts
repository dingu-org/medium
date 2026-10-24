import { and, eq, ne, sql } from 'drizzle-orm';
import { getPlan } from '@/lib/billing/plans';
import { loadEffectivePlan } from '@/lib/billing/read-model';
import { db } from '@/lib/db';
import { services } from '@/lib/db/schema';

// Plan-limit helpers shared by the settings services actions and the onboarding
// services step. Take the lock below around any check-then-write.

/** Advisory-lock key serialising service writes for one account. */
export const serviceLockKey = (accountId: string): string =>
  `usage:services:${accountId}`;

/** Active services for an account, optionally excluding one (the one being toggled). */
export async function activeServiceCount(
  accountId: string,
  excludeId?: string,
): Promise<number> {
  const conditions = [eq(services.accountId, accountId), eq(services.active, true)];
  if (excludeId) conditions.push(ne(services.id, excludeId));
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(services)
    .where(and(...conditions));
  return row?.count ?? 0;
}

/** All services for an account, active or hidden. */
export async function serviceCount(accountId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(services)
    .where(eq(services.accountId, accountId));
  return row?.count ?? 0;
}

/** The plan's cap on active services; null = unlimited. */
export async function maxActiveServicesFor(
  accountId: string,
): Promise<number | null> {
  return getPlan(await loadEffectivePlan(accountId)).maxActiveServices;
}
