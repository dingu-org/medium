import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  availabilityRules,
  blockedPeriods,
  conversations,
  events,
  messageTemplates,
  messages,
  patients,
  pts,
  services,
  whatsappConnections,
} from '@/lib/db/schema';

export type PatientExport = {
  patient: Record<string, unknown>;
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  appointments: Record<string, unknown>[];
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
  message_templates: Record<string, unknown>[];
  events: Record<string, unknown>[];
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
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.ptId, ptId));

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
    message_templates: templateRows.map(serializeRow),
    events: eventRows.map(serializeRow),
  };
}
