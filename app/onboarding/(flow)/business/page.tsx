import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { enterScreen } from '@/lib/onboarding/guard';
import { BusinessStep } from './business-step';

export default async function BusinessPage() {
  const ctx = await enterScreen('business');
  const [row] = await db
    .select({
      name: accounts.name,
      businessType: accounts.businessType,
      fullName: accounts.fullName,
      title: accounts.title,
      tagline: accounts.tagline,
    })
    .from(accounts)
    .where(eq(accounts.id, ctx.accountId));
  return (
    <BusinessStep
      {...ctx}
      initial={{
        name: row?.name ?? '',
        businessType: row?.businessType ?? null,
        fullName: row?.fullName ?? '',
        title: row?.title ?? '',
        tagline: row?.tagline ?? '',
      }}
    />
  );
}
