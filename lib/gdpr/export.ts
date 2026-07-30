import { and, desc, eq, inArray, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  availabilityRules,
  billingOrders,
  blockedPeriods,
  conversationDays,
  conversations,
  costDaily,
  events,
  messageTemplates,
  messages,
  patients,
  pts,
  pushSubscriptions,
  pwaMutations,
  reminderJobs,
  services,
  waMessageStatuses,
  whatsappConnections,
  whatsappContacts,
} from '@/lib/db/schema';
import {
  contactMatchesPatient,
  patientWhatsappContactsFilter,
} from '@/lib/patients/whatsapp-contacts';

export type PatientExport = {
  patient: Record<string, unknown>;
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  appointments: Record<string, unknown>[];
  reminder_jobs: Record<string, unknown>[];
  conversation_days: Record<string, unknown>[];
  whatsapp_contacts: Record<string, unknown>[];
  audit_log_entries_for_patient: Record<string, unknown>[];
};

export type PtExport = {
  pt: Record<string, unknown>;
  patients: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  appointments: Record<string, unknown>[];
  services: Record<string, unknown>[];
  availability_rules: Record<string, unknown>[];
  blocked_periods: Record<string, unknown>[];
  whatsapp_connection: Record<string, unknown> | null;
  whatsapp_contacts: Record<string, unknown>[];
  message_templates: Record<string, unknown>[];
  reminder_jobs: Record<string, unknown>[];
  conversation_days: Record<string, unknown>[];
  wa_message_statuses: Record<string, unknown>[];
  cost_daily: Record<string, unknown>[];
  pwa_mutations: Record<string, unknown>[];
  events: Record<string, unknown>[];
  billing_orders: Record<string, unknown>[];
  push_subscriptions: Record<string, unknown>[];
  audit_log: Record<string, unknown>[];
};

/** Map top-level Date columns to ISO strings so the row is JSON-serializable. */
function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

export async function buildPatientExport(input: {
  ptId: string;
  patientId: string;
}): Promise<PatientExport | null> {
  const { ptId, patientId } = input;

  const [patient] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.ptId, ptId)))
    .limit(1);
  if (!patient) return null;

  const convRows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.ptId, ptId),
        eq(conversations.patientId, patientId),
      ),
    );

  const convIds = convRows.map((c) => c.id);
  const messageRows = convIds.length
    ? await db
        .select()
        .from(messages)
        .where(inArray(messages.conversationId, convIds))
    : [];

  const appointmentRows = await db
    .select()
    .from(appointments)
    .where(
      and(eq(appointments.ptId, ptId), eq(appointments.patientId, patientId)),
    );

  const reminderRows = appointmentRows.length
    ? await db
        .select()
        .from(reminderJobs)
        .where(
          inArray(
            reminderJobs.appointmentId,
            appointmentRows.map((a) => a.id),
          ),
        )
    : [];

  const conversationDayRows = await db
    .select()
    .from(conversationDays)
    .where(
      and(
        eq(conversationDays.ptId, ptId),
        eq(conversationDays.patientId, patientId),
      ),
    );

  // The erasure path deletes these rows as part of the same patient's right to
  // erasure (lib/patients/erase.ts), so access has to disclose them — same
  // matcher on both sides keeps the subject boundary symmetric.
  //
  // Except when the number is shared: nothing stops two patients of one PT from
  // having the same phone (family, carer), and they then resolve to ONE contact
  // row that names whoever WhatsApp says owns the number. That row is not this
  // subject's data alone, so it is withheld rather than disclosed to either of
  // them.
  const contactCandidates = await db
    .select()
    .from(whatsappContacts)
    .where(patientWhatsappContactsFilter(patient));
  const otherPatients = contactCandidates.length
    ? await db
        .select({ phone: patients.phone, waId: patients.waId })
        .from(patients)
        .where(and(eq(patients.ptId, ptId), ne(patients.id, patientId)))
    : [];
  const contactRows = contactCandidates.filter(
    (contact) =>
      !otherPatients.some((other) => contactMatchesPatient(contact, other)),
  );

  // Access to a patient's data is audited against whichever row the operation
  // touched, so targetId is not always the patient id: AI conversation reads and
  // failure handoffs log the inbound message id, and AI appointment tools log the
  // appointment id (see lib/conversation/engine.ts and lib/ai/dispatcher.ts).
  // Matching only targetId = patientId would silently drop nearly every real
  // access event, so match (targetTable, targetId) across all of the patient's
  // conversation, message, and appointment ids as well.
  const messageIds = messageRows.map((m) => m.id);
  const appointmentIds = appointmentRows.map((a) => a.id);

  const targetMatchers = [
    and(eq(auditLog.targetTable, 'patients'), eq(auditLog.targetId, patientId)),
  ];
  if (convIds.length) {
    targetMatchers.push(
      and(
        eq(auditLog.targetTable, 'conversations'),
        inArray(auditLog.targetId, convIds),
      ),
    );
  }
  if (messageIds.length) {
    targetMatchers.push(
      and(
        eq(auditLog.targetTable, 'messages'),
        inArray(auditLog.targetId, messageIds),
      ),
    );
  }
  if (appointmentIds.length) {
    targetMatchers.push(
      and(
        eq(auditLog.targetTable, 'appointments'),
        inArray(auditLog.targetId, appointmentIds),
      ),
    );
  }

  const auditRows = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.ptId, ptId), or(...targetMatchers)))
    .orderBy(auditLog.occurredAt);

  return {
    patient: serializeRow(patient),
    conversations: convRows.map(serializeRow),
    messages: messageRows.map(serializeRow),
    appointments: appointmentRows.map(serializeRow),
    reminder_jobs: reminderRows.map(serializeRow),
    conversation_days: conversationDayRows.map(serializeRow),
    whatsapp_contacts: contactRows.map(serializeRow),
    audit_log_entries_for_patient: auditRows.map(serializeRow),
  };
}

