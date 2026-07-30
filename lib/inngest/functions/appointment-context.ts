import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  patients,
  pts,
  whatsappConnections,
} from '@/lib/db/schema';

export type AppointmentJobContext = {
  appointmentId: string;
  ptId: string;
  patientId: string;
  startsAt: Date;
  endsAt: Date;
  serviceType: string | null;
  status:
    | 'pending'
    | 'confirmed'
    | 'cancelled'
    | 'no_show'
    | 'completed'
    | 'rescheduled';
  patientName: string;
  reminderOptedOutAt: Date | null;
  recipient: string | null;
  conversationId: string | null;
  timezone: string;
  practiceName: string | null;
  connectionId: string | null;
};

export async function loadAppointmentJobContext(args: {
  appointmentId: string;
  ptId: string;
}): Promise<AppointmentJobContext | null> {
  const [row] = await db
    .select({
      appointmentId: appointments.id,
      ptId: appointments.ptId,
      patientId: appointments.patientId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      serviceType: appointments.serviceType,
      status: appointments.status,
      patientName: patients.name,
      reminderOptedOutAt: patients.reminderOptedOutAt,
      recipient: patients.waId,
      timezone: pts.timezone,
      practiceName: pts.practiceName,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .innerJoin(pts, eq(appointments.ptId, pts.id))
    .where(
      and(
        eq(appointments.id, args.appointmentId),
        eq(appointments.ptId, args.ptId),
        eq(patients.ptId, args.ptId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [[conversation], [connection]] = await Promise.all([
    db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.ptId, args.ptId),
          eq(conversations.patientId, row.patientId),
          eq(conversations.channel, 'whatsapp'),
        ),
      )
      .limit(1),
    // Nothing in the schema limits a PT to one active connection, so the pick
    // must be deterministic: newest active row wins, matching every other
    // consumer (lib/channels/whatsapp/client.ts, chat/actions.ts, pwa routes).
    db
      .select({ id: whatsappConnections.id })
      .from(whatsappConnections)
      .where(
        and(
          eq(whatsappConnections.ptId, args.ptId),
          eq(whatsappConnections.status, 'active'),
        ),
      )
      .orderBy(desc(whatsappConnections.createdAt))
      .limit(1),
  ]);

  return {
    ...row,
    conversationId: conversation?.id ?? null,
    connectionId: connection?.id ?? null,
  };
}

// Re-exported at its original path so the job modules keep their import; the
// implementation lives in lib/format so the reminder response handler can share
// it without depending on an Inngest module.
export { formatAppointmentTime } from '@/lib/format/appointment-time';
