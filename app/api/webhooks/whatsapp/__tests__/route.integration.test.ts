import { createHmac } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  conversations,
  events,
  messages,
  patients,
  whatsappConnections,
  whatsappContacts,
} from '@/lib/db/schema';
import { inngest } from '@/lib/inngest/client';
import { createServiceClient } from '@/lib/supabase/service';
import { GET, POST } from '../route';

const PHONE_NUMBER_ID = `PNI_${Date.now()}`;
const WA_ID = '447700900000';
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN!;
const APP_SECRET = process.env.META_APP_SECRET!;

let ptId = '';
let externalIdCounter = 0;
const nextExternalId = () => `wamid.${Date.now()}-${++externalIdCounter}`;

function sign(body: string): string {
  return (
    'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex')
  );
}

type PayloadOpts = {
  phoneNumberId?: string;
  messageId?: string;
  messageType?: 'text' | 'image';
  text?: string;
};

function buildPayload(opts: PayloadOpts = {}) {
  const type = opts.messageType ?? 'text';
  const msg: Record<string, unknown> = {
    from: WA_ID,
    id: opts.messageId ?? nextExternalId(),
    timestamp: '1700000000',
    type,
  };
  if (type === 'text') {
    msg.text = { body: opts.text ?? 'hello world' };
  }
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: {
                display_phone_number: '15551234567',
                phone_number_id: opts.phoneNumberId ?? PHONE_NUMBER_ID,
              },
              contacts: [{ wa_id: WA_ID, profile: { name: 'Jane' } }],
              messages: [msg],
            },
          },
        ],
      },
    ],
  };
}

function buildHistoryPayload(opts: {
  progress?: number;
  errors?: { code: number; message: string }[];
} = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'history',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15551234567',
                phone_number_id: PHONE_NUMBER_ID,
              },
              history: [
                opts.errors
                  ? { errors: opts.errors }
                  : {
                      metadata: {
                        phase: 1,
                        chunk_order: 1,
                        progress: opts.progress ?? 42,
                      },
                      threads: [
                        {
                          id: WA_ID,
                          messages: [
                            {
                              from: WA_ID,
                              id: nextExternalId(),
                              timestamp: '1700000000',
                              type: 'text',
                              text: { body: 'old message' },
                            },
                          ],
                        },
                      ],
                    },
              ],
            },
          },
        ],
      },
    ],
  };
}

function buildAppStatePayload() {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'smb_app_state_sync',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15551234567',
                phone_number_id: PHONE_NUMBER_ID,
              },
              state_sync: [
                {
                  type: 'contact',
                  action: 'add',
                  contact: {
                    full_name: 'Jane Patient',
                    first_name: 'Jane',
                    phone_number: WA_ID,
                  },
                  metadata: { timestamp: '1700000000' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function buildEchoPayload(messageId = nextExternalId()) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'smb_message_echoes',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15551234567',
                phone_number_id: PHONE_NUMBER_ID,
              },
              message_echoes: [
                {
                  from: '15551234567',
                  to: WA_ID,
                  id: messageId,
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: 'manual app reply' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function buildAccountUpdatePayload() {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'account_update',
            value: {
              phone_number: '15551234567',
              event: 'PARTNER_REMOVED',
            },
          },
        ],
      },
    ],
  };
}

