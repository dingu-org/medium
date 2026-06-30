import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { patients } from '@/lib/db/schema';
import { normalizeManualPhone } from './phone';

export type ManualPatientFailure = 'INVALID_PHONE' | 'DUPLICATE_PHONE';

export async function createManualPatient(input: {
  ptId: string;
  name: string;
  phone: string;
  notes?: string;
}): Promise<{ id: string } | { failure: ManualPatientFailure }> {
  const phone = normalizeManualPhone(input.phone);
  if (!phone) return { failure: 'INVALID_PHONE' };
  const digits = phone.slice(1);
  const [duplicate] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(
      and(
        eq(patients.ptId, input.ptId),
        sql`regexp_replace(${patients.phone}, '[^0-9]', '', 'g') = ${digits}`,
      ),
    )
    .limit(1);
  if (duplicate) return { failure: 'DUPLICATE_PHONE' };

  const [created] = await db
    .insert(patients)
    .values({
      ptId: input.ptId,
      name: input.name.trim(),
      phone,
      notes: input.notes?.trim() || null,
    })
    .returning({ id: patients.id });
  return created;
}
