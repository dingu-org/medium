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
import { pushSubscriptions } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { sendPush } from '../push';

const { sendNotification, WebPushError } = vi.hoisted(() => {
  class WebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'WebPushError';
      this.statusCode = statusCode;
    }
  }
  return { sendNotification: vi.fn(), WebPushError };
});

vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification,
  WebPushError,
}));

const LIVE = 'https://push.example.test/live-SECRET-abc';
const DEAD = 'https://push.example.test/dead-SECRET-xyz';
const payload = {
  title: 'Rezervim i ri',
  body: 'Alex rezervoi një takim',
  url: '/calendar?appointmentId=1',
  tag: 'appointment-1-booked',
};

let accountId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `push-${Date.now()}@example.com`,
    password: 'push-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

beforeEach(async () => {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.accountId, accountId));
  // Sentinels must be distinctive: the log legitimately includes the
  // subscription's UUID, so a short marker like 'a1' collides with any random
  // UUID containing those hex chars (a ~11%-flaky false positive). 'AUTHMARK'
  // uses non-hex letters, so it can never appear in a UUID.
  await db.insert(pushSubscriptions).values([
    { accountId, endpoint: LIVE, keys: { p256dh: 'p1', auth: 'AUTHMARK1' } },
    { accountId, endpoint: DEAD, keys: { p256dh: 'p2', auth: 'AUTHMARK2' } },
  ]);
  sendNotification.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('sendPush', () => {
  it('fans the serialized payload out to every subscription', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const result = await sendPush(accountId, payload);

    expect(result).toEqual({ sent: 2, removed: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification.mock.calls[0][1]).toBe(JSON.stringify(payload));
  });

  it('deletes a subscription the push service reports as gone (410)', async () => {
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === DEAD) throw new WebPushError('gone', 410);
      return { statusCode: 201 };
    });

    const result = await sendPush(accountId, payload);
    expect(result).toEqual({ sent: 1, removed: 1 });

    const remaining = await db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.accountId, accountId));
    expect(remaining).toEqual([{ endpoint: LIVE }]);
  });

  it('keeps the subscription on a transient (non-410) failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === DEAD) throw new WebPushError('boom', 500);
      return { statusCode: 201 };
    });

    const result = await sendPush(accountId, payload);
    expect(result).toEqual({ sent: 1, removed: 0 });

    const rows = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.accountId, accountId));
    expect(rows).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
  });

  it('never logs endpoint URLs or subscription keys', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];
    sendNotification.mockRejectedValue(new WebPushError('boom', 500));

    await sendPush(accountId, payload);

    const logged = spies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => JSON.stringify(args))
      .join(' ');
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain('AUTHMARK');
    expect(logged).not.toContain('p256dh');
  });
});
