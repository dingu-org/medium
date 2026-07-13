import { createClient } from '@supabase/supabase-js';
import { and, eq } from 'drizzle-orm';
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
import { auditLog, whatsappConnections } from '@/lib/db/schema';
import { deleteAccount, disconnectWhatsApp, exportPt } from '../actions';

const {
  getUserMock,
  signOutMock,
  deleteUserMock,
  recordArchiveMock,
  detachMock,
  buildPtExportMock,
  redirectMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  signOutMock: vi.fn(async () => ({ error: null })),
  deleteUserMock: vi.fn(async (id: string) => {
    void id;
    return { error: null };
  }),
  recordArchiveMock: vi.fn(
    async (input: { ptId: string; scope: string; [k: string]: unknown }) => {
      void input;
    },
  ),
  detachMock: vi.fn(async (args: { ptId: string }) => {
    void args;
    return { detached: true };
  }),
  buildPtExportMock: vi.fn(async () => ({
    pt: { id: 'stub' },
    patients: [],
    conversations: [],
    messages: [],
    appointments: [],
    services: [],
    availability_rules: [],
    blocked_periods: [],
    whatsapp_connection: { id: 'conn-1', accessTokenEncrypted: 'REDACTED' },
    message_templates: [],
    events: [],
  })),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  // instrumentedAction (lib/actions/instrument.ts) calls unstable_rethrow
  // before logging/rethrowing; mirror its redirect-passthrough contract so
  // the REDIRECT: sentinel from redirectMock above isn't logged as an error.
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
      throw error;
    }
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: getUserMock, signOut: signOutMock },
  }),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    auth: { admin: { deleteUser: deleteUserMock } },
  }),
}));
vi.mock('@/lib/gdpr/archive', () => ({ recordErasureArchive: recordArchiveMock }));
vi.mock('@/lib/channels/whatsapp/client', () => ({
  detachWabaSubscription: detachMock,
}));
vi.mock('@/lib/gdpr/export', () => ({ buildPtExport: buildPtExportMock }));

// A real service client, independent of the `@/lib/supabase/service` mock
// above, purely to seed/clean up a real auth user for these tests.
const realService = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let ptId = '';

beforeAll(async () => {
  const { data, error } = await realService.auth.admin.createUser({
    email: `settings-actions-${Date.now()}@example.com`,
    password: 'settings-actions-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

afterAll(async () => {
  if (ptId) await realService.auth.admin.deleteUser(ptId);
});

beforeEach(async () => {
  await db.delete(auditLog).where(eq(auditLog.ptId, ptId));
  getUserMock.mockResolvedValue({ data: { user: { id: ptId } } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('disconnectWhatsApp', () => {
  it('flips the latest active connection to revoked', async () => {
    const [inserted] = await db
      .insert(whatsappConnections)
      .values({
        ptId,
        phoneNumberId: `pn-disconnect-${Date.now()}`,
        wabaId: 'WABA_DISCONNECT',
        status: 'active',
      })
      .returning({ id: whatsappConnections.id });

    try {
      await disconnectWhatsApp();

      const [row] = await db
        .select({ status: whatsappConnections.status })
        .from(whatsappConnections)
        .where(eq(whatsappConnections.id, inserted.id));
      expect(row.status).toBe('revoked');
    } finally {
      await db
        .delete(whatsappConnections)
        .where(eq(whatsappConnections.id, inserted.id));
    }
  });
});

describe('deleteAccount', () => {
  it('archives the erasure record and best-effort-detaches WhatsApp before deleting the auth user', async () => {
    const order: string[] = [];
    recordArchiveMock.mockImplementationOnce(async (input) => {
      order.push('archive');
      expect(input).toMatchObject({ ptId, scope: 'account' });
    });
    detachMock.mockImplementationOnce(async () => {
      order.push('detach');
      throw new Error('meta detach unavailable');
    });
    deleteUserMock.mockImplementationOnce(async (id: string) => {
      order.push('deleteUser');
      expect(id).toBe(ptId);
      return { error: null };
    });

    await expect(deleteAccount()).rejects.toThrow('REDIRECT:/sign-in');

    expect(order).toEqual(['archive', 'detach', 'deleteUser']);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the delete-account error and never calls deleteUser if the archive write fails', async () => {
    recordArchiveMock.mockImplementationOnce(async () => {
      throw new Error('archive write failed');
    });

    await expect(deleteAccount()).rejects.toThrow(
      'Could not delete account. Please try again.',
    );
    expect(deleteUserMock).not.toHaveBeenCalled();
  });
});

describe('exportPt', () => {
  it('returns the redacted-token export shape and writes an export.pt audit row', async () => {
    const result = await exportPt();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.whatsapp_connection).toMatchObject({
      accessTokenEncrypted: 'REDACTED',
    });

    const [row] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.ptId, ptId), eq(auditLog.action, 'export.pt')));
    expect(row).toBeTruthy();
    expect(row.targetId).toBe(ptId);
    expect(row.targetTable).toBe('pts');
  });
});
