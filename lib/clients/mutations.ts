import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import { customers } from '@/lib/db/schema';
import { normalizeManualPhone } from './phone';

export type ManualCustomerFailure = 'INVALID_PHONE' | 'DUPLICATE_PHONE';

export async function createManualCustomer(input: {
  accountId: string;
  name: string;
  phone: string;
  notes?: string;
}): Promise<{ id: string } | { failure: ManualCustomerFailure }> {
  const phone = normalizeManualPhone(input.phone);
  if (!phone) return { failure: 'INVALID_PHONE' };
  const digits = phone.slice(1);
  // There is no (accountId, phone) unique constraint on `customers` (the WhatsApp
  // path keys on wa_id), so a plain check-then-insert races: two concurrent
  // submits of the same number both pass the SELECT and insert duplicates.
  // Serialize per (accountId, phone) so the second caller sees the first's row.
  return withAdvisoryLock(`manual-customer:${input.accountId}:${digits}`, async () => {
    const [duplicate] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.accountId, input.accountId),
          sql`regexp_replace(${customers.phone}, '[^0-9]', '', 'g') = ${digits}`,
        ),
      )
      .limit(1);
    if (duplicate) return { failure: 'DUPLICATE_PHONE' };

    const [created] = await db
      .insert(customers)
      .values({
        accountId: input.accountId,
        name: input.name.trim(),
        phone,
        notes: input.notes?.trim() || null,
      })
      .returning({ id: customers.id });
    return created;
  });
}
