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
import type { SettingsState } from '../constants';
import { updateAccountPrefs } from '../account/actions';
import { updateNotificationPrefs } from '../notifications/actions';
import { updateProfile } from '../profile/actions';

const { getUserMock, redirectMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  // instrumentedAction (lib/actions/instrument.ts) calls unstable_rethrow
  // before logging/rethrowing; mirror its redirect-passthrough contract so
  // the REDIRECT: sentinel from redirectMock above isn't logged as an error.
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
      throw error;
    }
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

// A real service client, independent of the mocks above, purely to seed/clean
// up a real auth user (the trigger creates the pts row) for these tests.
const realService = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const initialState: SettingsState = {
  error: null,
  success: false,
  fieldErrors: null,
};

let ptId = '';

beforeAll(async () => {
  const { data, error } = await realService.auth.admin.createUser({
    email: `scoped-settings-actions-${Date.now()}@example.com`,
    password: 'scoped-settings-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

afterAll(async () => {
  if (ptId) await realService.auth.admin.deleteUser(ptId);
});

beforeEach(() => {
  getUserMock.mockResolvedValue({ data: { user: { id: ptId } } });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function readPt() {
  const [row] = await db
    .select({
      practiceName: pts.practiceName,
      timezone: pts.timezone,
      retentionDays: pts.retentionDays,
      notificationPrefs: pts.notificationPrefs,
    })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);
  return row;
}

describe('updateNotificationPrefs', () => {
  it('rebuilds all seven prefs from the notify_* checkboxes', async () => {
    const formData = new FormData();
    formData.set('notify_booking', 'on');
    formData.set('notify_escalation', 'on');
    // The remaining notify_* fields are absent/empty → false.
    formData.set('notify_cancellation', '');

    const result = await updateNotificationPrefs(initialState, formData);
    expect(result).toEqual({ error: null, success: true, fieldErrors: null });

    const row = await readPt();
    expect(row.notificationPrefs).toEqual({
      booking: true,
      cancellation: false,
      reschedule: false,
      escalation: true,
      reminderFailure: false,
      connection: false,
      resumeOffer: false,
    });
  });
});

describe('updateAccountPrefs', () => {
  it('persists timezone and retentionDays', async () => {
    const formData = new FormData();
    formData.set('timezone', 'Europe/Tirane');
    formData.set('retentionDays', '180');

    const result = await updateAccountPrefs(initialState, formData);
    expect(result).toEqual({ error: null, success: true, fieldErrors: null });

    const row = await readPt();
    expect(row.timezone).toBe('Europe/Tirane');
    expect(row.retentionDays).toBe(180);
  });

  it('rejects a retention period outside RETENTION_OPTIONS without writing', async () => {
    const before = await readPt();

    const formData = new FormData();
    formData.set('timezone', 'Europe/Tirane');
    formData.set('retentionDays', '7');

    const result = await updateAccountPrefs(initialState, formData);
    expect(result.success).toBe(false);
    expect(result.fieldErrors?.retentionDays).toBeTruthy();

    const after = await readPt();
    expect(after.timezone).toBe(before.timezone);
    expect(after.retentionDays).toBe(before.retentionDays);
  });
});

describe('updateProfile', () => {
  it('persists the practice name', async () => {
    const formData = new FormData();
    formData.set('practiceName', 'Fizioterapi Hoxha');

    const result = await updateProfile(initialState, formData);
    expect(result).toEqual({ error: null, success: true, fieldErrors: null });

    const row = await readPt();
    expect(row.practiceName).toBe('Fizioterapi Hoxha');
  });

  it('rejects an empty practice name without writing', async () => {
    const before = await readPt();

    const formData = new FormData();
    formData.set('practiceName', '   ');

    const result = await updateProfile(initialState, formData);
    expect(result.success).toBe(false);
    expect(result.fieldErrors?.practiceName).toBeTruthy();

    const after = await readPt();
    expect(after.practiceName).toBe(before.practiceName);
  });
});
