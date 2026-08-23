import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import { whatsappContacts } from '@/lib/db/schema';

/**
 * Filter for the synced WhatsApp address-book rows that belong to one customer.
 * A manually added client keeps `customers.wa_id` NULL until an inbound message
 * links them, so matching on wa_id alone misses the contact row the coexistence
 * sync wrote keyed on (account_id, phone). Phones are compared as bare digits
 * because the two sides store different formats ('+355 69 123 4567' vs
 * '355691234567'). Shared by the erasure and the DSAR export so access and
 * erasure agree on the customer's boundary.
 */
export function customerWhatsappContactsFilter(customer: {
  accountId: string;
  phone: string;
  waId: string | null;
}): SQL {
  const digits = customerPhoneDigits(customer);

  const matchers: SQL[] = digits.map(
    (d) =>
      sql`regexp_replace(${whatsappContacts.phone}, '[^0-9]', '', 'g') = ${d}`,
  );
  if (customer.waId) matchers.push(eq(whatsappContacts.waId, customer.waId));
  // No usable identifier: match nothing rather than the whole tenant.
  if (!matchers.length) return sql`false`;

  return and(eq(whatsappContacts.accountId, customer.accountId), or(...matchers))!;
}

/** Bare digits of every number that identifies this customer (deduped). */
function customerPhoneDigits(customer: {
  phone: string;
  waId: string | null;
}): string[] {
  return [
    ...new Set(
      [customer.phone, customer.waId ?? '']
        .map((value) => value.replace(/\D/g, ''))
        .filter((value) => value.length > 0),
    ),
  ];
}

/**
 * Whether a synced address-book row resolves to this customer — the JS mirror of
 * `customerWhatsappContactsFilter`, matching on the same normalized digits and
 * the same exact wa_id.
 *
 * `customers` has no unique constraint on (account_id, phone), so two customers of one
 * PT can legitimately share a number (a couple, a parent and child, a carer) and
 * both resolve to the SAME contact row — whose `full_name` is simply whoever
 * WhatsApp says owns the number. Callers use this to tell an exclusively-owned
 * contact from a shared one; a shared one is third-party data and must not be
 * disclosed inside either customer's DSAR.
 */
export function contactMatchesCustomer(
  contact: { phone: string; waId: string | null },
  customer: { phone: string; waId: string | null },
): boolean {
  const contactDigits = contact.phone.replace(/\D/g, '');
  if (contactDigits && customerPhoneDigits(customer).includes(contactDigits)) {
    return true;
  }
  return Boolean(customer.waId) && contact.waId === customer.waId;
}
