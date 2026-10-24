import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { enterScreen } from '@/lib/onboarding/guard';
import { whereNeeds } from '@/lib/onboarding/where';
import { WhereStep } from './where-step';

export default async function WherePage() {
  const ctx = await enterScreen('where');
  const [row] = await db
    .select({
      city: accounts.city,
      address: accounts.address,
      directions: accounts.directions,
      parking: accounts.parking,
      entrance: accounts.entrance,
      floor: accounts.floor,
      serviceArea: accounts.serviceArea,
    })
    .from(accounts)
    .where(eq(accounts.id, ctx.accountId));
  return (
    <WhereStep
      {...ctx}
      needs={whereNeeds(ctx.facts.serviceModes)}
      initial={{
        city: row?.city ?? '',
        address: row?.address ?? '',
        directions: row?.directions ?? '',
        parking: row?.parking ?? '',
        entrance: row?.entrance ?? '',
        floor: row?.floor ?? '',
        serviceArea: row?.serviceArea ?? '',
      }}
    />
  );
}
