import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  customers,
  accounts,
  whatsappConnections,
} from '@/lib/db/schema';

export type AppointmentJobContext = {
  appointmentId: string;
  accountId: string;
  customerId: string;
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
  customerName: string;
  reminderOptedOutAt: Date | null;
  recipient: string | null;
  conversationId: string | null;
  timezone: string;
  name: string | null;
  connectionId: string | null;
};

export async function loadAppointmentJobContext(args: {
  appointmentId: string;
  accountId: string;
}): Promise<AppointmentJobContext | null> {
  const [row] = await db
    .select({
      appointmentId: appointments.id,
      accountId: appointments.accountId,
      customerId: appointments.customerId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      serviceType: appointments.serviceType,
      status: appointments.status,
      customerName: customers.name,
      reminderOptedOutAt: customers.reminderOptedOutAt,
      recipient: customers.waId,
      timezone: accounts.timezone,
      name: accounts.name,
    })
    .from(appointments)
    .innerJoin(customers, eq(appointments.customerId, customers.id))
    .innerJoin(accounts, eq(appointments.accountId, accounts.id))
    .where(
      and(
        eq(appointments.id, args.appointmentId),
        eq(appointments.accountId, args.accountId),
        eq(customers.accountId, args.accountId),
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
          eq(conversations.accountId, args.accountId),
          eq(conversations.customerId, row.customerId),
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
          eq(whatsappConnections.accountId, args.accountId),
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
