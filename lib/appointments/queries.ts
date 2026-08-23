import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { appointments } from '@/lib/db/schema';
import type { AppointmentRecord } from './types';

export async function listUpcomingAppointments(args: {
  accountId: string;
  customerId: string;
  now?: Date;
  limit?: number;
}): Promise<AppointmentRecord[]> {
  return db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.accountId, args.accountId),
        eq(appointments.customerId, args.customerId),
        inArray(appointments.status, ['pending', 'confirmed']),
        gte(appointments.startsAt, args.now ?? new Date()),
      ),
    )
    .orderBy(asc(appointments.startsAt), asc(appointments.id))
    .limit(args.limit ?? 10);
}
