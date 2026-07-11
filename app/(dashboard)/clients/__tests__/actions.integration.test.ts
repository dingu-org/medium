import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { db } from '@/lib/db';
import { auditLog, patients } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import {
  createManualClient,
  erasePatient,
  exportPatient,
  updateClientNotes,
} from '../actions';

const authState = vi.hoisted(() => ({ userId: '' }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: authState.userId } } }),
    },
  }),
}));

let ptId = '';
let phoneCounter = 0;
const nextPhone = () => `35569${(1000000 + ++phoneCounter).toString().slice(-7)}`;

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `clients-actions-${Date.now()}@example.com`,
    password: 'clients-actions-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
  authState.userId = ptId;
});

beforeEach(async () => {
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db.delete(auditLog).where(eq(auditLog.ptId, ptId));
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('createManualClient', () => {
  it('writes a patient.created audit row', async () => {
    const result = await createManualClient({
      name: 'Ana Client',
      phone: nextPhone(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.ptId, ptId), eq(auditLog.action, 'patient.created')),
      );
    expect(row).toBeTruthy();
    expect(row.targetTable).toBe('patients');
    expect(row.targetId).toBe(result.clientId);
  });
});

describe('updateClientNotes', () => {
  it('writes a patient.notes_updated audit row', async () => {
    const created = await createManualClient({
      name: 'Bora Client',
      phone: nextPhone(),
    });
    if (!created.ok) throw new Error('setup failed');

    const result = await updateClientNotes(created.clientId!, 'private note');
    expect(result.ok).toBe(true);

    const [row] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.ptId, ptId),
          eq(auditLog.action, 'patient.notes_updated'),
        ),
      );
    expect(row).toBeTruthy();
    expect(row.targetId).toBe(created.clientId);
  });
});

describe('erasePatient', () => {
  it('removes the patient and writes the erasure audit (delegates to lib/patients/erase)', async () => {
    const created = await createManualClient({
      name: 'Dea Client',
      phone: nextPhone(),
    });
    if (!created.ok) throw new Error('setup failed');
    const clientId = created.clientId!;

    const result = await erasePatient(clientId);
    expect(result).toEqual({ ok: true });

    const [remaining] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, clientId));
    expect(remaining).toBeUndefined();

    const [row] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.ptId, ptId),
          eq(auditLog.action, 'erasure'),
          eq(auditLog.targetId, clientId),
        ),
      );
    expect(row).toBeTruthy();
  });
});

describe('exportPatient', () => {
  it('returns the DSAR JSON shape and writes an export.patient audit row', async () => {
    const created = await createManualClient({
      name: 'Elsa Client',
      phone: nextPhone(),
    });
    if (!created.ok) throw new Error('setup failed');
    const clientId = created.clientId!;

    const result = await exportPatient(clientId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.patient).toBeTruthy();
    expect(Array.isArray(result.data.conversations)).toBe(true);
    expect(Array.isArray(result.data.messages)).toBe(true);
    expect(Array.isArray(result.data.appointments)).toBe(true);
    expect(Array.isArray(result.data.audit_log_entries_for_patient)).toBe(
      true,
    );

    const [row] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.ptId, ptId),
          eq(auditLog.action, 'export.patient'),
          eq(auditLog.targetId, clientId),
        ),
      );
    expect(row).toBeTruthy();
  });

  it('returns ok:false for a patient id not owned by this PT', async () => {
    const result = await exportPatient(randomUUID());
    expect(result).toEqual({ ok: false });
  });
});
