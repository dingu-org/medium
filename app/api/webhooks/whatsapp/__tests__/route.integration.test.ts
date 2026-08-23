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
  appointments,
  conversations,
  events,
  messages,
  customers,
  reminderDeliveries,
  reminderJobs,
  waMessageStatuses,
  whatsappConnections,
  whatsappContacts,
} from '@/lib/db/schema';
import { inngest } from '@/lib/inngest/client';
import { getChatListSnapshot } from '@/lib/pwa/read-models';
import { createServiceClient } from '@/lib/supabase/service';
import { GET, POST } from '../route';
import { DAY, testNowUtc } from '@/tests/support/clock';

const PHONE_NUMBER_ID = `PNI_${Date.now()}`;
const WA_ID = '447700900000';
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN!;
const APP_SECRET = process.env.META_APP_SECRET!;

let accountId = '';
let externalIdCounter = 0;
const nextExternalId = () => `wamid.${Date.now()}-${++externalIdCounter}`;

// Two reminder cycles on one appointment: the second delivery must land after
// the first, and that ordering is the whole point — the calendar dates never
// were. Derived, and on a whole second because Meta reports Unix seconds.
const SECOND_DELIVERY = testNowUtc();
const SECOND_DELIVERY_TS = String(Math.floor(SECOND_DELIVERY.getTime() / 1000));
const FIRST_DELIVERY = new Date(SECOND_DELIVERY.getTime() - DAY);

function sign(body: string): string {
  return (
    'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex')
  );
}

type PayloadOpts = {
  phoneNumberId?: string;
  messageId?: string;
  /** Meta's open-ended inbound `type` (text, image, reaction, system, …). */
  messageType?: string;
  /** Epoch-seconds string, as Meta sends it. */
  timestamp?: string;
  text?: string;
  /** Caption on a media message — WhatsApp never puts it in `text`. */
  caption?: string;
};

/** Epoch seconds, for an inbound that Meta is delivering right now. */
const nowSeconds = () => String(Math.floor(Date.now() / 1000));

