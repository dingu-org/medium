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
import {
  conversations,
  messageTemplates,
  customers,
  whatsappConnections,
} from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { inngest } from '@/lib/inngest/client';
import { createServiceClient } from '@/lib/supabase/service';
import {
  ConnectionRevokedError,
  OutsideWindowError,
  TemplateNotApprovedError,
} from '../errors';
import {
  editTemplate,
  getQualityRating,
  sendFreeForm,
  sendTemplate,
  submitTemplate,
} from '../client';

const TOKEN = 'PT_TOKEN_supersecret_value';
const WA_ID = '447700900111';

let accountId = '';
let connectionId = '';
let conversationId = '';
let pniCounter = 0;
const nextPni = () => `PNI_CLIENT_${Date.now()}_${++pniCounter}`;

const okResponse = () =>
  new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT' }] }), {
    status: 200,
  });

function makeFetch(impl: (init?: RequestInit) => Response) {
  return vi.fn((_url: unknown, init?: RequestInit) =>
    Promise.resolve(impl(init)),
  );
}

beforeAll(async () => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: `wa-client-${Date.now()}@example.com`,
    password: 'wa-client-1234',
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`createUser failed: ${error?.message}`);
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  await db
    .delete(whatsappConnections)
    .where(eq(whatsappConnections.accountId, accountId));
  await db.delete(customers).where(eq(customers.accountId, accountId)); // cascades conversations + messages
  await db.delete(messageTemplates).where(eq(messageTemplates.accountId, accountId));

  const encrypted = await encryptToken(TOKEN);
  const [conn] = await db
    .insert(whatsappConnections)
    .values({
      accountId,
      phoneNumberId: nextPni(),
      wabaId: 'WABA_CLIENT',
      accessTokenEncrypted: encrypted,
      status: 'active',
    })
    .returning({ id: whatsappConnections.id });
  connectionId = conn.id;

  const [customer] = await db
    .insert(customers)
    .values({ accountId, name: 'Pat', phone: WA_ID, waId: WA_ID })
    .returning({ id: customers.id });

  const [conv] = await db
    .insert(conversations)
    .values({
      accountId,
      customerId: customer.id,
      channel: 'whatsapp',
      lastInboundAt: new Date(),
    })
    .returning({ id: conversations.id });
  conversationId = conv.id;

  vi.stubGlobal(
    'fetch',
    makeFetch(() => okResponse()),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendFreeForm', () => {
  it('sends a text message inside the 24h window', async () => {
    const fetchMock = makeFetch(() => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = await sendFreeForm(connectionId, WA_ID, 'hello');
    expect(res.messageId).toBe('wamid.OUT');

    const init = fetchMock.mock.calls[0][1]!;
    expect(JSON.parse(init.body as string)).toMatchObject({
      messaging_product: 'whatsapp',
      to: WA_ID,
      type: 'text',
      text: { body: 'hello' },
    });
  });

  it('refuses outside the 24h window, without calling Graph', async () => {
    await db
      .update(conversations)
      .set({ lastInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(conversations.id, conversationId));
    const fetchMock = makeFetch(() => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendFreeForm(connectionId, WA_ID, 'hi'),
    ).rejects.toBeInstanceOf(OutsideWindowError);
    expect(fetchMock.mock.calls).toHaveLength(0);
  });

  it('refuses when no conversation exists for the recipient', async () => {
    const fetchMock = makeFetch(() => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendFreeForm(connectionId, '999999', 'hi'),
    ).rejects.toBeInstanceOf(OutsideWindowError);
    expect(fetchMock.mock.calls).toHaveLength(0);
  });
});

describe('sendTemplate', () => {
  it('refuses when the PT has no such template', async () => {
    const fetchMock = makeFetch(() => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendTemplate(connectionId, WA_ID, 'appointment_reminder_24h', 'en_US'),
    ).rejects.toBeInstanceOf(TemplateNotApprovedError);
    expect(fetchMock.mock.calls).toHaveLength(0);
  });

  it('refuses when the template is still pending', async () => {
    await db.insert(messageTemplates).values({
      accountId,
      name: 'appointment_reminder_24h',
      language: 'en_US',
      status: 'pending',
      body: 'x',
    });
    const fetchMock = makeFetch(() => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendTemplate(connectionId, WA_ID, 'appointment_reminder_24h', 'en_US'),
    ).rejects.toBeInstanceOf(TemplateNotApprovedError);
    expect(fetchMock.mock.calls).toHaveLength(0);
  });

  it('sends when the template is approved, with body parameters', async () => {
    await db.insert(messageTemplates).values({
      accountId,
      name: 'appointment_reminder_24h',
      language: 'en_US',
      status: 'approved',
      body: 'x',
    });
    const fetchMock = makeFetch(() => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = await sendTemplate(
      connectionId,
      WA_ID,
      'appointment_reminder_24h',
      'en_US',
      ['Pat', '3pm'],
    );
    expect(res.messageId).toBe('wamid.OUT');

    const payload = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(payload.type).toBe('template');
    expect(payload.template.name).toBe('appointment_reminder_24h');
    expect(payload.template.components[0].parameters).toHaveLength(2);
  });
});

describe('submitTemplate', () => {
  const VAR_BODY = 'Hi {{1}}, appointment with {{2}} on {{3}}.';
  const EXAMPLES = ['Ana', 'Fizio Vita', 'Monday 9:00 AM'];
  const submitResponse = () =>
    new Response(JSON.stringify({ id: 'TPL_META_ID', status: 'PENDING' }), {
      status: 200,
    });

  it('attaches example.body_text for a variable-bearing body', async () => {
    const fetchMock = makeFetch(() => submitResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = await submitTemplate(
      connectionId,
      'appointment_reminder_24h_v2',
      'en_US',
      VAR_BODY,
      EXAMPLES,
    );
    expect(res).toEqual({ metaId: 'TPL_META_ID', status: 'PENDING' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/message_templates');
    const payload = JSON.parse(init!.body as string);
    expect(payload.category).toBe('UTILITY');
    expect(payload.components[0]).toEqual({
      type: 'BODY',
      text: VAR_BODY,
      example: { body_text: [EXAMPLES] },
    });
  });

  it('omits example for a variable-free body', async () => {
    const fetchMock = makeFetch(() => submitResponse());
    vi.stubGlobal('fetch', fetchMock);

    await submitTemplate(
      connectionId,
      'static_template',
      'en_US',
      'No variables here.',
      [],
    );

    const payload = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(payload.components[0]).toEqual({
      type: 'BODY',
      text: 'No variables here.',
    });
    expect(payload.components[0]).not.toHaveProperty('example');
  });
});

describe('editTemplate', () => {
  const VAR_BODY = 'Hi {{1}}, appointment with {{2}} on {{3}}.';
  const EXAMPLES = ['Ana', 'Fizio Vita', 'Monday 9:00 AM'];

  it('POSTs category + BODY-with-example to the template id', async () => {
    const fetchMock = makeFetch(
      () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await editTemplate(
      connectionId,
      'META_TPL_9',
      VAR_BODY,
      EXAMPLES,
    );
    expect(res).toEqual({ success: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('META_TPL_9');
    expect(init!.method).toBe('POST');
    const payload = JSON.parse(init!.body as string);
    expect(payload).toEqual({
      category: 'UTILITY',
      components: [
        { type: 'BODY', text: VAR_BODY, example: { body_text: [EXAMPLES] } },
      ],
    });
    expect(payload).not.toHaveProperty('name');
  });
});

describe('auth errors', () => {
  it('marks the connection revoked and emits wa.connection.revoked on 401', async () => {
    const sendSpy = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    vi.stubGlobal(
      'fetch',
      makeFetch(
        () =>
          new Response(JSON.stringify({ error: { code: 190 } }), {
            status: 401,
          }),
      ),
    );

    await expect(
      sendFreeForm(connectionId, WA_ID, 'hi'),
    ).rejects.toBeInstanceOf(ConnectionRevokedError);

    const [row] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, connectionId));
    expect(row.status).toBe('revoked');
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        name: 'wa.connection.revoked',
        data: { accountId, connectionId, reason: 'unauthorized' },
      }),
    );
  });

  it('throws ConnectionRevokedError when the connection is not active', async () => {
    await db
      .update(whatsappConnections)
      .set({ status: 'revoked' })
      .where(eq(whatsappConnections.id, connectionId));

    await expect(
      sendFreeForm(connectionId, WA_ID, 'hi'),
    ).rejects.toBeInstanceOf(ConnectionRevokedError);
  });
});

describe('token safety', () => {
  it('never writes the decrypted token to the console', async () => {
    const seen: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        seen.push(args.map((a) => String(a)).join(' '));
      });
    }
    vi.stubGlobal(
      'fetch',
      makeFetch(() => okResponse()),
    );

    await sendFreeForm(connectionId, WA_ID, 'hello');

    expect(seen.join('\n')).not.toContain(TOKEN);
  });
});

describe('quality rating', () => {
  it('reads and normalizes phone-number quality and tier fields', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch(
        () =>
          new Response(
            JSON.stringify({
              quality_rating: 'yellow',
              messaging_limit_tier: 'TIER_250',
            }),
            { status: 200 },
          ),
      ),
    );

    await expect(getQualityRating(connectionId)).resolves.toEqual({
      qualityRating: 'YELLOW',
      tier: 'TIER_250',
    });
  });
});