export async function buildPtExport(ptId: string): Promise<PtExport> {
  const [pt] = await db.select().from(pts).where(eq(pts.id, ptId)).limit(1);
  const patientRows = await db
    .select()
    .from(patients)
    .where(eq(patients.ptId, ptId));
  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.ptId, ptId));
  const messageRows = await db
    .select()
    .from(messages)
    .where(eq(messages.ptId, ptId));
  const appointmentRows = await db
    .select()
    .from(appointments)
    .where(eq(appointments.ptId, ptId));
  const serviceRows = await db
    .select()
    .from(services)
    .where(eq(services.ptId, ptId));
  const availabilityRows = await db
    .select()
    .from(availabilityRules)
    .where(eq(availabilityRules.ptId, ptId));
  const blockedRows = await db
    .select()
    .from(blockedPeriods)
    .where(eq(blockedPeriods.ptId, ptId));
  const templateRows = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.ptId, ptId));
  // Tenant-scoped tables a single patient's DSAR already discloses (plus the
  // operational ones): without them the PT's own subject access would return
  // LESS about their practice than one of their patients can ask for.
  const contactRows = await db
    .select()
    .from(whatsappContacts)
    .where(eq(whatsappContacts.ptId, ptId));
  const reminderRows = await db
    .select()
    .from(reminderJobs)
    .where(eq(reminderJobs.ptId, ptId));
  const conversationDayRows = await db
    .select()
    .from(conversationDays)
    .where(eq(conversationDays.ptId, ptId));
  const statusRows = await db
    .select()
    .from(waMessageStatuses)
    .where(eq(waMessageStatuses.ptId, ptId));
  const costRows = await db
    .select()
    .from(costDaily)
    .where(eq(costDaily.ptId, ptId));
  const mutationRows = await db
    .select()
    .from(pwaMutations)
    .where(eq(pwaMutations.ptId, ptId));
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.ptId, ptId));
  const orderRows = await db
    .select()
    .from(billingOrders)
    .where(eq(billingOrders.ptId, ptId));
  const auditRows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.ptId, ptId))
    .orderBy(auditLog.occurredAt);
  // endpoint + keys are the push credentials for the PT's own browser — the
  // subject already knows their devices, and the values must never leave the
  // database, so disclose only the metadata and redact both like the WA token.
  const pushRows = await db
    .select({
      id: pushSubscriptions.id,
      ptId: pushSubscriptions.ptId,
      userAgent: pushSubscriptions.userAgent,
      createdAt: pushSubscriptions.createdAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.ptId, ptId));

  // Explicitly omit access_token_encrypted — the bytea must never enter this
  // module; the redacted marker is attached below instead.
  const [connection] = await db
    .select({
      id: whatsappConnections.id,
      ptId: whatsappConnections.ptId,
      phoneNumberId: whatsappConnections.phoneNumberId,
      wabaId: whatsappConnections.wabaId,
      mode: whatsappConnections.mode,
      coexistenceSyncStatus: whatsappConnections.coexistenceSyncStatus,
      coexistenceSyncDeadlineAt: whatsappConnections.coexistenceSyncDeadlineAt,
      coexistenceContactsRequestId:
        whatsappConnections.coexistenceContactsRequestId,
      coexistenceHistoryRequestId:
        whatsappConnections.coexistenceHistoryRequestId,
      coexistenceLastProgress: whatsappConnections.coexistenceLastProgress,
      coexistenceLastError: whatsappConnections.coexistenceLastError,
      tier: whatsappConnections.tier,
      qualityRating: whatsappConnections.qualityRating,
      displayPhoneNumber: whatsappConnections.displayPhoneNumber,
      connectedAt: whatsappConnections.connectedAt,
      tokenExpiresAt: whatsappConnections.tokenExpiresAt,
      expiryWarningSentAt: whatsappConnections.expiryWarningSentAt,
      status: whatsappConnections.status,
      createdAt: whatsappConnections.createdAt,
    })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.ptId, ptId))
    .orderBy(desc(whatsappConnections.createdAt))
    .limit(1);

  return {
    pt: pt ? serializeRow(pt) : {},
    patients: patientRows.map(serializeRow),
    conversations: convRows.map(serializeRow),
    messages: messageRows.map(serializeRow),
    appointments: appointmentRows.map(serializeRow),
    services: serviceRows.map(serializeRow),
    availability_rules: availabilityRows.map(serializeRow),
    blocked_periods: blockedRows.map(serializeRow),
    whatsapp_connection: connection
      ? { ...serializeRow(connection), accessTokenEncrypted: 'REDACTED' }
      : null,
    whatsapp_contacts: contactRows.map(serializeRow),
    message_templates: templateRows.map(serializeRow),
    reminder_jobs: reminderRows.map(serializeRow),
    conversation_days: conversationDayRows.map(serializeRow),
    wa_message_statuses: statusRows.map(serializeRow),
    cost_daily: costRows.map(serializeRow),
    pwa_mutations: mutationRows.map(serializeRow),
    events: eventRows.map(serializeRow),
    billing_orders: orderRows.map(serializeRow),
    push_subscriptions: pushRows.map((row) => ({
      ...serializeRow(row),
      endpoint: 'REDACTED',
      keys: 'REDACTED',
    })),
    audit_log: auditRows.map(serializeRow),
  };
}