function buildPayload(opts: PayloadOpts = {}) {
  const type = opts.messageType ?? 'text';
  const msg: Record<string, unknown> = {
    from: WA_ID,
    id: opts.messageId ?? nextExternalId(),
    timestamp: opts.timestamp ?? '1700000000',
    type,
  };
  if (type === 'text') {
    msg.text = { body: opts.text ?? 'hello world' };
  }
  if (opts.caption) {
    msg[type] = { id: 'MEDIA_ID', caption: opts.caption };
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

function buildHistoryPayload(
  opts: {
    progress?: number;
    errors?: { code: number; message: string }[];
  } = {},
) {
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
                    full_name: 'Jane Customer',
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

/** A contact-sync change with arbitrary contacts, optionally followed by a
 *  `messages` change in the same entry (batch-isolation coverage). */
function buildContactSyncPayload(
  contacts: {
    phone_number: string;
    wa_id?: string;
    full_name?: string;
    first_name?: string;
  }[],
  opts: { withMessageId?: string } = {},
) {
  const changes: unknown[] = [
    {
      field: 'smb_app_state_sync',
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '15551234567',
          phone_number_id: PHONE_NUMBER_ID,
        },
        state_sync: contacts.map((contact) => ({
          type: 'contact',
          action: 'add',
          contact,
          metadata: { timestamp: '1700000000' },
        })),
      },
    },
  ];
  if (opts.withMessageId) {
    changes.push(
      buildPayload({ messageId: opts.withMessageId }).entry[0].changes[0],
    );
  }
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA_ID', changes }],
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

function buildAccountUpdatePayload(
  event = 'PARTNER_REMOVED',
  phoneNumber = '15551234567',
) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'account_update',
            value: {
              phone_number: phoneNumber,
              event,
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
  accountId = data.user.id;

  await db.insert(whatsappConnections).values({
    accountId,
    phoneNumberId: PHONE_NUMBER_ID,
    displayPhoneNumber: '15551234567',
    wabaId: 'WABA_ID',
    status: 'active',
  });
});

afterAll(async () => {
  if (accountId) {
    await createServiceClient().auth.admin.deleteUser(accountId);
  }
});

beforeEach(async () => {
  // Survives its appointment by design (ON DELETE SET NULL), so deleting the
  // customers below does not take it with them.
  await db.delete(reminderDeliveries).where(eq(reminderDeliveries.accountId, accountId));
  await db.delete(customers).where(eq(customers.accountId, accountId));
  await db.delete(whatsappContacts).where(eq(whatsappContacts.accountId, accountId));
  await db.delete(waMessageStatuses).where(eq(waMessageStatuses.accountId, accountId));
  await db.delete(events).where(eq(events.accountId, accountId));
  await db
    .update(whatsappConnections)
    .set({
      status: 'active',
      mode: 'coexistence',
      coexistenceSyncStatus: 'syncing',
      coexistenceLastProgress: null,
      coexistenceLastError: null,
    })
    .where(eq(whatsappConnections.accountId, accountId));
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
      .where(eq(messages.accountId, accountId));
    expect(rows).toHaveLength(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('rejects a missing signature header with 401', async () => {
    const res = await POST(makePost(buildPayload(), { headerOverride: null }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/webhooks/whatsapp — happy path', () => {
  it('persists customer, conversation, and message; emits message.received', async () => {
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
      .from(customers)
      .where(and(eq(customers.accountId, accountId), eq(customers.waId, WA_ID)));
    expect(ps).toHaveLength(1);
    expect(ps[0].name).toBe('Jane');

    const cs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    expect(cs).toHaveLength(1);
    expect(cs[0].lastInboundAt).toBeInstanceOf(Date);

    const ms = await db.select().from(messages).where(eq(messages.accountId, accountId));
    expect(ms).toHaveLength(1);
    expect(ms[0].externalId).toBe(externalId);
    expect(ms[0].content).toBe('first ping');
    expect(ms[0].role).toBe('customer');
    expect(ms[0].channel).toBe('whatsapp');

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        name: 'message.received',
        data: {
          messageId: ms[0].id,
          accountId,
          conversationId: cs[0].id,
          traceId: expect.any(String),
        },
      }),
    );
  });

  it('links an existing manual customer by normalized phone instead of duplicating it', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const [manual] = await db
      .insert(customers)
      .values({
        accountId,
        name: 'Manual Jane',
        phone: '+44 7700 900000',
      })
      .returning({ id: customers.id });

    const res = await POST(
      makePost(
        buildPayload({ messageId: nextExternalId(), text: 'linked ping' }),
      ),
    );
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(customers)
      .where(eq(customers.accountId, accountId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: manual.id, waId: WA_ID });
  });

  it('reopens a manually closed conversation on the next inbound message', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    await POST(makePost(buildPayload({ messageId: nextExternalId() })));
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    await db
      .update(conversations)
      .set({
        closedAt: new Date(),
        aiActive: false,
        escalationState: 'idle',
      })
      .where(eq(conversations.id, conversation.id));

    await POST(
      makePost(
        buildPayload({ messageId: nextExternalId(), text: 'new inbound' }),
      ),
    );
    const [reopened] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    expect(reopened.closedAt).toBeNull();
    expect(reopened.aiActive).toBe(true);
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

    const ms = await db.select().from(messages).where(eq(messages.accountId, accountId));
    expect(ms).toHaveLength(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('does not reopen a closed conversation for a duplicate delivery', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const payload = buildPayload({ messageId: nextExternalId() });
    await POST(makePost(payload));
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    await db
      .update(conversations)
      .set({ closedAt: new Date(), aiActive: false })
      .where(eq(conversations.id, conversation.id));

    await POST(makePost(payload));

    const [afterRetry] = await db
      .select({
        closedAt: conversations.closedAt,
        aiActive: conversations.aiActive,
      })
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    expect(afterRetry.closedAt).not.toBeNull();
    expect(afterRetry.aiActive).toBe(false);
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
      .where(eq(messages.accountId, accountId));
    expect(rows).toHaveLength(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/whatsapp — non-text message type', () => {
  // A dropped voice note is invisible three times over: no unread badge, no
  // chat-list preview, no realtime refresh — all three read the `messages` row,
  // so persisting a placeholder is what makes the PT see it at all.
  it('persists a placeholder that reaches the chat list and the unread badge', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const timestamp = nowSeconds();
    const res = await POST(
      makePost(buildPayload({ messageType: 'audio', timestamp })),
    );
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.accountId, accountId));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('customer');
    expect(rows[0].content).toBe('[mesazh zanor]');

    const [row] = await getChatListSnapshot(accountId);
    expect(row.last_content).toBe('[mesazh zanor]');
    expect(row.unread_count).toBe(1);

    // The job has to know the stored content is our placeholder and not the
    // customer's words, or the model would be asked to answer a voice note it
    // cannot hear.
    const [received] = await db
      .select()
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'message.received')));
    expect(received.payload).toMatchObject({ nonText: true });

    const ps = await db
      .select()
      .from(customers)
      .where(and(eq(customers.accountId, accountId), eq(customers.waId, WA_ID)));
    expect(ps).toHaveLength(1);

    const cs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    expect(cs).toHaveLength(1);
    // The window belongs to the inbound, not to the moment Meta happened to
    // deliver it to us.
    expect(cs[0].lastInboundAt?.getTime()).toBe(Number(timestamp) * 1000);
  });

  it('moves the preview and the unread count on an existing conversation', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    await POST(makePost(buildPayload({ text: 'a kam takim nesër?' })));
    const [beforeMedia] = await getChatListSnapshot(accountId);
    expect(beforeMedia.last_content).toBe('a kam takim nesër?');
    expect(beforeMedia.unread_count).toBe(1);

    await POST(
      makePost(buildPayload({ messageType: 'image', timestamp: nowSeconds() })),
    );

    const [afterMedia] = await getChatListSnapshot(accountId);
    expect(afterMedia.last_content).toBe('[foto]');
    expect(afterMedia.unread_count).toBe(2);
  });

  // A caption IS text the customer typed, carried on the media object and never
  // in `text` — dropping the message dropped their words with it.
  it('keeps the caption the customer typed alongside the placeholder', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    await POST(
      makePost(
        buildPayload({
          messageType: 'image',
          timestamp: nowSeconds(),
          caption: 'a mund të vij të mërkurën?',
        }),
      ),
    );

    const [row] = await db.select().from(messages).where(eq(messages.accountId, accountId));
    expect(row.content).toBe('[foto] a mund të vij të mërkurën?');
  });

  it('dedupes a redelivered media message on its external id', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const payload = buildPayload({
      messageType: 'audio',
      timestamp: nowSeconds(),
    });
    await POST(makePost(payload));
    await POST(makePost(payload));

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.accountId, accountId));
    expect(rows).toHaveLength(1);
    const received = await db
      .select()
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'message.received')));
    expect(received).toHaveLength(1);
  });

  it('does not extend the 24h window from a redelivered old media inbound', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const fresh = nowSeconds();
    await POST(makePost(buildPayload({ messageType: 'image', timestamp: fresh })));

    // Meta redelivers a batch containing an image the customer sent two days ago
    // (an unpersisted inbound has no external_id dedupe of its own). Bumping to
    // now() re-opened a service window that has in fact expired, so the PT's
    // free-form reply would be rejected by Meta or billed as a new conversation.
    const stale = String(Math.floor(Date.now() / 1000) - 2 * 86_400);
    await POST(makePost(buildPayload({ messageType: 'image', timestamp: stale })));

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    expect(conversation.lastInboundAt?.getTime()).toBe(Number(fresh) * 1000);
  });

  it('reopens a closed conversation on a media inbound', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    await POST(makePost(buildPayload({ messageId: nextExternalId() })));
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    await db
      .update(conversations)
      .set({ closedAt: new Date(Date.now() - 60_000), aiActive: false })
      .where(eq(conversations.id, conversation.id));

    await POST(
      makePost(buildPayload({ messageType: 'image', timestamp: nowSeconds() })),
    );

    const [reopened] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    expect(reopened.closedAt).toBeNull();
    expect(reopened.aiActive).toBe(true);
  });

  it('does not reopen a closed conversation when Meta redelivers a media batch', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const payload = buildPayload({ messageType: 'image' });
    await POST(makePost(payload));
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    // The PT closes the conversation after the media arrived; Meta then
    // redelivers the whole batch (an unpersisted inbound has no external_id
    // dedupe of its own).
    await db
      .update(conversations)
      .set({
        closedAt: new Date(),
        aiActive: false,
        escalationState: 'requested',
      })
      .where(eq(conversations.id, conversation.id));

    await POST(makePost(payload));

    const [afterRetry] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    expect(afterRetry.closedAt).not.toBeNull();
    expect(afterRetry.aiActive).toBe(false);
    expect(afterRetry.escalationState).toBe('requested');
  });

  it.each(['reaction', 'system', 'request_welcome', 'unsupported'])(
    'ignores a %s inbound: no client row, no conversation, no window bump',
    async (messageType) => {
      const sendSpy = vi
        .spyOn(inngest, 'send')
        .mockResolvedValue({ ids: [] } as never);

      const res = await POST(
        makePost(buildPayload({ messageType, timestamp: nowSeconds() })),
      );
      expect(res.status).toBe(200);

      const ps = await db
        .select()
        .from(customers)
        .where(eq(customers.accountId, accountId));
      expect(ps).toHaveLength(0);

      const cs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.accountId, accountId));
      expect(cs).toHaveLength(0);
      expect(sendSpy).not.toHaveBeenCalled();
    },
  );
});

