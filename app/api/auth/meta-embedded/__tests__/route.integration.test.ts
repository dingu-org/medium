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
import {
  META_SIGNUP_ORIGINS,
  postableMode,
  readSignupMessage,
} from '@/app/(dashboard)/settings/whatsapp-signup';
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

  it('rejects a body with no mode with 400 (no coexistence default)', async () => {
    // The mode is derived from the popup's finish event. An absent mode means
    // the caller never knew how the PT onboarded, so it must not be assumed —
    // filing a Cloud API signup as coexistence starts a 24h sync deadline that
    // nothing can satisfy.
    const res = await POST(
      makePost({
        code: 'AUTH_CODE_xyz',
        phoneNumberId: nextPni(),
        wabaId: 'WABA_123',
      }),
    );
    expect(res.status).toBe(400);
    const rows = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(rows).toHaveLength(0);
  });
});

/**
 * One case per Embedded Signup v4 finish event. Each drives the *real* client
 * handler (`readSignupMessage` → `postableMode`) with the popup message Meta
 * would post, then POSTs exactly what the client would POST — so the chain
 * event → mode → persisted row is asserted end to end rather than assumed.
 *
 * Events the client refuses never reach the route; those cases assert the
 * refusal and then that a forged POST of the same shape is still rejected.
 */
const FINISH_EVENTS = [
  {
    event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
    carriesNumber: false,
    persisted: { mode: 'coexistence', coexistenceSyncStatus: 'pending' },
  },
  {
    event: 'FINISH',
    carriesNumber: true,
    persisted: { mode: 'cloud_api', coexistenceSyncStatus: 'not_applicable' },
  },
  // Shares a WABA but no number — Medium cannot message anyone with it, and the
  // route rejects a numberless cloud_api signup outright.
  { event: 'FINISH_ONLY_WABA', carriesNumber: false, persisted: null },
  // Outcomes we have no onboarding for: refused rather than guessed at.
  { event: 'FINISH_OBO_MIGRATION', carriesNumber: true, persisted: null },
  {
    event: 'FINISH_GRANT_ONLY_API_ACCESS',
    carriesNumber: true,
    persisted: null,
  },
] as const;

describe('POST /api/auth/meta-embedded — mode per finish event', () => {
  it.each(FINISH_EVENTS)(
    '$event',
    async ({ event, carriesNumber, persisted }) => {
      vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
      const phoneNumberId = nextPni();
      // Coexistence arrives with only a waba_id; the route resolves the number.
      vi.stubGlobal(
        'fetch',
        fetchWith('/WABA_123/phone_numbers', 200, {
          data: [
            {
              id: phoneNumberId,
              display_phone_number: '+355691234567',
              platform_type: 'CLOUD_API',
              is_on_biz_app: true,
            },
          ],
        }),
      );

      const session = readSignupMessage({
        origin: META_SIGNUP_ORIGINS[0],
        data: JSON.stringify({
          type: 'WA_EMBEDDED_SIGNUP',
          event,
          data: {
            waba_id: 'WABA_123',
            ...(carriesNumber ? { phone_number_id: phoneNumberId } : {}),
          },
        }),
      });
      expect(session?.event).toBe(event);
      const mode = postableMode(session!);

      const res = await POST(
        makePost({
          code: 'AUTH_CODE_xyz',
          ...(carriesNumber ? { phoneNumberId } : {}),
          wabaId: 'WABA_123',
          ...(mode ? { mode } : {}),
        }),
      );
      const rows = await db
        .select()
        .from(whatsappConnections)
        .where(eq(whatsappConnections.ptId, ptId));

      if (!persisted) {
        expect(mode).toBeNull();
        expect(res.status).toBe(400);
        expect(rows).toHaveLength(0);
        return;
      }

      expect(mode).toBe(persisted.mode);
      expect(res.status).toBe(200);
      expect(rows).toHaveLength(1);
      expect(rows[0].phoneNumberId).toBe(phoneNumberId);
      expect(rows[0].mode).toBe(persisted.mode);
      expect(rows[0].coexistenceSyncStatus).toBe(
        persisted.coexistenceSyncStatus,
      );
      expect(rows[0].coexistenceSyncDeadlineAt == null).toBe(
        persisted.mode !== 'coexistence',
      );
    },
  );

  it('refuses a forged FINISH_ONLY_WABA POST that claims coexistence', async () => {
    // Defence in depth: the client will not send this, but if it did the route
    // must not invent a number. The WABA has no usable number to resolve.
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    vi.stubGlobal('fetch', fetchWith('/WABA_123/phone_numbers', 200, { data: [] }));

    const res = await POST(
      makePost({
        code: 'AUTH_CODE_xyz',
        wabaId: 'WABA_123',
        mode: 'coexistence',
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'rejected' });
    const rows = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(rows).toHaveLength(0);
  });

  it('refuses a forged FINISH_ONLY_WABA POST that claims cloud_api', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const res = await POST(
      makePost({
        code: 'AUTH_CODE_xyz',
        wabaId: 'WABA_123',
        mode: 'cloud_api',
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'rejected' });
    const rows = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(rows).toHaveLength(0);
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
    expect(row.displayPhoneNumber).toBeNull();
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

    // No phoneNumberId: the coexistence payload Meta documents carries only
    // waba_id. `mode` is explicit — the schema no longer defaults it.
    const res = await POST(
      makePost({
        code: 'AUTH_CODE_xyz',
        wabaId: 'WABA_123',
        mode: 'coexistence',
      }),
    );
    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(row.phoneNumberId).toBe(phoneNumberId);
    expect(row.mode).toBe('coexistence');
    expect(row.displayPhoneNumber).toBe('+15551234567');
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

  it('captures display_phone_number via the dedicated fetch when the id is provided', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const phoneNumberId = nextPni();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/oauth/access_token')) {
          return new Response(JSON.stringify({ access_token: BIZ_TOKEN }), {
            status: 200,
          });
        }
        if (url.includes('fields=display_phone_number')) {
          return new Response(
            JSON.stringify({
              display_phone_number: '+15559998888',
              verified_name: 'Fizio Vita',
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }) as unknown as typeof fetch,
    );

    const res = await POST(makePost(validBody(phoneNumberId, 'cloud_api')));
    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(row.displayPhoneNumber).toBe('+15559998888');
  });

  it('still persists when the display-number fetch fails (best-effort)', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    vi.stubGlobal(
      'fetch',
      fetchWith('fields=display_phone_number', 500, {
        error: { message: 'nope' },
      }),
    );

    const res = await POST(makePost(validBody(nextPni(), 'cloud_api')));
    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(row.displayPhoneNumber).toBeNull();
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
