import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
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
import { pts } from '@/lib/db/schema';
import { t } from '@/lib/i18n';
import { updateAssistantIdentity } from '../actions';

const { getUserMock, redirectMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
      throw error;
    }
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));

const realService = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const INITIAL = { error: null, success: false, fieldErrors: null } as const;
const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

let ptId = '';

async function identity() {
  const [row] = await db
    .select({
      aiName: pts.aiName,
      aiEscalationKeyword: pts.aiEscalationKeyword,
    })
    .from(pts)
    .where(eq(pts.id, ptId));
  return row;
}

beforeAll(async () => {
  const { data, error } = await realService.auth.admin.createUser({
    email: `assistant-actions-${Date.now()}@example.com`,
    password: 'assistant-actions-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

afterAll(async () => {
  if (ptId) await realService.auth.admin.deleteUser(ptId);
});

beforeEach(async () => {
  getUserMock.mockResolvedValue({ data: { user: { id: ptId } } });
  await db
    .update(pts)
    .set({
      plan: 'free',
      planLifetime: false,
      aiName: null,
      aiGreeting: null,
      aiEscalationKeyword: null,
    })
    .where(eq(pts.id, ptId));
});

afterEach(() => vi.clearAllMocks());

describe('updateAssistantIdentity plan gate', () => {
  it('rejects a custom name on Free without writing', async () => {
    const result = await updateAssistantIdentity(INITIAL, form({ aiName: 'Ana' }));
    expect(result).toMatchObject({ error: t.billing.gateIdentity, success: false });
    expect((await identity()).aiName).toBeNull();
  });

  it('always allows the escalation keyword (safety is never plan-gated)', async () => {
    const result = await updateAssistantIdentity(
      INITIAL,
      form({ aiEscalationKeyword: 'urgjent' }),
    );
    expect(result).toMatchObject({ success: true });
    expect((await identity()).aiEscalationKeyword).toBe('urgjent');
  });

  it('allows a custom name on an effective Solo plan', async () => {
    await db
      .update(pts)
      .set({ plan: 'solo', planLifetime: true })
      .where(eq(pts.id, ptId));
    const result = await updateAssistantIdentity(INITIAL, form({ aiName: 'Ana' }));
    expect(result).toMatchObject({ success: true });
    expect((await identity()).aiName).toBe('Ana');
  });
});
