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
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { syncWhatsappCoexistenceCore } from '../sync-whatsapp-coexistence';

let ptId = '';
let connectionId = '';
let sequence = 0;

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `coex-sync-${Date.now()}@example.com`,
    password: 'coex-sync-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  await db
    .delete(whatsappConnections)
    .where(eq(whatsappConnections.ptId, ptId));

  const [connection] = await db
    .insert(whatsappConnections)
    .values({
      ptId,
      phoneNumberId: `PNI_COEX_SYNC_${Date.now()}_${++sequence}`,
      wabaId: 'WABA_COEX_SYNC',
      accessTokenEncrypted: await encryptToken('COEX_SYNC_TOKEN'),
      status: 'active',
      mode: 'coexistence',
      coexistenceSyncStatus: 'pending',
    })
    .returning({ id: whatsappConnections.id });
  connectionId = connection.id;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

function syncFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes('/smb_app_data')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      sync_type?: string;
    };
    return new Response(
      JSON.stringify({
        messaging_product: 'whatsapp',
        request_id:
          body.sync_type === 'history' ? 'REQ_HISTORY' : 'REQ_CONTACTS',
      }),
      { status: 200 },
    );
  });
}

describe('syncWhatsappCoexistenceCore', () => {
  it('requests contacts and history sync and stores request IDs', async () => {
    const fetchSpy = syncFetch();
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    await expect(
      syncWhatsappCoexistenceCore({ ptId, connectionId }),
    ).resolves.toEqual({
      status: 'syncing',
      contactsRequestId: 'REQ_CONTACTS',
      historyRequestId: 'REQ_HISTORY',
      existing: false,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const bodies = fetchSpy.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body ?? '{}')),
    );
    expect(bodies.map((body) => body.sync_type).sort()).toEqual([
      'history',
      'smb_app_state_sync',
    ]);

    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, connectionId));
    expect(connection.coexistenceSyncStatus).toBe('syncing');
    expect(connection.coexistenceContactsRequestId).toBe('REQ_CONTACTS');
    expect(connection.coexistenceHistoryRequestId).toBe('REQ_HISTORY');
    expect(connection.coexistenceLastError).toBeNull();
  });

  it('does not re-request sync once both request IDs exist', async () => {
    await db
      .update(whatsappConnections)
      .set({
        coexistenceContactsRequestId: 'REQ_CONTACTS_EXISTING',
        coexistenceHistoryRequestId: 'REQ_HISTORY_EXISTING',
      })
      .where(eq(whatsappConnections.id, connectionId));
    const fetchSpy = syncFetch();
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    await expect(
      syncWhatsappCoexistenceCore({ ptId, connectionId }),
    ).resolves.toEqual({
      status: 'syncing',
      contactsRequestId: 'REQ_CONTACTS_EXISTING',
      historyRequestId: 'REQ_HISTORY_EXISTING',
      existing: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips non-coexistence connections', async () => {
    await db
      .update(whatsappConnections)
      .set({ mode: 'cloud_api' })
      .where(eq(whatsappConnections.id, connectionId));

    await expect(
      syncWhatsappCoexistenceCore({ ptId, connectionId }),
    ).resolves.toEqual({ skipped: 'not_coexistence' });
  });
});
