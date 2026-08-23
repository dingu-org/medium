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
import { auditLog, customers } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import {
  createManualClient,
  eraseCustomer,
  exportCustomer,
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

let accountId = '';
let phoneCounter = 0;
const nextPhone = () => `35569${(1000000 + ++phoneCounter).toString().slice(-7)}`;

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `clients-actions-${Date.now()}@example.com`,
    password: 'clients-actions-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
  authState.userId = accountId;
});

beforeEach(async () => {
  await db.delete(customers).where(eq(customers.accountId, accountId));
  await db.delete(auditLog).where(eq(auditLog.accountId, accountId));
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('createManualClient', () => {
  it('writes a customer.created audit row', async () => {
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
        and(eq(auditLog.accountId, accountId), eq(auditLog.action, 'customer.created')),
      );
    expect(row).toBeTruthy();
    expect(row.targetTable).toBe('customers');
    expect(row.targetId).toBe(result.clientId);
  });
});

describe('updateClientNotes', () => {
  it('writes a customer.notes_updated audit row', async () => {
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
          eq(auditLog.accountId, accountId),
          eq(auditLog.action, 'customer.notes_updated'),
        ),
      );
    expect(row).toBeTruthy();
    expect(row.targetId).toBe(created.clientId);
  });
});

describe('eraseCustomer', () => {
  it('removes the customer and writes the erasure audit (delegates to lib/customers/erase)', async () => {
    const created = await createManualClient({
      name: 'Dea Client',
      phone: nextPhone(),
    });
    if (!created.ok) throw new Error('setup failed');
    const clientId = created.clientId!;

    const result = await eraseCustomer(clientId);
    expect(result).toEqual({ ok: true });

    const [remaining] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, clientId));
    expect(remaining).toBeUndefined();

    const [row] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.accountId, accountId),
          eq(auditLog.action, 'erasure'),
          eq(auditLog.targetId, clientId),
        ),
      );
    expect(row).toBeTruthy();
  });
});

describe('exportCustomer', () => {
  it('returns the DSAR JSON shape and writes an export.customer audit row', async () => {
    const created = await createManualClient({
      name: 'Elsa Client',
      phone: nextPhone(),
    });
    if (!created.ok) throw new Error('setup failed');
    const clientId = created.clientId!;

    const result = await exportCustomer(clientId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.customer).toBeTruthy();
    expect(Array.isArray(result.data.conversations)).toBe(true);
    expect(Array.isArray(result.data.messages)).toBe(true);
    expect(Array.isArray(result.data.appointments)).toBe(true);
    expect(Array.isArray(result.data.audit_log_entries_for_customer)).toBe(
      true,
    );

    const [row] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.accountId, accountId),
          eq(auditLog.action, 'export.customer'),
          eq(auditLog.targetId, clientId),
        ),
      );
    expect(row).toBeTruthy();
  });

  it('returns ok:false for a customer id not owned by this PT', async () => {
    const result = await exportCustomer(randomUUID());
    expect(result).toEqual({ ok: false });
  });
});
