import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { services } from '@/lib/db/schema';

export type ServiceRecord = {
  id: string;
  name: string;
  durationMinutes: number;
  active: boolean;
};

export async function getServices(
  ptId: string,
  options: { activeOnly?: boolean } = {},
): Promise<ServiceRecord[]> {
  const filters = [eq(services.ptId, ptId)];
  if (options.activeOnly) filters.push(eq(services.active, true));

  const rows = await db
    .select({
      id: services.id,
      name: services.name,
      durationMinutes: services.durationMin,
      active: services.active,
    })
    .from(services)
    .where(and(...filters))
    .orderBy(
      sql`CASE
        WHEN ${services.name} = 'Vlerësim i parë' THEN 0
        WHEN ${services.name} = 'Seancë vijuese' THEN 1
        WHEN ${services.name} = 'Terapi manuale' THEN 2
        ELSE 3
      END`,
      asc(services.createdAt),
      asc(services.name),
    );

  return rows;
}

export async function getActiveService(
  ptId: string,
  serviceId: string,
): Promise<ServiceRecord | null> {
  const [service] = await db
    .select({
      id: services.id,
      name: services.name,
      durationMinutes: services.durationMin,
      active: services.active,
    })
    .from(services)
    .where(
      and(
        eq(services.id, serviceId),
        eq(services.ptId, ptId),
        eq(services.active, true),
      ),
    )
    .limit(1);

  return service ?? null;
}

export async function resolveBookingService(
  ptId: string,
  input: { serviceId?: string; legacyServiceType?: string },
): Promise<{ name: string; durationMinutes: number } | null> {
  if (input.serviceId) {
    const service = await getActiveService(ptId, input.serviceId);
    return service
      ? { name: service.name, durationMinutes: service.durationMinutes }
      : null;
  }

  const legacyName = input.legacyServiceType?.trim();
  if (!legacyName) return null;
  const [service] = await db
    .select({ name: services.name, durationMinutes: services.durationMin })
    .from(services)
    .where(
      and(
        eq(services.ptId, ptId),
        eq(services.active, true),
        sql`lower(btrim(${services.name})) = lower(btrim(${legacyName}))`,
      ),
    )
    .limit(1);

  // Old offline mutations predate service IDs and used arbitrary text. Their
  // payload remains replayable at the historical one-hour duration.
  return service ?? { name: legacyName, durationMinutes: 60 };
}

export async function getActiveServiceByName(
  ptId: string,
  name: string,
): Promise<{ name: string; durationMinutes: number } | null> {
  const normalized = name.trim();
  if (!normalized) return null;
  const [service] = await db
    .select({ name: services.name, durationMinutes: services.durationMin })
    .from(services)
    .where(
      and(
        eq(services.ptId, ptId),
        eq(services.active, true),
        sql`lower(btrim(${services.name})) = lower(btrim(${normalized}))`,
      ),
    )
    .limit(1);
  return service ?? null;
}
