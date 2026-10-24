import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, recordMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  recordMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));
vi.mock('@/lib/onboarding/funnel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/onboarding/funnel')>()),
  recordOnboardingEvent: recordMock,
}));

import { POST } from '../route';

const post = (body: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/onboarding/shown', {
      method: 'POST',
      body,
      headers,
    }),
  );

beforeEach(() => {
  getUserMock.mockReset();
  recordMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  recordMock.mockResolvedValue(undefined);
});

describe('POST /api/onboarding/shown', () => {
  it('records a shown event for the session account and returns 204', async () => {
    const res = await post(JSON.stringify({ screen: 'services' }));
    expect(res.status).toBe(204);
    expect(recordMock).toHaveBeenCalledWith('user-1', 'services', 'shown');
  });

  it('ignores an account id in the body', async () => {
    await post(JSON.stringify({ screen: 'intro', accountId: 'attacker' }));
    expect(recordMock).toHaveBeenCalledWith('user-1', 'intro', 'shown');
  });

  it.each([
    ['an oversize body', JSON.stringify({ screen: 'intro', pad: 'x'.repeat(2000) })],
    ['non-JSON', 'not json'],
    ['an unknown screen', JSON.stringify({ screen: 'billing' })],
    ['a missing screen', JSON.stringify({})],
  ])('%s: no write, still 204', async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(204);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('an oversize content-length is dropped before reading', async () => {
    const res = await post(JSON.stringify({ screen: 'intro' }), {
      'content-length': '5000',
    });
    expect(res.status).toBe(204);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('no session: no write, still 204', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await post(JSON.stringify({ screen: 'intro' }));
    expect(res.status).toBe(204);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('an error inside still returns 204', async () => {
    getUserMock.mockRejectedValue(new Error('boom'));
    const res = await post(JSON.stringify({ screen: 'intro' }));
    expect(res.status).toBe(204);
  });
});
