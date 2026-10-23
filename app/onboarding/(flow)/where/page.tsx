import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { enterScreen } from '@/lib/onboarding/guard';
import { WhereStep } from './where-step';

export default async function WherePage() {
  const ctx = await enterScreen('where');
  const [row] = await db
    .select({ address: accounts.address })
    .from(accounts)
    .where(eq(accounts.id, ctx.accountId));
  return <WhereStep {...ctx} initialAddress={row?.address ?? ''} />;
}
