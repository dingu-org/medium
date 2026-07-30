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
  const digits = patientPhoneDigits(patient);

  const matchers: SQL[] = digits.map(
    (d) =>
      sql`regexp_replace(${whatsappContacts.phone}, '[^0-9]', '', 'g') = ${d}`,
  );
  if (patient.waId) matchers.push(eq(whatsappContacts.waId, patient.waId));
  // No usable identifier: match nothing rather than the whole tenant.
  if (!matchers.length) return sql`false`;

  return and(eq(whatsappContacts.ptId, patient.ptId), or(...matchers))!;
}

/** Bare digits of every number that identifies this patient (deduped). */
function patientPhoneDigits(patient: {
  phone: string;
  waId: string | null;
}): string[] {
  return [
    ...new Set(
      [patient.phone, patient.waId ?? '']
        .map((value) => value.replace(/\D/g, ''))
        .filter((value) => value.length > 0),
    ),
  ];
}

/**
 * Whether a synced address-book row resolves to this patient — the JS mirror of
 * `patientWhatsappContactsFilter`, matching on the same normalized digits and
 * the same exact wa_id.
 *
 * `patients` has no unique constraint on (pt_id, phone), so two patients of one
 * PT can legitimately share a number (a couple, a parent and child, a carer) and
 * both resolve to the SAME contact row — whose `full_name` is simply whoever
 * WhatsApp says owns the number. Callers use this to tell an exclusively-owned
 * contact from a shared one; a shared one is third-party data and must not be
 * disclosed inside either patient's DSAR.
 */
export function contactMatchesPatient(
  contact: { phone: string; waId: string | null },
  patient: { phone: string; waId: string | null },
): boolean {
  const contactDigits = contact.phone.replace(/\D/g, '');
  if (contactDigits && patientPhoneDigits(patient).includes(contactDigits)) {
    return true;
  }
  return Boolean(patient.waId) && contact.waId === patient.waId;
}
