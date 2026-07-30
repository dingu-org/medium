import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  conversationDays,
  conversations,
  erasureArchive,
  events,
  messages,
  patients,
  pts,
  reminderJobs,
  whatsappContacts,
} from '@/lib/db/schema';
import {
  conversationDayKeys,
  getConversationUsage,
} from '@/lib/billing/usage';
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
let conversationId = '';
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
  if (ptId) await db.delete(erasureArchive).where(eq(erasureArchive.ptId, ptId));
  if (ptId) await sb.auth.admin.deleteUser(ptId);
  if (otherPtId) await sb.auth.admin.deleteUser(otherPtId);
});

beforeEach(async () => {
  tryPublish.mockClear();
  await db.delete(auditLog).where(eq(auditLog.ptId, ptId));
  // erasure_archive has no FK to pts, so it survives every other cleanup.
  await db.delete(erasureArchive).where(eq(erasureArchive.ptId, ptId));
  // conversation_days outlives the patient by design (SET NULL), so it needs its
  // own cleanup — deleting patients no longer takes it with them.
  await db.delete(conversationDays).where(eq(conversationDays.ptId, ptId));
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
  conversationId = conv.id;

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

  it('deletes the synced contact of a manually added patient (wa_id NULL)', async () => {
    const [manual] = await db
      .insert(patients)
      .values({ ptId, name: 'Ana Hoxha', phone: '+355 69 123 4567' })
      .returning({ id: patients.id });
    await db
      .insert(whatsappContacts)
      .values({ ptId, phone: '355691234567', fullName: 'Ana Hoxha' });

    const result = await erasePatient({ patientId: manual.id, ptId });
    expect(result).toEqual({ erased: true });

    // Only the other patient's contact (matched on wa_id) is left standing.
    const remaining = await db
      .select({ phone: whatsappContacts.phone })
      .from(whatsappContacts)
      .where(eq(whatsappContacts.ptId, ptId));
    expect(remaining.map((r) => r.phone)).toEqual([WA_ID]);
  });

  it('keeps the metered conversation day counting after erasure', async () => {
    const [pt] = await db
      .select({ timezone: pts.timezone })
      .from(pts)
      .where(eq(pts.id, ptId))
      .limit(1);
    const now = new Date();
    const { localDay, monthKey } = conversationDayKeys(now, pt.timezone);
    await db.insert(conversationDays).values({
      ptId,
      patientId,
      conversationId,
      localDay,
      monthKey,
      firstMessageId: crypto.randomUUID(),
    });

    const before = await getConversationUsage(ptId, now);
    expect(before.used).toBe(1);

    expect(await erasePatient({ patientId, ptId })).toEqual({ erased: true });

    // Personal data is gone (patient row + its conversation)...
    expect(
      await db.select().from(patients).where(eq(patients.id, patientId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId)),
    ).toHaveLength(0);

    // ...but the billing fact survives, anonymised by ON DELETE SET NULL.
    const days = await db
      .select()
      .from(conversationDays)
      .where(eq(conversationDays.ptId, ptId));
    expect(days).toHaveLength(1);
    expect(days[0].patientId).toBeNull();
    expect(days[0].conversationId).toBeNull();
    expect(days[0].localDay).toBe(localDay);
    expect(days[0].monthKey).toBe(monthKey);

    // ...and still counts, so erasing clients can't win back free-plan quota.
    const after = await getConversationUsage(ptId, now);
    expect(after.used).toBe(before.used);
    expect(after.monthKey).toBe(monthKey);
  });

  it('archives a durable per-patient erasure proof outside audit_log', async () => {
    await erasePatient({ patientId, ptId });

    const rows = await db
      .select()
      .from(erasureArchive)
      .where(eq(erasureArchive.ptId, ptId));
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('patient');
    expect(rows[0].targetId).toBe(patientId);
    expect(rows[0].beforeStateHash).toMatch(/^[0-9a-f]{64}$/);

    const metadata = rows[0].metadata as Record<string, unknown>;
    expect(typeof metadata.erasedAt).toBe('string');
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain('Erased One');
    expect(serialized).not.toContain(WA_ID);

    // The missing-patient no-op archives nothing.
    await erasePatient({ patientId, ptId });
    const after = await db
      .select()
      .from(erasureArchive)
      .where(eq(erasureArchive.ptId, ptId));
    expect(after).toHaveLength(1);
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