function buildUnsupportedErrorPayload() {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              errors: [
                {
                  code: 131060,
                  title: 'Unsupported request',
                  message: 'Business app coexistence is not supported',
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function makePost(
  payload: object,
  overrides?: { headerOverride?: string | null },
): NextRequest {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (overrides?.headerOverride === undefined) {
    headers['x-hub-signature-256'] = sign(body);
  } else if (overrides.headerOverride !== null) {
    headers['x-hub-signature-256'] = overrides.headerOverride;
  }
  return new Request('http://localhost/api/webhooks/whatsapp', {
    method: 'POST',
    headers,
    body,
  }) as unknown as NextRequest;
}

function makeGet(qs: string): NextRequest {
  return new Request(
    `http://localhost/api/webhooks/whatsapp?${qs}`,
  ) as unknown as NextRequest;
}

beforeAll(async () => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: `webhook-${Date.now()}@example.com`,
    password: 'webhook-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`createUser failed: ${error?.message}`);
  ptId = data.user.id;

  await db.insert(whatsappConnections).values({
    ptId,
    phoneNumberId: PHONE_NUMBER_ID,
    wabaId: 'WABA_ID',
    status: 'active',
  });
});

afterAll(async () => {
  if (ptId) {
    await createServiceClient().auth.admin.deleteUser(ptId);
  }
});

beforeEach(async () => {
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db.delete(whatsappContacts).where(eq(whatsappContacts.ptId, ptId));
  await db.delete(events).where(eq(events.ptId, ptId));
  await db
    .update(whatsappConnections)
    .set({
      status: 'active',
      mode: 'coexistence',
      coexistenceSyncStatus: 'syncing',
      coexistenceLastProgress: null,
      coexistenceLastError: null,
    })
    .where(eq(whatsappConnections.ptId, ptId));
  vi.restoreAllMocks();
});

describe('GET /api/webhooks/whatsapp', () => {
  it('returns the challenge when verify_token matches', async () => {
    const req = makeGet(
      `hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc123`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('abc123');
  });

  it('returns 403 when verify_token does not match', async () => {
    const req = makeGet(
      'hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123',
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/webhooks/whatsapp — signature failures', () => {
  it('rejects a forged signature with 401, no DB writes, no event', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    const res = await POST(
      makePost(buildPayload(), { headerOverride: 'sha256=deadbeef' }),
    );
    expect(res.status).toBe(401);
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.ptId, ptId));
    expect(rows).toHaveLength(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('rejects a missing signature header with 401', async () => {
    const res = await POST(makePost(buildPayload(), { headerOverride: null }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/webhooks/whatsapp — happy path', () => {
  it('persists patient, conversation, and message; emits message.received', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    const externalId = nextExternalId();

    const res = await POST(
      makePost(buildPayload({ messageId: externalId, text: 'first ping' })),
    );
    expect(res.status).toBe(200);

    const ps = await db
      .select()
      .from(patients)
      .where(and(eq(patients.ptId, ptId), eq(patients.waId, WA_ID)));
    expect(ps).toHaveLength(1);
    expect(ps[0].name).toBe('Jane');

    const cs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.ptId, ptId));
    expect(cs).toHaveLength(1);
    expect(cs[0].lastInboundAt).toBeInstanceOf(Date);

    const ms = await db.select().from(messages).where(eq(messages.ptId, ptId));
    expect(ms).toHaveLength(1);
    expect(ms[0].externalId).toBe(externalId);
    expect(ms[0].content).toBe('first ping');
    expect(ms[0].role).toBe('patient');
    expect(ms[0].channel).toBe('whatsapp');

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        name: 'message.received',
        data: { messageId: ms[0].id, ptId, conversationId: cs[0].id },
      }),
    );
  });
});

describe('POST /api/webhooks/whatsapp — idempotency', () => {
  it('produces exactly one message row and one event for duplicate deliveries', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    const payload = buildPayload({ messageId: nextExternalId() });

    const first = await POST(makePost(payload));
    const second = await POST(makePost(payload));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const ms = await db.select().from(messages).where(eq(messages.ptId, ptId));
    expect(ms).toHaveLength(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/webhooks/whatsapp — unknown phone_number_id', () => {
  it('returns 200 with no writes and no event', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    const res = await POST(
      makePost(buildPayload({ phoneNumberId: 'PNI_UNKNOWN_999' })),
    );
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.ptId, ptId));
    expect(rows).toHaveLength(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/whatsapp — non-text message type', () => {
  it('skips non-text messages, returns 200, emits nothing', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    const res = await POST(makePost(buildPayload({ messageType: 'image' })));
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.ptId, ptId));
    expect(rows).toHaveLength(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/whatsapp — conversation bump', () => {
  it('updates last_inbound_at on the existing conversation; no duplicate row', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);

    await POST(makePost(buildPayload({ messageId: nextExternalId() })));
    const cs1 = await db
      .select()
      .from(conversations)
      .where(eq(conversations.ptId, ptId));
    expect(cs1).toHaveLength(1);
    const firstStamp = cs1[0].lastInboundAt!.getTime();

    await new Promise((r) => setTimeout(r, 15));

    await POST(makePost(buildPayload({ messageId: nextExternalId() })));
    const cs2 = await db
      .select()
      .from(conversations)
      .where(eq(conversations.ptId, ptId));
    expect(cs2).toHaveLength(1);
    expect(cs2[0].id).toBe(cs1[0].id);
    expect(cs2[0].lastInboundAt!.getTime()).toBeGreaterThan(firstStamp);
  });
});

describe('POST /api/webhooks/whatsapp — coexistence history', () => {
  it('tracks progress but does not persist historical messages', async () => {
    const res = await POST(makePost(buildHistoryPayload({ progress: 100 })));
    expect(res.status).toBe(200);

    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(connection.coexistenceSyncStatus).toBe('complete');
    expect(connection.coexistenceLastProgress).toBe(100);

    const ms = await db.select().from(messages).where(eq(messages.ptId, ptId));
    expect(ms).toHaveLength(0);
  });

  it('marks history_declined for Meta error 2593109', async () => {
    const res = await POST(
      makePost(
        buildHistoryPayload({
          errors: [
            {
              code: 2593109,
              message: 'History sync is turned off by the business',
            },
          ],
        }),
      ),
    );
    expect(res.status).toBe(200);

    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(connection.coexistenceSyncStatus).toBe('history_declined');
    expect(connection.coexistenceLastError).toContain('History sync is turned off');
  });
});

describe('POST /api/webhooks/whatsapp — smb_app_state_sync', () => {
  it('stores app contacts without creating a conversation', async () => {
    const res = await POST(makePost(buildAppStatePayload()));
    expect(res.status).toBe(200);

    const contacts = await db
      .select()
      .from(whatsappContacts)
      .where(eq(whatsappContacts.ptId, ptId));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      phone: WA_ID,
      waId: WA_ID,
      fullName: 'Jane Patient',
      firstName: 'Jane',
      sourceAction: 'add',
    });

    const cs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.ptId, ptId));
    expect(cs).toHaveLength(0);
  });
});

