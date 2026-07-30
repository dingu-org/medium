import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  availabilityRules,
  billingOrders,
  blockedPeriods,
  conversationDays,
  conversations,
  events,
  messageTemplates,
  messages,
  patients,
  pts,
  pushSubscriptions,
  reminderJobs,
  services,
  whatsappConnections,
  whatsappContacts,
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
  await db.delete(whatsappContacts).where(eq(whatsappContacts.ptId, ptId));
  await db.delete(billingOrders).where(eq(billingOrders.ptId, ptId));
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.ptId, ptId));

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
  const [appt] = await db
    .insert(appointments)
    .values({
      ptId,
      patientId,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
      serviceType: 'checkup',
    })
    .returning({ id: appointments.id });
  await db.insert(reminderJobs).values({
    ptId,
    appointmentId: appt.id,
    scheduledFor: new Date(Date.now() + 43_200_000),
    status: 'sent',
    sentAt: new Date(),
    responseType: 'confirm',
  });
  await db.insert(conversationDays).values({
    ptId,
    patientId,
    conversationId,
    localDay: '2026-07-15',
    monthKey: '2026-07',
  });
  // The coexistence sync stores the phone digits-only; the patient row keeps the
  // formatted E.164, so the export has to match on normalized digits.
  await db.insert(whatsappContacts).values({
    ptId,
    phone: '35544400111',
    fullName: 'Exp Patient',
  });
  await db.insert(billingOrders).values({
    ptId,
    pokOrderId: `pok-${Date.now()}`,
    plan: 'solo',
    period: 'monthly',
    amountMinor: 250_000,
  });
  await db.insert(pushSubscriptions).values({
    ptId,
    endpoint: `https://push.example.com/${Date.now()}`,
    keys: { p256dh: 'PUSH_P256DH_SECRET', auth: 'PUSH_AUTH_SECRET' },
    userAgent: 'Chrome/QA',
  });
  await db
    .insert(services)
    .values({ ptId, name: 'Consult', durationMin: 30, priceLek: 5000 });
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
    displayPhoneNumber: '+355 69 123 4567',
    status: 'active',
  });

  // The pts row itself comes from the signup trigger; set the Phase 15
  // profile fields on it so the export assertions can see them.
  await db
    .update(pts)
    .set({
      fullName: 'Dr. Test',
      title: 'Fizioterapeut',
      address: 'Rr. Test 1, Tiranë',
      assistantPaused: true,
    })
    .where(eq(pts.id, ptId));
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

  it('discloses the data erasure treats as the patient\'s own', async () => {
    const exp = (await buildPatientExport({ ptId, patientId }))!;

    // Matched on normalized phone digits even though patients.wa_id ('w1')
    // never matches the synced contact row.
    expect(exp.whatsapp_contacts).toHaveLength(1);
    expect(exp.whatsapp_contacts[0].fullName).toBe('Exp Patient');

    expect(exp.reminder_jobs).toHaveLength(1);
    expect(exp.reminder_jobs[0].responseType).toBe('confirm');
    expect(typeof exp.reminder_jobs[0].sentAt).toBe('string');

    expect(exp.conversation_days).toHaveLength(1);
    expect(exp.conversation_days[0].monthKey).toBe('2026-07');
  });

  it('scopes the added tables to the patient and their tenant', async () => {
    // A second patient of the same PT owns their own contact/day rows.
    const [other] = await db
      .insert(patients)
      .values({ ptId, name: 'Other Patient', phone: '+35544400222' })
      .returning({ id: patients.id });
    const [otherConv] = await db
      .insert(conversations)
      .values({ ptId, patientId: other.id, channel: 'whatsapp' })
      .returning({ id: conversations.id });
    await db
      .insert(whatsappContacts)
      .values({ ptId, phone: '35544400222', fullName: 'Other Patient' });
    await db.insert(conversationDays).values({
      ptId,
      patientId: other.id,
      conversationId: otherConv.id,
      localDay: '2026-07-16',
      monthKey: '2026-07',
    });

    const exp = (await buildPatientExport({ ptId, patientId }))!;
    expect(exp.whatsapp_contacts).toHaveLength(1);
    expect(exp.whatsapp_contacts[0].phone).toBe('35544400111');
    expect(exp.conversation_days).toHaveLength(1);
    expect(exp.conversation_days[0].patientId).toBe(patientId);
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
    expect(exp.billing_orders).toHaveLength(1);
    expect(exp.billing_orders[0].amountMinor).toBe(250_000);
    // Both audit rows of the tenant, not just the patient-scoped one.
    expect(exp.audit_log).toHaveLength(2);

    // Push credentials are metadata-only: the endpoint URL and the keys are
    // capabilities, never disclosed.
    expect(exp.push_subscriptions).toHaveLength(1);
    expect(exp.push_subscriptions[0].userAgent).toBe('Chrome/QA');
    expect(exp.push_subscriptions[0].endpoint).toBe('REDACTED');
    expect(exp.push_subscriptions[0].keys).toBe('REDACTED');
    expect(JSON.stringify(exp)).not.toContain('PUSH_P256DH_SECRET');

    expect(exp.whatsapp_connection).not.toBeNull();
    expect(exp.whatsapp_connection!.accessTokenEncrypted).toBe('REDACTED');
    expect(exp.whatsapp_connection).not.toHaveProperty('access_token_encrypted');

    // Phase 15 columns round-trip: pts/services via SELECT *, the
    // whatsapp_connections explicit column list via displayPhoneNumber.
    expect(exp.pt.fullName).toBe('Dr. Test');
    expect(exp.pt.title).toBe('Fizioterapeut');
    expect(exp.pt.address).toBe('Rr. Test 1, Tiranë');
    expect(exp.pt.assistantPaused).toBe(true);
    expect(exp.services[0].priceLek).toBe(5000);
    expect(exp.whatsapp_connection!.displayPhoneNumber).toBe('+355 69 123 4567');
  });

  it('produces a JSON-round-trippable object (no Dates or Buffers leak)', async () => {
    const exp = await buildPtExport(ptId);
    const roundTripped = JSON.parse(JSON.stringify(exp));
    expect(roundTripped).toEqual(exp);
    // No raw token bytes anywhere in the serialized export.
    expect(JSON.stringify(exp)).not.toContain(TOKEN);
  });
});
