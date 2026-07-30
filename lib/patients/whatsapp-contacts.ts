import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import { whatsappContacts } from '@/lib/db/schema';

/**
 * Filter for the synced WhatsApp address-book rows that belong to one patient.
 * A manually added client keeps `patients.wa_id` NULL until an inbound message
 * links them, so matching on wa_id alone misses the contact row the coexistence
 * sync wrote keyed on (pt_id, phone). Phones are compared as bare digits
 * because the two sides store different formats ('+355 69 123 4567' vs
 * '355691234567'). Shared by the erasure and the DSAR export so access and
 * erasure agree on the patient's boundary.
 */
export function patientWhatsappContactsFilter(patient: {
  ptId: string;
  phone: string;
  waId: string | null;
}): SQL {
  const digits = [
    ...new Set(
      [patient.phone, patient.waId ?? '']
        .map((value) => value.replace(/\D/g, ''))
        .filter((value) => value.length > 0),
    ),
  ];

  const matchers: SQL[] = digits.map(
    (d) =>
      sql`regexp_replace(${whatsappContacts.phone}, '[^0-9]', '', 'g') = ${d}`,
  );
  if (patient.waId) matchers.push(eq(whatsappContacts.waId, patient.waId));
  // No usable identifier: match nothing rather than the whole tenant.
  if (!matchers.length) return sql`false`;

  return and(eq(whatsappContacts.ptId, patient.ptId), or(...matchers))!;
}
