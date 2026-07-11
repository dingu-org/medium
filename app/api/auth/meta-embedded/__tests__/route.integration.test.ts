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
import { and, eq, inArray } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auditLog, whatsappConnections } from '@/lib/db/schema';
import { decryptToken } from '@/lib/db/crypto';
import { inngest } from '@/lib/inngest/client';
import { createServiceClient } from '@/lib/supabase/service';
import { POST } from '../route';

// The route resolves the PT from the Supabase session; mock it to a seeded user.
const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const BIZ_TOKEN = 'BIZ_TOKEN_abc123';

let ptId = '';
let otherPtId = '';
let pniCounter = 0;
const nextPni = () => `PNI_${Date.now()}_${++pniCounter}`;

/** Default Graph mock: code-exchange returns a token, every other call succeeds. */
function okFetch(): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: BIZ_TOKEN }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as unknown as typeof fetch;
}

/** Build a fetch mock that overrides one endpoint's response. */
function fetchWith(match: string, status: number, body: unknown): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes(match))
      return new Response(JSON.stringify(body), { status });
    if (url.includes('/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: BIZ_TOKEN }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as unknown as typeof fetch;
}

function makePost(
  body: object,
  opts?: { origin?: string | null },
): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  const origin = opts && 'origin' in opts ? opts.origin : APP_URL;
  if (origin != null) headers.origin = origin;
  return new Request(`${APP_URL}/api/auth/meta-embedded`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validBody = (
  phoneNumberId: string,
  mode: 'cloud_api' | 'coexistence' = 'coexistence',
) => ({
  code: 'AUTH_CODE_xyz',
  phoneNumberId,
  wabaId: 'WABA_123',
  mode,
});

beforeAll(async () => {
  const supabase = createServiceClient();
  const a = await supabase.auth.admin.createUser({
    email: `embed-${Date.now()}@example.com`,
    password: 'embed-pass-1234',
    email_confirm: true,
  });
  if (a.error || !a.data.user)
    throw new Error(`createUser failed: ${a.error?.message}`);
  ptId = a.data.user.id;

  const b = await supabase.auth.admin.createUser({
    email: `embed-other-${Date.now()}@example.com`,
    password: 'embed-pass-1234',
    email_confirm: true,
  });
  if (b.error || !b.data.user)
    throw new Error(`createUser failed: ${b.error?.message}`);
  otherPtId = b.data.user.id;
});

afterAll(async () => {
  const supabase = createServiceClient();
  if (ptId) await supabase.auth.admin.deleteUser(ptId);
  if (otherPtId) await supabase.auth.admin.deleteUser(otherPtId);
});

beforeEach(async () => {
  await db
    .delete(whatsappConnections)
    .where(inArray(whatsappConnections.ptId, [ptId, otherPtId]));
  await db
    .delete(auditLog)
    .where(inArray(auditLog.ptId, [ptId, otherPtId]));
  getUserMock.mockResolvedValue({ data: { user: { id: ptId } } });
  vi.stubGlobal('fetch', okFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/auth/meta-embedded — auth & CSRF', () => {
  it('rejects a mismatched Origin with 403, no event', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    const res = await POST(
      makePost(validBody(nextPni()), { origin: 'https://evil.example' }),
    );
    expect(res.status).toBe(403);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request with 401', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(makePost(validBody(nextPni())));
    expect(res.status).toBe(401);
  });

  it('rejects a malformed body with 400', async () => {
    const res = await POST(makePost({ code: '' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/meta-embedded — happy path', () => {
  it('persists an encrypted connection and emits wa.connection.created', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    const phoneNumberId = nextPni();
    const fetchSpy = vi.mocked(fetch);

    const res = await POST(makePost(validBody(phoneNumberId)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: 'active' });

    const [row] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(row.phoneNumberId).toBe(phoneNumberId);
    expect(row.wabaId).toBe('WABA_123');
    expect(row.mode).toBe('coexistence');
    expect(row.coexistenceSyncStatus).toBe('pending');
    expect(row.coexistenceSyncDeadlineAt).toBeInstanceOf(Date);
    expect(row.status).toBe('active');
    expect(row.connectedAt).toBeInstanceOf(Date);
    expect(row.accessTokenEncrypted).toBeInstanceOf(Buffer);
    expect(await decryptToken(row.accessTokenEncrypted!)).toBe(BIZ_TOKEN);
    expect(
      fetchSpy.mock.calls.some(([input]) => String(input).includes('/register')),
    ).toBe(false);

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        name: 'wa.connection.created',
        data: {
          ptId,
          connectionId: row.id,
          phoneNumberId,
          wabaId: 'WABA_123',
          mode: 'coexistence',
          traceId: expect.any(String),
        },
      }),
    );
    expect(row.tokenExpiresAt).not.toBeNull();

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.ptId, ptId), eq(auditLog.action, 'wa.token.issued')),
      );
    expect(audit).toBeTruthy();
    expect(audit.targetTable).toBe('whatsapp_connections');
    expect(audit.metadata).toEqual({
      phone_number_id: phoneNumberId,
      waba_id: 'WABA_123',
    });
    expect(JSON.stringify(audit).includes(BIZ_TOKEN)).toBe(false);
  });

  it('resolves the phone number from the WABA when coexistence only returns waba_id', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    const phoneNumberId = nextPni();
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: BIZ_TOKEN }), {
          status: 200,
        });
      }
      if (url.includes('/WABA_123/phone_numbers')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: phoneNumberId,
                display_phone_number: '+15551234567',
                platform_type: 'CLOUD_API',
                is_on_biz_app: true,
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const res = await POST(
      makePost({ code: 'AUTH_CODE_xyz', wabaId: 'WABA_123' }),
    );
    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(row.phoneNumberId).toBe(phoneNumberId);
    expect(row.mode).toBe('coexistence');
    expect(
      fetchSpy.mock.calls.some(([input]) => String(input).includes('/register')),
    ).toBe(false);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'wa.connection.created',
        data: expect.objectContaining({
          phoneNumberId,
          mode: 'coexistence',
        }),
      }),
    );
  });

  it('reconnect by the same PT updates the existing row, no duplicate', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const phoneNumberId = nextPni();

    await POST(makePost(validBody(phoneNumberId)));
    const res2 = await POST(makePost(validBody(phoneNumberId)));
    expect(res2.status).toBe(200);

    const rows = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(rows).toHaveLength(1);
  });

  it('still saves the connection when phone register fails (best-effort)', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    vi.stubGlobal(
      'fetch',
      fetchWith('/register', 500, { error: { message: 'nope' } }),
    );
    const phoneNumberId = nextPni();

    const res = await POST(makePost(validBody(phoneNumberId, 'cloud_api')));
    expect(res.status).toBe(200);
    const rows = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(rows).toHaveLength(1);
    expect(rows[0].mode).toBe('cloud_api');
    expect(rows[0].coexistenceSyncStatus).toBe('not_applicable');
  });
});

describe('POST /api/auth/meta-embedded — failures', () => {
  it('returns 400 token_exchange_failed when no token comes back', async () => {
    vi.stubGlobal('fetch', fetchWith('/oauth/access_token', 200, {}));
    const res = await POST(makePost(validBody(nextPni())));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'token_exchange_failed',
    });
  });

  it('returns 502 graph_error when app subscription fails', async () => {
    vi.stubGlobal(
      'fetch',
      fetchWith('/subscribed_apps', 500, { error: { message: 'boom' } }),
    );
    const res = await POST(makePost(validBody(nextPni())));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'graph_error' });
  });

  it('returns 409 duplicate_number when another PT owns the number', async () => {
    const phoneNumberId = nextPni();
    await db.insert(whatsappConnections).values({
      ptId: otherPtId,
      phoneNumberId,
      wabaId: 'WABA_OTHER',
      status: 'active',
    });
    const res = await POST(makePost(validBody(phoneNumberId)));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'duplicate_number' });
  });
});
