import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { POST } from '../route';

// The route resolves the PT from the Supabase session; mock it to a seeded user.
const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const ATTEMPT_ID = '2f6f4c5e-9a53-4b5e-8a0b-6f1d4c1f0a77';

let accountId = '';

function makePost(
  body: unknown,
  opts?: { origin?: string | null },
): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  const origin = opts && 'origin' in opts ? opts.origin : APP_URL;
  if (origin != null) headers.origin = origin;
  return new Request(`${APP_URL}/api/auth/meta-embedded/diagnostics`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const trail = () =>
  db.select().from(auditLog).where(eq(auditLog.accountId, accountId));

beforeAll(async () => {
  const supabase = createServiceClient();
  const a = await supabase.auth.admin.createUser({
    email: `embed-diag-${Date.now()}@example.com`,
    password: 'embed-pass-1234',
    email_confirm: true,
  });
  if (a.error || !a.data.user)
    throw new Error(`createUser failed: ${a.error?.message}`);
  accountId = a.data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  await db.delete(auditLog).where(eq(auditLog.accountId, accountId));
  getUserMock.mockResolvedValue({ data: { user: { id: accountId } } });
});

describe('POST /api/auth/meta-embedded/diagnostics — auth & CSRF', () => {
  it('rejects a mismatched Origin with 403 and writes nothing', async () => {
    const res = await POST(
      makePost(
        { attemptId: ATTEMPT_ID, outcome: 'started' },
        { origin: 'https://evil.example' },
      ),
    );
    expect(res.status).toBe(403);
    expect(await trail()).toHaveLength(0);
  });

  it('rejects an unauthenticated request with 401', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      makePost({ attemptId: ATTEMPT_ID, outcome: 'started' }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects an unknown outcome with 400', async () => {
    const res = await POST(
      makePost({ attemptId: ATTEMPT_ID, outcome: 'whatever' }),
    );
    expect(res.status).toBe(400);
    expect(await trail()).toHaveLength(0);
  });

  it('rejects fields the schema does not name, so no id or code can ride along', async () => {
    const res = await POST(
      makePost({
        attemptId: ATTEMPT_ID,
        outcome: 'no_code',
        code: 'AUTH_CODE_xyz',
      }),
    );
    expect(res.status).toBe(400);
    expect(await trail()).toHaveLength(0);
  });
});

describe('POST /api/auth/meta-embedded/diagnostics — trail', () => {
  it('stores the attempt outcome as a wa.signup.client_outcome audit row', async () => {
    const res = await POST(
      makePost({
        attemptId: ATTEMPT_ID,
        outcome: 'no_finish_message',
        loginStatus: 'unknown',
        hasCode: true,
        elapsedMs: 42_000,
        displayMode: 'browser',
        messages: [
          {
            origin: 'https://www.facebook.com',
            originAccepted: true,
            type: 'WA_EMBEDDED_SIGNUP',
            event: 'CANCEL',
            hasNumberId: false,
            hasWabaId: false,
            currentStep: 'PHONE_NUMBER_SETUP',
            sessionId: 'SESSION_1',
          },
        ],
      }),
    );
    expect(res.status).toBe(204);

    const rows = await trail();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: 'account',
      action: 'wa.signup.client_outcome',
      targetTable: 'whatsapp_connections',
    });
    expect(rows[0].metadata).toMatchObject({
      attemptId: ATTEMPT_ID,
      outcome: 'no_finish_message',
      hasCode: true,
      messages: [
        {
          event: 'CANCEL',
          currentStep: 'PHONE_NUMBER_SETUP',
          sessionId: 'SESSION_1',
        },
      ],
    });
  });

  it("scrubs a phone number out of Meta's free-text error before storing it", async () => {
    await POST(
      makePost({
        attemptId: ATTEMPT_ID,
        outcome: 'threw',
        errorName: 'Error',
        errorMessage: 'number +355691234567 is not eligible',
      }),
    );
    const [row] = await trail();
    expect(JSON.stringify(row.metadata)).not.toContain('355691234567');
    expect(row.metadata).toMatchObject({ errorName: 'Error' });
  });
});
