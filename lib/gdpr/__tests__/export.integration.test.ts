import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
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
  services,
  whatsappConnections,
} from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { buildPatientExport, buildPtExport } from '../export';

const TOKEN = 'PT_TOKEN_export_secret';

let ptId = '';
let otherPtId = '';
let patientId = '';
let conversationId = '';

async function makeUser(stamp: string): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb.auth.admin.createUser({
    email: `export-${stamp}@example.com`,
    password: 'export-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return data.user.id;
}

beforeAll(async () => {
  ptId = await makeUser(`a-${Date.now()}`);
  otherPtId = await makeUser(`b-${Date.now()}`);
});

afterAll(async () => {
  const sb = createServiceClient();
  if (ptId) await sb.auth.admin.deleteUser(ptId);
  if (otherPtId) await sb.auth.admin.deleteUser(otherPtId);
});

beforeEach(async () => {
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db.delete(services).where(eq(services.ptId, ptId));
  await db.delete(availabilityRules).where(eq(availabilityRules.ptId, ptId));
  await db.delete(blockedPeriods).where(eq(blockedPeriods.ptId, ptId));
  await db.delete(messageTemplates).where(eq(messageTemplates.ptId, ptId));
  await db.delete(events).where(eq(events.ptId, ptId));
  await db.delete(auditLog).where(eq(auditLog.ptId, ptId));
  await db.delete(whatsappConnections).where(eq(whatsappConnections.ptId, ptId));

  const [patient] = await db
    .insert(patients)
    .values({ ptId, name: 'Exp Patient', phone: '+35544400111', waId: 'w1' })
    .returning({ id: patients.id });
  patientId = patient.id;

  const [conv] = await db
    .insert(conversations)
    .values({ ptId, patientId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conv.id;

  await db.insert(messages).values({
    ptId,
    conversationId,
    role: 'patient',
    channel: 'whatsapp',
    content: 'export me',
  });
  await db.insert(appointments).values({
    ptId,
    patientId,
    startsAt: new Date(Date.now() + 86_400_000),
    endsAt: new Date(Date.now() + 90_000_000),
    serviceType: 'checkup',
  });
  await db
    .insert(services)
    .values({ ptId, name: 'Consult', durationMin: 30 });
  await db.insert(availabilityRules).values({
    ptId,
    weekday: 1,
    startTime: '09:00:00',
    endTime: '17:00:00',
  });
  await db.insert(blockedPeriods).values({
    ptId,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 3_600_000),
  });
  await db.insert(messageTemplates).values({
    ptId,
    name: 'reminder',
    language: 'sq',
    body: 'Kujtues',
  });
  await db.insert(events).values({ ptId, type: 'seed.metric', payload: { count: 1 } });
  // Audit rows: one for this patient, one for another target (must be excluded).
  await db.insert(auditLog).values({
    ptId,
    actor: 'pt',
    action: 'patient.notes_updated',
    targetTable: 'patients',
    targetId: patientId,
  });
  await db.insert(auditLog).values({
    ptId,
    actor: 'pt',
    action: 'other',
    targetTable: 'patients',
    targetId: otherPtId,
  });

  const encrypted = await encryptToken(TOKEN);
  await db.insert(whatsappConnections).values({
    ptId,
    phoneNumberId: `pn-${Date.now()}`,
    wabaId: 'WABA_EXPORT',
    accessTokenEncrypted: encrypted,
    status: 'active',
  });
});

describe('buildPatientExport', () => {
  it('returns the full DSAR shape scoped to the patient with ISO dates', async () => {
    const result = await buildPatientExport({ ptId, patientId });
    expect(result).not.toBeNull();
    const exp = result!;

    expect(exp.patient.id).toBe(patientId);
    expect(exp.conversations).toHaveLength(1);
    expect(exp.messages).toHaveLength(1);
    expect(exp.appointments).toHaveLength(1);

    // Only audit rows targeting this patient are included.
    expect(exp.audit_log_entries_for_patient).toHaveLength(1);
    expect(exp.audit_log_entries_for_patient[0].targetId).toBe(patientId);

    // Dates are serialized to ISO strings.
    expect(typeof exp.patient.createdAt).toBe('string');
    expect(typeof exp.appointments[0].startsAt).toBe('string');
  });

  it('includes audit rows targeting the patient\'s messages and appointments', async () => {
    // Real access events are logged against the touched row, not the patient id:
    // AI reads target the message id, AI tools target the appointment id.
    const [msg] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.ptId, ptId))
      .limit(1);
    const [appt] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.ptId, ptId))
      .limit(1);

    await db.insert(auditLog).values([
      {
        ptId,
        actor: 'ai',
        action: 'ai.conversation.read',
        targetTable: 'messages',
        targetId: msg.id,
      },
      {
        ptId,
        actor: 'ai',
        action: 'ai.tool.book_appointment',
        targetTable: 'appointments',
        targetId: appt.id,
      },
      // A message-target row for an unrelated id must stay excluded.
      {
        ptId,
        actor: 'ai',
        action: 'ai.conversation.read',
        targetTable: 'messages',
        targetId: '00000000-0000-0000-0000-000000000000',
      },
    ]);

    const result = await buildPatientExport({ ptId, patientId });
    const rows = result!.audit_log_entries_for_patient;
    const actions = rows.map((r) => r.action);
    // patient.notes_updated (patients/patientId) + message row + appointment row.
    expect(rows).toHaveLength(3);
    expect(actions).toContain('patient.notes_updated');
    expect(actions).toContain('ai.conversation.read');
    expect(actions).toContain('ai.tool.book_appointment');
  });

  it('returns null for an unknown or cross-tenant patient', async () => {
    expect(
      await buildPatientExport({
        ptId,
        patientId: '00000000-0000-0000-0000-000000000000',
      }),
    ).toBeNull();
    expect(
      await buildPatientExport({ ptId: otherPtId, patientId }),
    ).toBeNull();
  });
});

describe('buildPtExport', () => {
  it('returns all tables scoped to the PT with the token redacted', async () => {
    const exp = await buildPtExport(ptId);

    expect(exp.pt.id).toBe(ptId);
    expect(exp.patients).toHaveLength(1);
    expect(exp.conversations).toHaveLength(1);
    expect(exp.messages).toHaveLength(1);
    expect(exp.appointments).toHaveLength(1);
    expect(exp.services).toHaveLength(1);
    expect(exp.availability_rules).toHaveLength(1);
    expect(exp.blocked_periods).toHaveLength(1);
    expect(exp.message_templates).toHaveLength(1);
    expect(exp.events).toHaveLength(1);

    expect(exp.whatsapp_connection).not.toBeNull();
    expect(exp.whatsapp_connection!.accessTokenEncrypted).toBe('REDACTED');
    expect(exp.whatsapp_connection).not.toHaveProperty('access_token_encrypted');
  });

  it('produces a JSON-round-trippable object (no Dates or Buffers leak)', async () => {
    const exp = await buildPtExport(ptId);
    const roundTripped = JSON.parse(JSON.stringify(exp));
    expect(roundTripped).toEqual(exp);
    // No raw token bytes anywhere in the serialized export.
    expect(JSON.stringify(exp)).not.toContain(TOKEN);
  });
});
