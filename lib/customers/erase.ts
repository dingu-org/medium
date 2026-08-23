import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  conversationDays,
  customers,
  reminderDeliveries,
  whatsappContacts,
} from '@/lib/db/schema';
import {
  appendAppointmentEvent,
  eventPayloadFromAppointment,
} from '@/lib/events/appointments';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { recordErasureArchive } from '@/lib/gdpr/archive';
import { logger, serializeError } from '@/lib/log';
import { customerWhatsappContactsFilter } from './whatsapp-contacts';

export type EraseCustomerResult = { erased: boolean };

/** Stable (key-sorted) hash of a row for a tamper-evident before-state proof. */
function canonicalHash(row: Record<string, unknown>): string {
  const sorted = Object.keys(row)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = row[key];
      return acc;
    }, {});
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

/**
 * Right-to-erasure for one customer. Cancels scheduled reminders by emitting
 * `appointment.cancelled` (which trips sendReminder's cancelOn) inside the tx,
 * then cascade-deletes the customer (conversations → messages, appointments →
 * reminder_jobs go via FK). Events are published only after the tx commits, and
 * the audit row is written in-tx so the proof and the delete share one boundary.
 * The same proof is mirrored into erasure_archive after the commit because
 * audit_log is cascade-deleted with the PT, and the compliance record has to
 * outlive an account closure.
 * NOT deleted: the metering facts, `conversation_days` (0025) and
 * `reminder_deliveries` (0026). Their customer/appointment references are ON
 * DELETE SET NULL, so the billed days and deliveries survive anonymised —
 * otherwise erasing a customer would retroactively lower the month's metered
 * usage (lib/billing/usage.ts counts these rows) and hand back free quota that
 * was already spent. Anything on those rows that still points at the customer is
 * scrubbed in-tx below, because SET NULL only reaches declared foreign keys.
 * Idempotent: a missing customer is a no-op that writes and publishes nothing.
 */
export async function eraseCustomer(input: {
  customerId: string;
  accountId: string;
}): Promise<EraseCustomerResult> {
  const { customerId, accountId } = input;

  const erasure = await db.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.accountId, accountId)))
      .limit(1)
      .for('update');
    if (!customer) {
      return { erased: false, eventIds: [] as string[], beforeStateHash: '' };
    }

    const beforeStateHash = canonicalHash(customer);

    const customerAppointments = await tx
      .select({
        id: appointments.id,
        accountId: appointments.accountId,
        customerId: appointments.customerId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        serviceType: appointments.serviceType,
        status: appointments.status,
      })
      .from(appointments)
      .where(
        and(eq(appointments.accountId, accountId), eq(appointments.customerId, customerId)),
      );
    const activeAppointments = customerAppointments.filter(
      (appt) => appt.status === 'pending' || appt.status === 'confirmed',
    );

    const eventIds: string[] = [];
    for (const appt of activeAppointments) {
      const eventId = await appendAppointmentEvent(tx, {
        type: 'appointment.cancelled',
        data: {
          ...eventPayloadFromAppointment(appt),
          status: 'cancelled',
          cancelledBy: 'account',
          reason: 'customer_erased',
          origin: 'account',
        },
      });
      eventIds.push(eventId);
    }

    await tx
      .delete(whatsappContacts)
      .where(customerWhatsappContactsFilter(customer));

    // Scrub the surviving metering rows. `first_message_id` is a bare uuid with
    // no FK, so nothing nulls it for us, and it would leave a message id for a
    // deleted message on a row that also carries account_id + local_day — a residual
    // identifier the moment that id shows up in a log or an earlier export.
    await tx
      .update(conversationDays)
      .set({ firstMessageId: null })
      .where(
        and(
          eq(conversationDays.accountId, accountId),
          eq(conversationDays.customerId, customerId),
        ),
      );

    // A wamid embeds the recipient's phone number, so the delivery row cannot
    // keep it. Rewriting to `erased:<row id>` destroys the identifier while
    // preserving the NOT NULL unique key the row is counted through; the
    // appointment link itself goes to NULL via the FK when the cascade lands.
    const appointmentIds = customerAppointments.map((appt) => appt.id);
    if (appointmentIds.length > 0) {
      await tx
        .update(reminderDeliveries)
        .set({ externalId: sql`'erased:' || ${reminderDeliveries.id}::text` })
        .where(
          and(
            eq(reminderDeliveries.accountId, accountId),
            inArray(reminderDeliveries.appointmentId, appointmentIds),
          ),
        );
    }

    await tx.insert(auditLog).values({
      accountId,
      actor: 'account',
      action: 'erasure',
      targetTable: 'customers',
      targetId: customerId,
      metadata: { beforeStateHash },
    });

    await tx
      .delete(customers)
      .where(and(eq(customers.id, customerId), eq(customers.accountId, accountId)));

    return { erased: true, eventIds, beforeStateHash };
  });
  const { erased, eventIds, beforeStateHash } = erasure;

  if (erased) {
    // Best-effort: the delete already committed, so a failed archive write must
    // not turn a completed erasure into an error for the PT.
    try {
      await recordErasureArchive({
        accountId,
        scope: 'customer',
        targetId: customerId,
        beforeStateHash,
        metadata: { erasedAt: new Date().toISOString() },
      });
    } catch (error) {
      logger.error(
        'customer.erasure_archive_failed',
        'Erasure archive write failed after commit',
        { account_id: accountId, customer_id: customerId, ...serializeError(error) },
      );
    }
  }

  for (const id of eventIds) await tryPublishOutboxEvent(id);
  return { erased };
}
