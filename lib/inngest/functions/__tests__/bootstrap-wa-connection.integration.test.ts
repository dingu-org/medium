import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { messageTemplates, whatsappConnections } from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { REMINDER_TEMPLATE, bootstrapWaConnectionCore } from '../bootstrap-wa-connection';

const META_TEMPLATE_ID = 'TEMPLATE_META_ID_123';

let ptId = '';
let connectionId = '';
let pniCounter = 0;
const nextPni = () => `PNI_BOOT_${Date.now()}_${++pniCounter}`;

function submitFetch(): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/message_templates')) {
      return new Response(JSON.stringify({ id: META_TEMPLATE_ID, status: 'PENDING' }), {
        status: 200,
      });
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
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  ptId = data.user.id;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

beforeEach(async () => {
  await db.delete(messageTemplates).where(eq(messageTemplates.ptId, ptId));
  await db.delete(whatsappConnections).where(eq(whatsappConnections.ptId, ptId));

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

  it('is idempotent — a second run does not duplicate the template', async () => {
    const first = await bootstrapWaConnectionCore({ ptId, connectionId });
    const second = await bootstrapWaConnectionCore({ ptId, connectionId });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.templateId).toBe(first.templateId);

    const rows = await db.select().from(messageTemplates).where(eq(messageTemplates.ptId, ptId));
    expect(rows).toHaveLength(1);
  });
});