describe('POST /api/webhooks/whatsapp — conversation bump', () => {
  it('updates last_inbound_at on the existing conversation; no duplicate row', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);

    await POST(makePost(buildPayload({ messageId: nextExternalId() })));
    const cs1 = await db
      .select()
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    expect(cs1).toHaveLength(1);
    const firstStamp = cs1[0].lastInboundAt!.getTime();

    await new Promise((r) => setTimeout(r, 15));

    await POST(makePost(buildPayload({ messageId: nextExternalId() })));
    const cs2 = await db
      .select()
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
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
      .where(eq(whatsappConnections.accountId, accountId));
    expect(connection.coexistenceSyncStatus).toBe('complete');
    expect(connection.coexistenceLastProgress).toBe(100);

    const ms = await db.select().from(messages).where(eq(messages.accountId, accountId));
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
      .where(eq(whatsappConnections.accountId, accountId));
    expect(connection.coexistenceSyncStatus).toBe('history_declined');
    expect(connection.coexistenceLastError).toContain(
      'History sync is turned off',
    );
  });
});

describe('POST /api/webhooks/whatsapp — smb_app_state_sync', () => {
  it('stores app contacts without creating a conversation', async () => {
    const res = await POST(makePost(buildAppStatePayload()));
    expect(res.status).toBe(200);

    const contacts = await db
      .select()
      .from(whatsappContacts)
      .where(eq(whatsappContacts.accountId, accountId));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      phone: WA_ID,
      waId: WA_ID,
      fullName: 'Jane Customer',
      firstName: 'Jane',
      sourceAction: 'add',
    });

    const cs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    expect(cs).toHaveLength(0);
  });

  it('dedupes two address-book entries sharing a wa_id and still runs the rest of the batch', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const messageId = nextExternalId();

    const res = await POST(
      makePost(
        buildContactSyncPayload(
          [
            {
              phone_number: '069 123 4567',
              wa_id: WA_ID,
              full_name: 'Jane Old',
            },
            {
              phone_number: '+355 69 123 4567',
              wa_id: WA_ID,
              full_name: 'Jane New',
            },
          ],
          { withMessageId: messageId },
        ),
      ),
    );
    expect(res.status).toBe(200);

    const contacts = await db
      .select()
      .from(whatsappContacts)
      .where(eq(whatsappContacts.accountId, accountId));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      waId: WA_ID,
      phone: '+355 69 123 4567',
      fullName: 'Jane New',
    });

    // The `messages` change after the colliding contact must still be applied.
    const ms = await db.select().from(messages).where(eq(messages.accountId, accountId));
    expect(ms).toHaveLength(1);
    expect(ms[0].externalId).toBe(messageId);
  });

  it('acks a contact that collides on the other unique index', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const messageId = nextExternalId();

    const res = await POST(
      makePost(
        buildContactSyncPayload(
          [
            { phone_number: WA_ID, wa_id: WA_ID, full_name: 'Jane First' },
            {
              phone_number: WA_ID,
              wa_id: '355690000001',
              full_name: 'Jane Clash',
            },
          ],
          { withMessageId: messageId },
        ),
      ),
    );
    expect(res.status).toBe(200);

    const contacts = await db
      .select()
      .from(whatsappContacts)
      .where(eq(whatsappContacts.accountId, accountId));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ waId: WA_ID, fullName: 'Jane First' });

    const ms = await db.select().from(messages).where(eq(messages.accountId, accountId));
    expect(ms).toHaveLength(1);
  });

  it('keeps upserting on phone when Meta sends no wa_id', async () => {
    const res = await POST(
      makePost(
        buildContactSyncPayload([
          { phone_number: WA_ID, full_name: 'Jane One' },
          { phone_number: WA_ID, full_name: 'Jane Two' },
        ]),
      ),
    );
    expect(res.status).toBe(200);

    const contacts = await db
      .select()
      .from(whatsappContacts)
      .where(eq(whatsappContacts.accountId, accountId));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ waId: WA_ID, fullName: 'Jane Two' });
  });
});

