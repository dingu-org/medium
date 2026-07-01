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
import { messageTemplates, whatsappConnections } from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { createServiceClient } from '@/lib/supabase/service';
import {
  FALLBACK_REMINDER_TEMPLATE,
  ENGLISH_REMINDER_TEMPLATE,
  REMINDER_TEMPLATE,
  applyTemplateStatus,
  bootstrapWaConnectionCore,
} from '../bootstrap-wa-connection';
import { reconcileAlbanianReminderTemplatesCore } from '../reconcile-reminder-templates';

const META_TEMPLATE_ID = 'TEMPLATE_META_ID_123';

let ptId = '';
let connectionId = '';
let pniCounter = 0;
const nextPni = () => `PNI_BOOT_${Date.now()}_${++pniCounter}`;

function submitFetch(): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/message_templates')) {
      return new Response(
        JSON.stringify({ id: META_TEMPLATE_ID, status: 'PENDING' }),
        {
          status: 200,
        },
      );
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as unknown as typeof fetch;
}

beforeAll(async () => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: `wa-boot-${Date.now()}@example.com`,
    password: 'wa-boot-1234',
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`createUser failed: ${error?.message}`);
  ptId = data.user.id;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

beforeEach(async () => {
  await db.delete(messageTemplates).where(eq(messageTemplates.ptId, ptId));
  await db
    .delete(whatsappConnections)
    .where(eq(whatsappConnections.ptId, ptId));

  const encrypted = await encryptToken('PT_TOKEN');
  const [conn] = await db
    .insert(whatsappConnections)
    .values({
      ptId,
      phoneNumberId: nextPni(),
      wabaId: 'WABA_BOOT',
      accessTokenEncrypted: encrypted,
      status: 'active',
    })
    .returning({ id: whatsappConnections.id });
  connectionId = conn.id;

  vi.stubGlobal('fetch', submitFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bootstrapWaConnectionCore', () => {
  it('submits the reminder template and inserts a pending row', async () => {
    const result = await bootstrapWaConnectionCore({ ptId, connectionId });
    expect(result.created).toBe(true);

    const [row] = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.ptId, ptId));
    expect(row.name).toBe(REMINDER_TEMPLATE.name);
    expect(row.language).toBe(REMINDER_TEMPLATE.language);
    expect(row.status).toBe('pending');
    expect(row.metaId).toBe(META_TEMPLATE_ID);
    expect(row.body).toBe(REMINDER_TEMPLATE.body);
  });

  it('can submit the fallback reminder template after a primary rejection', async () => {
    await bootstrapWaConnectionCore({ ptId, connectionId });
    const fallback = await bootstrapWaConnectionCore({
      ptId,
      connectionId,
      template: FALLBACK_REMINDER_TEMPLATE,
    });

    expect(fallback.created).toBe(true);
    expect(fallback.name).toBe(FALLBACK_REMINDER_TEMPLATE.name);

    const rows = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.ptId, ptId));
    expect(rows.map((row) => row.name).sort()).toEqual([
      FALLBACK_REMINDER_TEMPLATE.name,
      REMINDER_TEMPLATE.name,
    ]);
  });

  it('is idempotent — a second run does not duplicate the template', async () => {
    const first = await bootstrapWaConnectionCore({ ptId, connectionId });
    const second = await bootstrapWaConnectionCore({ ptId, connectionId });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.templateId).toBe(first.templateId);

    const rows = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.ptId, ptId));
    expect(rows).toHaveLength(1);
  });

  it('normalizes Meta approval and rejection statuses', async () => {
    const created = await bootstrapWaConnectionCore({ ptId, connectionId });

    await expect(
      applyTemplateStatus({
        ptId,
        templateId: created.templateId,
        status: 'APPROVED',
      }),
    ).resolves.toBe('approved');
    await expect(
      applyTemplateStatus({
        ptId,
        templateId: created.templateId,
        status: 'REJECTED',
      }),
    ).resolves.toBe('rejected');

    const [row] = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.id, created.templateId));
    expect(row.status).toBe('rejected');
    expect(row.lastStatusAt).not.toBeNull();
  });

  it('submits Albanian templates for an existing English-only connection', async () => {
    await db.insert(messageTemplates).values({
      ptId,
      name: ENGLISH_REMINDER_TEMPLATE.name,
      language: ENGLISH_REMINDER_TEMPLATE.language,
      status: 'approved',
      metaId: 'ENGLISH_META_ID',
      body: ENGLISH_REMINDER_TEMPLATE.body,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/message_templates')) {
          return new Response(
            JSON.stringify({ id: META_TEMPLATE_ID, status: 'PENDING' }),
            { status: 200 },
          );
        }
        if (url.includes(META_TEMPLATE_ID)) {
          return new Response(
            JSON.stringify({
              status: 'APPROVED',
              name: REMINDER_TEMPLATE.name,
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }) as unknown as typeof fetch,
    );

    await expect(
      reconcileAlbanianReminderTemplatesCore({ ptId, connectionId }),
    ).resolves.toEqual({ name: REMINDER_TEMPLATE.name, status: 'approved' });

    const rows = await db
      .select({ name: messageTemplates.name, status: messageTemplates.status })
      .from(messageTemplates)
      .where(eq(messageTemplates.ptId, ptId));
    expect(rows).toEqual(
      expect.arrayContaining([
        { name: ENGLISH_REMINDER_TEMPLATE.name, status: 'approved' },
        { name: REMINDER_TEMPLATE.name, status: 'approved' },
      ]),
    );
  });
});
