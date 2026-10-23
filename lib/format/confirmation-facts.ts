import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, appointments, services } from '@/lib/db/schema';
import type { ServiceMode } from '@/lib/services/modes';

/**
 * What a confirmation may say about where the appointment happens (MED-120).
 * `mode: null` is "unknown" (a legacy service, or one renamed since booking):
 * the confirmation then adds nothing rather than guessing.
 */
export type ConfirmationFacts =
  | {
      mode: 'at_business';
      address: string | null;
      city: string | null;
      country: string | null;
      directions: string | null;
      parking: string | null;
      entrance: string | null;
      floor: string | null;
    }
  | { mode: 'at_client'; clientAddress: string | null }
  | { mode: 'online' }
  | { mode: null };

export type ConfirmationFactsRows = {
  mode: ServiceMode | null;
  clientAddress: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  directions: string | null;
  parking: string | null;
  entrance: string | null;
  floor: string | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Pure mapping from the stored rows to the facts a confirmation may state. */
export function confirmationFactsFromRows(
  rows: ConfirmationFactsRows,
): ConfirmationFacts {
  if (rows.mode === 'at_business') {
    const country = clean(rows.country);
    return {
      mode: 'at_business',
      address: clean(rows.address),
      city: clean(rows.city),
      // Stored as 'AL', shown as Shqipëri; any other value is shown as-is.
      country: country === 'AL' ? 'Shqipëri' : country,
      directions: clean(rows.directions),
      parking: clean(rows.parking),
      entrance: clean(rows.entrance),
      floor: clean(rows.floor),
    };
  }
  if (rows.mode === 'at_client') {
    return { mode: 'at_client', clientAddress: clean(rows.clientAddress) };
  }
  if (rows.mode === 'online') return { mode: 'online' };
  return { mode: null };
}

/**
 * Loads the facts for one appointment's confirmation. The service is matched by
 * name (appointments store the name, not an id); no match gives `mode: null`.
 * Shared by the conversation turn and the background job so both sides of the
 * product word a confirmation identically.
 */
export async function loadConfirmationFacts(
  accountId: string,
  appointmentId: string,
): Promise<ConfirmationFacts> {
  const [appointment] = await db
    .select({
      serviceType: appointments.serviceType,
      clientAddress: appointments.clientAddress,
      address: accounts.address,
      city: accounts.city,
      country: accounts.country,
      directions: accounts.directions,
      parking: accounts.parking,
      entrance: accounts.entrance,
      floor: accounts.floor,
    })
    .from(appointments)
    .innerJoin(accounts, eq(appointments.accountId, accounts.id))
    .where(
      and(
        eq(appointments.id, appointmentId),
        eq(appointments.accountId, accountId),
      ),
    )
    .limit(1);
  if (!appointment) return { mode: null };

  const serviceName = appointment.serviceType?.trim();
  let mode: ServiceMode | null = null;
  if (serviceName) {
    const [service] = await db
      .select({ mode: services.mode })
      .from(services)
      .where(
        and(
          eq(services.accountId, accountId),
          sql`lower(btrim(${services.name})) = lower(btrim(${serviceName}))`,
        ),
      )
      // An active service wins over a hidden one with the same name.
      .orderBy(desc(services.active))
      .limit(1);
    mode = service?.mode ?? null;
  }

  return confirmationFactsFromRows({ ...appointment, mode });
}