/** Create the customer + conversation for WA_ID via one inbound text message. */
async function seedConversationForWaId(): Promise<string> {
  await POST(makePost(buildPayload({ messageId: nextExternalId() })));
  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.accountId, accountId));
  return conversation.id;
}

function pauseEvents() {
  return db
    .select({ id: events.id })
    .from(events)
    .where(
      and(eq(events.accountId, accountId), eq(events.type, 'conversation.ai_paused')),
    );
}

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
      .from(customers)
      .where(and(eq(customers.accountId, accountId), eq(customers.waId, WA_ID)));
    expect(ps).toHaveLength(1);
    expect(ps[0].name).toBe('Jane Customer');

    const cs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    expect(cs).toHaveLength(1);
    expect(cs[0].aiActive).toBe(false);
    expect(cs[0].aiPauseReason).toBe('whatsapp_business_app_echo');
    expect(cs[0].aiPausedUntil!.getTime()).toBeGreaterThanOrEqual(
      before + 2 * 60 * 60 * 1000 - 1000,
    );
    expect(cs[0].aiPausedUntil!.getTime()).toBeLessThan(
      before + 2 * 60 * 60 * 1000 + 10_000,
    );

    const ms = await db.select().from(messages).where(eq(messages.accountId, accountId));
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({
      externalId: messageId,
      role: 'account',
      channel: 'whatsapp',
      content: 'manual app reply',
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'conversation.ai_paused',
        data: expect.objectContaining({
          accountId,
          conversationId: cs[0].id,
          customerId: ps[0].id,
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

    const ms = await db.select().from(messages).where(eq(messages.accountId, accountId));
    expect(ms).toHaveLength(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('does not advance the pause or re-emit for a redelivered echo', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const payload = buildEchoPayload(nextExternalId());

    await POST(makePost(payload));
    const [first] = await db
      .select({ aiPausedUntil: conversations.aiPausedUntil })
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    expect(first.aiPausedUntil).toBeInstanceOf(Date);

    await new Promise((r) => setTimeout(r, 15));
    await POST(makePost(payload));

    const [second] = await db
      .select({ aiPausedUntil: conversations.aiPausedUntil })
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    expect(second.aiPausedUntil!.getTime()).toBe(
      first.aiPausedUntil!.getTime(),
    );
    expect(await pauseEvents()).toHaveLength(1);
  });

  it('leaves an indefinite manual takeover hold untouched', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const conversationId = await seedConversationForWaId();
    // Manual takeover: AI off with no pause reason (no scheduled resume).
    await db
      .update(conversations)
      .set({ aiActive: false, aiPausedUntil: null, aiPauseReason: null })
      .where(eq(conversations.id, conversationId));

    const res = await POST(makePost(buildEchoPayload()));
    expect(res.status).toBe(200);

    const [after] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(after.aiActive).toBe(false);
    expect(after.aiPausedUntil).toBeNull();
    expect(after.aiPauseReason).toBeNull();
    expect(await pauseEvents()).toHaveLength(0);

    // The echo itself is still mirrored into the thread.
    const ms = await db
      .select({ role: messages.role })
      .from(messages)
      .where(and(eq(messages.accountId, accountId), eq(messages.role, 'account')));
    expect(ms).toHaveLength(1);
  });

  it('keeps an open escalation instead of clearing it to idle', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const conversationId = await seedConversationForWaId();
    await db
      .update(conversations)
      .set({
        aiActive: false,
        aiPausedUntil: null,
        aiPauseReason: null,
        escalationState: 'requested',
      })
      .where(eq(conversations.id, conversationId));

    const res = await POST(makePost(buildEchoPayload()));
    expect(res.status).toBe(200);

    const [after] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(after.escalationState).toBe('requested');
    expect(after.aiPauseReason).toBeNull();
    expect(await pauseEvents()).toHaveLength(0);
  });

  it('extends a still-current echo pause for a second, different echo', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    await POST(makePost(buildEchoPayload(nextExternalId())));
    const [first] = await db
      .select({ aiPausedUntil: conversations.aiPausedUntil })
      .from(conversations)
      .where(eq(conversations.accountId, accountId));

    await new Promise((r) => setTimeout(r, 15));
    await POST(makePost(buildEchoPayload(nextExternalId())));

    const [second] = await db
      .select({
        aiPausedUntil: conversations.aiPausedUntil,
        aiPauseReason: conversations.aiPauseReason,
      })
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    expect(second.aiPausedUntil!.getTime()).toBeGreaterThan(
      first.aiPausedUntil!.getTime(),
    );
    expect(second.aiPauseReason).toBe('whatsapp_business_app_echo');
    expect(await pauseEvents()).toHaveLength(2);
  });
});

