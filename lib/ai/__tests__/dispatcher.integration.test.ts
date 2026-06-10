import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { auditLog, conversations, patients } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { dispatchTool } from '../dispatcher';

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
  await db.delete(auditLog).where(eq(auditLog.ptId, ptId));
  await db
    .update(conversations)
    .set({ aiActive: true, escalationState: 'idle' })
    .where(eq(conversations.id, conversationId));
});

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

  it('returns a canned availability result and writes an audit row', async () => {
    const result = await dispatchTool(
      'get_availability',
      {
        start: '2026-06-11T09:00:00+02:00',
        end: '2026-06-14T17:00:00+02:00',
      },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ stub: true });
    }
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.ptId, ptId));
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('ai.tool.get_availability');
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
