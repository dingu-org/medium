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
import { accounts } from '@/lib/db/schema';
import { t } from '@/lib/i18n';
import { updateRetention } from '../actions';

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

let accountId = '';

async function retentionDays(): Promise<number> {
  const [row] = await db
    .select({ retentionDays: accounts.retentionDays })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row.retentionDays;
}

beforeAll(async () => {
  const { data, error } = await realService.auth.admin.createUser({
    email: `account-actions-${Date.now()}@example.com`,
    password: 'account-actions-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await realService.auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  getUserMock.mockResolvedValue({ data: { user: { id: accountId } } });
  await db
    .update(accounts)
    .set({ plan: 'free', planLifetime: false, retentionDays: 30 })
    .where(eq(accounts.id, accountId));
});

afterEach(() => vi.clearAllMocks());

describe('updateRetention plan gate', () => {
  it('rejects a window longer than the Free max without writing', async () => {
    await expect(updateRetention(365)).rejects.toThrow(t.billing.gateRetention);
    expect(await retentionDays()).toBe(30);
  });

  it('allows a window within the Free max', async () => {
    await expect(updateRetention(30)).resolves.toBeUndefined();
    expect(await retentionDays()).toBe(30);
  });

  it('allows the long window on an effective Solo plan', async () => {
    await db
      .update(accounts)
      .set({ plan: 'solo', planLifetime: true })
      .where(eq(accounts.id, accountId));
    await expect(updateRetention(365)).resolves.toBeUndefined();
    expect(await retentionDays()).toBe(365);
  });
});