describe('POST /api/webhooks/whatsapp — account_update', () => {
  it.each([
    ['PARTNER_REMOVED', 'partner_removed'],
    ['DISABLED_UPDATE', 'account_disconnected'],
    ['ACCOUNT_VIOLATION', 'account_disconnected'],
    ['ACCOUNT_DELETED', 'account_disconnected'],
  ])('revokes the connection on %s', async (event, reason) => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);

    const res = await POST(makePost(buildAccountUpdatePayload(event)));
    expect(res.status).toBe(200);

    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.accountId, accountId));
    expect(connection.status).toBe('revoked');
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'wa.connection.revoked',
        data: expect.objectContaining({
          accountId,
          connectionId: connection.id,
          reason,
        }),
      }),
    );
  });

  // ACCOUNT_RESTRICTION also covers soft restrictions (lowered messaging tier,
  // "cannot add a phone number") that leave sending working, so it must not take
  // a healthy number offline.
  it.each(['PHONE_NUMBER_ADDED', 'ACCOUNT_RESTRICTION'])(
    'acks %s without revoking the connection',
    async (event) => {
      const sendSpy = vi
        .spyOn(inngest, 'send')
        .mockResolvedValue({ ids: [] } as never);

      const res = await POST(makePost(buildAccountUpdatePayload(event)));
      expect(res.status).toBe(200);

      const [connection] = await db
        .select()
        .from(whatsappConnections)
        .where(eq(whatsappConnections.accountId, accountId));
      expect(connection.status).toBe('active');
      expect(sendSpy).not.toHaveBeenCalled();
    },
  );

  it('revokes on PHONE_NUMBER_REMOVED when the payload names this number', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);

    // Meta formats the number for display; the match is on digits.
    const res = await POST(
      makePost(
        buildAccountUpdatePayload('PHONE_NUMBER_REMOVED', '+1 555-123-4567'),
      ),
    );
    expect(res.status).toBe(200);

    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.accountId, accountId));
    expect(connection.status).toBe('revoked');
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'wa.connection.revoked',
        data: expect.objectContaining({ reason: 'account_disconnected' }),
      }),
    );
  });

  it('leaves the connection active when PHONE_NUMBER_REMOVED names another number on the WABA', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);

    const res = await POST(
      makePost(
        buildAccountUpdatePayload('PHONE_NUMBER_REMOVED', '15559990000'),
      ),
    );
    expect(res.status).toBe(200);

    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.accountId, accountId));
    expect(connection.status).toBe('active');
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

