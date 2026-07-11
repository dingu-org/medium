import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  conversations,
  events,
  messages,
  patients,
  reminderJobs,
  whatsappContacts,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { erasePatient } from '../erase';

const tryPublish = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/events/outbox', () => ({
  tryPublishOutboxEvent: tryPublish,
}));

const WA_ID = '447700900555';

let ptId = '';
let otherPtId = '';
let patientId = '';
let confirmedApptId = '';
let completedApptId = '';

async function makeUser(stamp: string): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb.auth.admin.createUser({
    email: `erase-${stamp}@example.com`,
    password: 'erase-pass-1234',
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
  tryPublish.mockClear();
  await db.delete(auditLog).where(eq(auditLog.ptId, ptId));
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db.delete(whatsappContacts).where(eq(whatsappContacts.ptId, ptId));
  await db.delete(events).where(eq(events.ptId, ptId));

  const [patient] = await db
    .insert(patients)
    .values({ ptId, name: 'Erased One', phone: WA_ID, waId: WA_ID })
    .returning({ id: patients.id });
  patientId = patient.id;

  const [conv] = await db
    .insert(conversations)
    .values({ ptId, patientId, channel: 'whatsapp', lastInboundAt: new Date() })
    .returning({ id: conversations.id });

  await db.insert(messages).values({
    ptId,
    conversationId: conv.id,
    role: 'patient',
    channel: 'whatsapp',
    content: 'hi there',
  });

  const [confirmed] = await db
    .insert(appointments)
    .values({
      ptId,
      patientId,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
      serviceType: 'checkup',
      status: 'confirmed',
    })
    .returning({ id: appointments.id });
  confirmedApptId = confirmed.id;

  const [completed] = await db
    .insert(appointments)
    .values({
      ptId,
      patientId,
      startsAt: new Date(Date.now() - 90_000_000),
      endsAt: new Date(Date.now() - 86_400_000),
      serviceType: 'checkup',
      status: 'completed',
    })
    .returning({ id: appointments.id });
  completedApptId = completed.id;

  await db.insert(reminderJobs).values({
    ptId,
    appointmentId: confirmedApptId,
    scheduledFor: new Date(Date.now() + 43_200_000),
  });

  await db
    .insert(whatsappContacts)
    .values({ ptId, phone: WA_ID, waId: WA_ID });
});

describe('erasePatient', () => {
  it('cascade-deletes all patient data and leaves no orphans', async () => {
    const result = await erasePatient({ patientId, ptId });
    expect(result).toEqual({ erased: true });

    const remaining = await Promise.all([
      db.select().from(patients).where(eq(patients.id, patientId)),
      db
        .select()
        .from(conversations)
        .where(eq(conversations.patientId, patientId)),
      db.select().from(messages).where(eq(messages.ptId, ptId)),
      db
        .select()
        .from(appointments)
        .where(eq(appointments.patientId, patientId)),
      db.select().from(reminderJobs).where(eq(reminderJobs.ptId, ptId)),
      db
        .select()
        .from(whatsappContacts)
        .where(eq(whatsappContacts.waId, WA_ID)),
    ]);
    for (const rows of remaining) expect(rows).toHaveLength(0);
  });

  it('emits appointment.cancelled only for the active appointment', async () => {
    await erasePatient({ patientId, ptId });

    const cancelled = await db
      .select()
      .from(events)
      .where(and(eq(events.ptId, ptId), eq(events.type, 'appointment.cancelled')));
    expect(cancelled).toHaveLength(1);

    const payload = cancelled[0].payload as Record<string, unknown>;
    expect(payload.appointmentId).toBe(confirmedApptId);
    expect(payload.cancelledBy).toBe('pt');
    expect(payload.reason).toBe('patient_erased');

    const allEvents = await db.select().from(events).where(eq(events.ptId, ptId));
    const referencesCompleted = allEvents.some(
      (e) =>
        (e.payload as Record<string, unknown>).appointmentId ===
        completedApptId,
    );
    expect(referencesCompleted).toBe(false);

    expect(tryPublish).toHaveBeenCalledTimes(1);
    expect(tryPublish).toHaveBeenCalledWith(cancelled[0].id);
  });

  it('writes exactly one erasure audit row with a hash and no PII', async () => {
    await erasePatient({ patientId, ptId });

    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.ptId, ptId), eq(auditLog.action, 'erasure')));
    expect(rows).toHaveLength(1);
    expect(rows[0].targetTable).toBe('patients');
    expect(rows[0].targetId).toBe(patientId);

    const metadata = rows[0].metadata as Record<string, unknown>;
    expect(metadata.beforeStateHash).toMatch(/^[0-9a-f]{64}$/);

    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain('Erased One');
    expect(serialized).not.toContain(WA_ID);
  });

  it('is idempotent: a second erase is a no-op', async () => {
    await erasePatient({ patientId, ptId });
    tryPublish.mockClear();

    const second = await erasePatient({ patientId, ptId });
    expect(second).toEqual({ erased: false });
    expect(tryPublish).not.toHaveBeenCalled();

    const auditRows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.ptId, ptId), eq(auditLog.action, 'erasure')));
    expect(auditRows).toHaveLength(1);
  });

  it('does not erase across tenants', async () => {
    const result = await erasePatient({ patientId, ptId: otherPtId });
    expect(result).toEqual({ erased: false });
    expect(tryPublish).not.toHaveBeenCalled();

    const stillThere = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId));
    expect(stillThere).toHaveLength(1);
  });
});
