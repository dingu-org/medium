import { eq } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  availabilityRules,
  conversations,
  events,
  patients,
  pts,
} from '@/lib/db/schema';
import { inngest } from '@/lib/inngest/client';
import { createServiceClient } from '@/lib/supabase/service';
import { dispatchTool } from '../dispatcher';
import { DAY, testNow, zonedTime } from '@/tests/support/clock';

// The only availability rule seeded below is Monday 09:00–12:00 local, so every
// fixture here hangs off a real Monday — derived, and a week out so the bookings
// are genuinely upcoming (a past fixture made the "upcoming" assertion vacuous).
const MONDAY = new Date(testNow({ weekday: 1 }).getTime() + 7 * DAY);
const mondayAt = (hour: number) => zonedTime(MONDAY, hour);

let ptId = '';
let patientId = '';
let conversationId = '';

beforeAll(async () => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: `dispatcher-${Date.now()}@example.com`,
    password: 'dispatcher-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`createUser failed: ${error?.message}`);
  ptId = data.user.id;

  const [patient] = await db
    .insert(patients)
    .values({ ptId, name: 'Pat', phone: '+355690000001' })
    .returning({ id: patients.id });
  patientId = patient.id;

  const [conversation] = await db
    .insert(conversations)
    .values({ ptId, patientId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;
});

beforeEach(async () => {
  await db.delete(appointments).where(eq(appointments.ptId, ptId));
  await db.delete(events).where(eq(events.ptId, ptId));
  await db.delete(availabilityRules).where(eq(availabilityRules.ptId, ptId));
  await db.delete(auditLog).where(eq(auditLog.ptId, ptId));
  await db
    .update(pts)
    .set({ timezone: 'Europe/Tirane' })
    .where(eq(pts.id, ptId));
  await db.insert(availabilityRules).values({
    ptId,
    weekday: 1,
    startTime: '09:00:00',
    endTime: '12:00:00',
  });
  await db
    .update(conversations)
    .set({ aiActive: true, escalationState: 'idle' })
    .where(eq(conversations.id, conversationId));
  vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('dispatchTool', () => {
  const ctx = () => ({ ptId, patientId, conversationId });

  it('returns a structured validation error without auditing or throwing', async () => {
    const result = await dispatchTool(
      'book_appointment',
      { starts_at: 'not-a-date', service_type: '' },
      ctx(),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalid_input', retryable: true },
    });
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.ptId, ptId));
    expect(rows).toHaveLength(0);
  });

  it('returns real availability and writes an audit row', async () => {
    const result = await dispatchTool(
      'get_availability',
      {
        start: mondayAt(9).toISOString(),
        end: mondayAt(12).toISOString(),
      },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        timezone: 'Europe/Tirane',
        slots: [
          {
            starts_at: mondayAt(9).toISOString(),
            ends_at: mondayAt(10).toISOString(),
          },
          {
            starts_at: mondayAt(10).toISOString(),
            ends_at: mondayAt(11).toISOString(),
          },
          {
            starts_at: mondayAt(11).toISOString(),
            ends_at: mondayAt(12).toISOString(),
          },
        ],
      });
    }
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.ptId, ptId));
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('ai.tool.get_availability');
  });

  it('books a real appointment using only engine-context tenant IDs', async () => {
    const result = await dispatchTool(
      'book_appointment',
      {
        starts_at: mondayAt(9).toISOString(),
        service_type: 'Vlerësim i parë',
      },
      ctx(),
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        status: 'pending',
        starts_at: mondayAt(9).toISOString(),
      },
    });

    const [stored] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.ptId, ptId));
    expect(stored.patientId).toBe(patientId);
    expect(stored.serviceType).toBe('Vlerësim i parë');
  });

  it('rejects service names that are not active for the practice', async () => {
    const result = await dispatchTool(
      'book_appointment',
      {
        starts_at: mondayAt(9).toISOString(),
        service_type: 'Shërbim i shpikur',
      },
      ctx(),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalid_input', retryable: true },
    });
  });

  it("does not expose or cancel another patient's appointment", async () => {
    const [otherPatient] = await db
      .insert(patients)
      .values({
        ptId,
        name: 'Other',
        phone: `+355699${Date.now()}`,
      })
      .returning({ id: patients.id });
    const [otherAppointment] = await db
      .insert(appointments)
      .values({
        ptId,
        patientId: otherPatient.id,
        startsAt: mondayAt(11),
        endsAt: mondayAt(12),
        status: 'pending',
      })
      .returning({ id: appointments.id });

    const listed = await dispatchTool('list_upcoming_appointments', {}, ctx());
    expect(listed).toEqual({
      ok: true,
      data: { appointments: [] },
    });

    const cancelled = await dispatchTool(
      'cancel_appointment',
      { appointment_id: otherAppointment.id },
      ctx(),
    );
    expect(cancelled).toMatchObject({
      ok: false,
      error: { code: 'not_found', retryable: false },
    });
  });

  it('performs a real conversation escalation and audits it', async () => {
    const result = await dispatchTool(
      'escalate_to_human',
      { reason: 'Patient requested a person' },
      ctx(),
    );
    expect(result).toEqual({ ok: true, data: { ok: true } });

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conversation.aiActive).toBe(false);
    expect(conversation.escalationState).toBe('requested');

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.ptId, ptId));
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('ai.tool.escalate_to_human');
  });
});
