import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { whatsappStepLeft } from './whatsapp';

/** What the dashboard needs from onboarding state (MED-124). One query. */
export async function getDashboardOnboardingState(
  accountId: string,
): Promise<{ whatsappStepLeft: boolean }> {
  const [row] = await db
    .select({
      flow: accounts.onboardingFlow,
      completedAt: accounts.onboardingCompletedAt,
      whatsappConnected: sql<boolean>`exists (
        select 1 from whatsapp_connections
        where whatsapp_connections.account_id = ${accountId}
          and whatsapp_connections.status = 'active'
      )`,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  if (!row) return { whatsappStepLeft: false };
  return {
    whatsappStepLeft: whatsappStepLeft({
      flow: row.flow,
      completed: row.completedAt !== null,
      whatsappConnected: row.whatsappConnected,
    }),
  };
}
