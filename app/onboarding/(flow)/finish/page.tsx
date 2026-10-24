import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { enterScreen } from '@/lib/onboarding/guard';
import { FinishStep } from './finish-step';

export default async function FinishPage() {
  // Completion is written here, inside enterScreen, on a real visit only.
  const ctx = await enterScreen('finish');
  const connections = await db
    .select({ id: whatsappConnections.id })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.accountId, ctx.accountId),
        eq(whatsappConnections.status, 'active'),
      ),
    )
    .limit(1);
  return <FinishStep {...ctx} whatsappConnected={connections.length > 0} />;
}