describe('POST /api/webhooks/whatsapp — smb_message_echoes', () => {
  it('mirrors a Business app reply as a PT message and pauses AI for two hours', async () => {
    await POST(makePost(buildAppStatePayload()));
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    const messageId = nextExternalId();
    const before = Date.now();

    const res = await POST(makePost(buildEchoPayload(messageId)));
    expect(res.status).toBe(200);

    const ps = await db
      .select()
      .from(patients)
      .where(and(eq(patients.ptId, ptId), eq(patients.waId, WA_ID)));
    expect(ps).toHaveLength(1);
    expect(ps[0].name).toBe('Jane Patient');

    const cs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.ptId, ptId));
    expect(cs).toHaveLength(1);
    expect(cs[0].aiActive).toBe(false);
    expect(cs[0].aiPauseReason).toBe('whatsapp_business_app_echo');
    expect(cs[0].aiPausedUntil!.getTime()).toBeGreaterThanOrEqual(
      before + 2 * 60 * 60 * 1000 - 1000,
    );
    expect(cs[0].aiPausedUntil!.getTime()).toBeLessThan(
      before + 2 * 60 * 60 * 1000 + 10_000,
    );

    const ms = await db.select().from(messages).where(eq(messages.ptId, ptId));
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({
      externalId: messageId,
      role: 'pt',
      channel: 'whatsapp',
      content: 'manual app reply',
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'conversation.ai_paused',
        data: expect.objectContaining({
          ptId,
          conversationId: cs[0].id,
          patientId: ps[0].id,
          reason: 'whatsapp_business_app_echo',
        }),
      }),
    );
    const sentNames = sendSpy.mock.calls.flatMap(([event]) =>
      Array.isArray(event) ? event.map((item) => item.name) : [event.name],
    );
    expect(sentNames).not.toContain('message.received');
  });

  it('is idempotent for duplicate message echoes', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    const payload = buildEchoPayload(nextExternalId());

    await POST(makePost(payload));
    await POST(makePost(payload));

    const ms = await db.select().from(messages).where(eq(messages.ptId, ptId));
    expect(ms).toHaveLength(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/webhooks/whatsapp — account_update', () => {
  it('revokes the connection on PARTNER_REMOVED', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);

    const res = await POST(makePost(buildAccountUpdatePayload()));
    expect(res.status).toBe(200);

    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    expect(connection.status).toBe('revoked');
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'wa.connection.revoked',
        data: expect.objectContaining({
          ptId,
          connectionId: connection.id,
          reason: 'partner_removed',
        }),
      }),
    );
  });
});

describe('POST /api/webhooks/whatsapp — unsupported coexistence errors', () => {
  it('acks unsupported error 131060 without writes or events', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    const res = await POST(makePost(buildUnsupportedErrorPayload()));
    expect(res.status).toBe(200);

    const ms = await db.select().from(messages).where(eq(messages.ptId, ptId));
    const evs = await db.select().from(events).where(eq(events.ptId, ptId));
    expect(ms).toHaveLength(0);
    expect(evs).toHaveLength(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