type StatusFixture = {
  id: string;
  status: string;
  timestamp?: string;
  pricing?: {
    billable?: boolean;
    category?: string;
    type?: string;
    pricing_model?: string;
  };
  errors?: { code: number; title?: string; message?: string }[];
};

function buildStatusesPayload(statuses: StatusFixture[]) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15551234567',
                phone_number_id: PHONE_NUMBER_ID,
              },
              statuses: statuses.map((s) => ({
                timestamp: '1700000000',
                recipient_id: WA_ID,
                ...s,
              })),
            },
          },
        ],
      },
    ],
  };
}

/** Seed a delivered/failed-ready reminder: customer + appointment + AI reminder
 *  message carrying `wamid`, plus a reminder_jobs row pointing at it. */
async function seedReminderForWamid(opts: {
  wamid: string;
  jobStatus?: 'sent' | 'scheduled';
  deliveredAt?: Date | null;
  responseType?: 'confirm' | null;
}): Promise<{
  appointmentId: string;
  reminderJobId: string;
  messageId: string;
  conversationId: string;
}> {
  const suffix = `${Date.now()}-${++externalIdCounter}`;
  const [customer] = await db
    .insert(customers)
    .values({ accountId, name: 'Reminder Pat', phone: `+1666${suffix}`, waId: `rem-${suffix}` })
    .returning({ id: customers.id });
  const [conversation] = await db
    .insert(conversations)
    .values({ accountId, customerId: customer.id, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  const [appointment] = await db
    .insert(appointments)
    .values({
      accountId,
      customerId: customer.id,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
      status: 'confirmed',
    })
    .returning({ id: appointments.id });
  const [message] = await db
    .insert(messages)
    .values({
      accountId,
      conversationId: conversation.id,
      externalId: opts.wamid,
      role: 'ai',
      channel: 'whatsapp',
      content: 'Kujtesë',
      templateId: crypto.randomUUID(),
    })
    .returning({ id: messages.id });
  // A delivered reminder always has the per-wamid delivery facts behind it —
  // those rows, not the job's scalar, are what the webhook guards read and what
  // the plan quota counts.
  if (opts.deliveredAt) {
    await db.insert(waMessageStatuses).values({
      accountId,
      externalId: opts.wamid,
      lastStatus: 'delivered',
      deliveredAt: opts.deliveredAt,
    });
    await db.insert(reminderDeliveries).values({
      accountId,
      appointmentId: appointment.id,
      externalId: opts.wamid,
      deliveredAt: opts.deliveredAt,
    });
  }
  const [job] = await db
    .insert(reminderJobs)
    .values({
      accountId,
      appointmentId: appointment.id,
      scheduledFor: new Date(Date.now() + 3_600_000),
      status: opts.jobStatus ?? 'sent',
      sentAt: new Date(),
      deliveredAt: opts.deliveredAt ?? null,
      messageId: message.id,
      responseType: opts.responseType ?? null,
    })
    .returning({ id: reminderJobs.id });
  return {
    appointmentId: appointment.id,
    reminderJobId: job.id,
    messageId: message.id,
    conversationId: conversation.id,
  };
}

describe('POST /api/webhooks/whatsapp — statuses (delivery truth)', () => {
  it('upserts a wa_message_statuses row and captures the pricing object', async () => {
    const wamid = nextExternalId();
    const res = await POST(
      makePost(
        buildStatusesPayload([
          {
            id: wamid,
            status: 'delivered',
            pricing: {
              billable: true,
              category: 'utility',
              type: 'regular',
              pricing_model: 'PMP',
            },
          },
        ]),
      ),
    );
    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(waMessageStatuses)
      .where(eq(waMessageStatuses.externalId, wamid));
    expect(row.lastStatus).toBe('delivered');
    expect(row.deliveredAt).toBeInstanceOf(Date);
    expect(row.billable).toBe(true);
    expect(row.pricingCategory).toBe('utility');
    expect(row.pricingModel).toBe('PMP');
  });

  it('never regresses last_status for an out-of-order webhook', async () => {
    const wamid = nextExternalId();
    // delivered arrives first, then a late sent.
    await POST(makePost(buildStatusesPayload([{ id: wamid, status: 'delivered' }])));
    await POST(makePost(buildStatusesPayload([{ id: wamid, status: 'sent' }])));

    const [row] = await db
      .select()
      .from(waMessageStatuses)
      .where(eq(waMessageStatuses.externalId, wamid));
    expect(row.lastStatus).toBe('delivered');
    // Both per-status timestamps are stamped independently.
    expect(row.deliveredAt).toBeInstanceOf(Date);
    expect(row.sentAt).toBeInstanceOf(Date);
  });

  it('advances last_status on a normal sent → delivered → read progression', async () => {
    const wamid = nextExternalId();
    await POST(makePost(buildStatusesPayload([{ id: wamid, status: 'sent' }])));
    await POST(makePost(buildStatusesPayload([{ id: wamid, status: 'delivered' }])));
    await POST(makePost(buildStatusesPayload([{ id: wamid, status: 'read' }])));

    const [row] = await db
      .select()
      .from(waMessageStatuses)
      .where(eq(waMessageStatuses.externalId, wamid));
    expect(row.lastStatus).toBe('read');
    expect(row.readAt).toBeInstanceOf(Date);
  });

  it('stamps reminder_jobs.delivered_at on a delivered status (first-write-wins)', async () => {
    const wamid = nextExternalId();
    const { reminderJobId } = await seedReminderForWamid({ wamid });

    await POST(
      makePost(
        buildStatusesPayload([
          { id: wamid, status: 'delivered', timestamp: '1700000000' },
        ]),
      ),
    );
    const [first] = await db
      .select({ deliveredAt: reminderJobs.deliveredAt })
      .from(reminderJobs)
      .where(eq(reminderJobs.id, reminderJobId));
    expect(first.deliveredAt).toBeInstanceOf(Date);
    const firstStamp = first.deliveredAt!.getTime();

    // A later delivered webhook must not move the first delivery timestamp.
    await POST(
      makePost(
        buildStatusesPayload([
          { id: wamid, status: 'delivered', timestamp: '1700009999' },
        ]),
      ),
    );
    const [second] = await db
      .select({ deliveredAt: reminderJobs.deliveredAt })
      .from(reminderJobs)
      .where(eq(reminderJobs.id, reminderJobId));
    expect(second.deliveredAt!.getTime()).toBe(firstStamp);

    // ...and the metered fact the quota counts stays at one row for the one
    // template Meta billed, however many times it reports the delivery.
    const deliveries = await db
      .select()
      .from(reminderDeliveries)
      .where(eq(reminderDeliveries.externalId, wamid));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].deliveredAt.getTime()).toBe(firstStamp);
  });

  /**
   * A reschedule re-arms the same reminder_jobs row (it is unique per
   * appointment) onto a NEW message, while `delivered_at` still holds the first
   * cycle's delivery and nothing ever clears it.
   */
  async function rearmOntoSecondCycle(reminderJobId: string, conversationId: string) {
    const wamid = nextExternalId();
    const [message] = await db
      .insert(messages)
      .values({
        accountId,
        conversationId,
        externalId: wamid,
        role: 'ai',
        channel: 'whatsapp',
        content: 'Kujtesë (cikli 2)',
        templateId: crypto.randomUUID(),
      })
      .returning({ id: messages.id });
    await db
      .update(reminderJobs)
      .set({
        status: 'sent',
        sentAt: new Date(),
        messageId: message.id,
        responseType: null,
        respondedAt: null,
        responseMessageId: null,
      })
      .where(eq(reminderJobs.id, reminderJobId));
    return wamid;
  }

  it('stamps the delivery of a second cycle over the previous one', async () => {
    const firstWamid = nextExternalId();
    const firstDelivery = FIRST_DELIVERY;
    const { reminderJobId, conversationId } = await seedReminderForWamid({
      wamid: firstWamid,
      deliveredAt: firstDelivery,
    });
    const secondWamid = await rearmOntoSecondCycle(reminderJobId, conversationId);

    await POST(
      makePost(
        buildStatusesPayload([
          {
            id: secondWamid,
            status: 'delivered',
            timestamp: SECOND_DELIVERY_TS,
          },
        ]),
      ),
    );

    // Meta billed this second template separately; a `delivered_at IS NULL`
    // guard swallowed it and the cycle stayed invisible to the plan quota.
    const [job] = await db
      .select({ deliveredAt: reminderJobs.deliveredAt })
      .from(reminderJobs)
      .where(eq(reminderJobs.id, reminderJobId));
    expect(job.deliveredAt?.getTime()).toBe(SECOND_DELIVERY.getTime());

    // The job scalar can only hold the later cycle, so the count comes from a
    // row per delivered wamid — both billed templates, one appointment.
    const deliveries = await db
      .select({ externalId: reminderDeliveries.externalId })
      .from(reminderDeliveries)
      .where(eq(reminderDeliveries.accountId, accountId));
    expect(deliveries.map((d) => d.externalId).sort()).toEqual(
      [firstWamid, secondWamid].sort(),
    );
  });

  it('flags a second cycle that failed even though the first was delivered', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const firstWamid = nextExternalId();
    const { appointmentId, reminderJobId, conversationId } =
      await seedReminderForWamid({
        wamid: firstWamid,
        deliveredAt: FIRST_DELIVERY,
      });
    const secondWamid = await rearmOntoSecondCycle(reminderJobId, conversationId);

    await POST(
      makePost(
        buildStatusesPayload([
          {
            id: secondWamid,
            status: 'failed',
            errors: [{ code: 131049, title: 'Message undeliverable' }],
          },
        ]),
      ),
    );

    const [job] = await db
      .select({ status: reminderJobs.status })
      .from(reminderJobs)
      .where(eq(reminderJobs.id, reminderJobId));
    expect(job.status).toBe('failed');
    const failEvents = await db
      .select({ payload: events.payload })
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'reminder.failed')));
    expect(failEvents).toHaveLength(1);
    expect(failEvents[0].payload).toMatchObject({ appointmentId });
  });

  it('marks the reminder failed and emits reminder.failed on a failed status', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const wamid = nextExternalId();
    const { appointmentId, reminderJobId } = await seedReminderForWamid({ wamid });

    const res = await POST(
      makePost(
        buildStatusesPayload([
          {
            id: wamid,
            status: 'failed',
            errors: [{ code: 131049, title: 'Message undeliverable' }],
          },
        ]),
      ),
    );
    expect(res.status).toBe(200);

    const [job] = await db
      .select({ status: reminderJobs.status })
      .from(reminderJobs)
      .where(eq(reminderJobs.id, reminderJobId));
    expect(job.status).toBe('failed');

    const [statusRow] = await db
      .select({ failedAt: waMessageStatuses.failedAt, errorCode: waMessageStatuses.errorCode })
      .from(waMessageStatuses)
      .where(eq(waMessageStatuses.externalId, wamid));
    expect(statusRow.failedAt).toBeInstanceOf(Date);
    expect(statusRow.errorCode).toBe(131049);

    const failEvents = await db
      .select({ payload: events.payload })
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'reminder.failed')));
    expect(failEvents).toHaveLength(1);
    expect(failEvents[0].payload).toMatchObject({ appointmentId });
  });

  it('does not re-flag a reminder that was already delivered', async () => {
    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
    const wamid = nextExternalId();
    const { reminderJobId } = await seedReminderForWamid({
      wamid,
      deliveredAt: new Date(),
    });

    await POST(
      makePost(buildStatusesPayload([{ id: wamid, status: 'failed' }])),
    );

    const [job] = await db
      .select({ status: reminderJobs.status })
      .from(reminderJobs)
      .where(eq(reminderJobs.id, reminderJobId));
    expect(job.status).toBe('sent');
    const failEvents = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'reminder.failed')));
    expect(failEvents).toHaveLength(0);
  });
});

describe('POST /api/webhooks/whatsapp — unsupported coexistence errors', () => {
  it('acks unsupported error 131060 without writes or events', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    const res = await POST(makePost(buildUnsupportedErrorPayload()));
    expect(res.status).toBe(200);

    const ms = await db.select().from(messages).where(eq(messages.accountId, accountId));
    const evs = await db.select().from(events).where(eq(events.accountId, accountId));
    expect(ms).toHaveLength(0);
    expect(evs).toHaveLength(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
