import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPokClient } from '@/lib/billing/pok/client';

const CONFIG = {
  apiBase: 'https://pok.test',
  merchantId: 'm1',
  keyId: 'k1',
  keySecret: 's1',
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function loginBody(token: string, expiresIn = 3600) {
  return { data: { accessToken: token, expiresIn, tokenType: 'Bearer' } };
}

function isLoginCall(call: unknown[]): boolean {
  return String(call[0]).endsWith('/auth/sdk/login');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createPokClient', () => {
  it('caches the login token across calls (one login hit)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/auth/sdk/login')) return loginResponse();
      return jsonResponse(200, { data: { sdkOrder: { id: 'ord1' } } });
    });
    function loginResponse() {
      return jsonResponse(200, loginBody('tok'));
    }
    vi.stubGlobal('fetch', fetchMock);

    const client = createPokClient(CONFIG);
    await client.getOrder('ord1');
    await client.getOrder('ord1');

    const loginCalls = fetchMock.mock.calls.filter(isLoginCall);
    expect(loginCalls).toHaveLength(1);
  });

  it('re-fetches the token after it nears expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:00:00.000Z'));

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/auth/sdk/login')) {
        // expiresIn 100s → ttl 100_000ms, skew 10_000ms → reuse window 90_000ms.
        return jsonResponse(200, loginBody('tok', 100));
      }
      return jsonResponse(200, { data: { sdkOrder: { id: 'ord1' } } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createPokClient(CONFIG);
    await client.getOrder('ord1');
    expect(fetchMock.mock.calls.filter(isLoginCall)).toHaveLength(1);

    vi.advanceTimersByTime(95_000);
    await client.getOrder('ord1');
    expect(fetchMock.mock.calls.filter(isLoginCall)).toHaveLength(2);
  });

  it('re-logs in once and retries on a 401, then succeeds', async () => {
    let orderCalls = 0;
    let loginCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/auth/sdk/login')) {
        loginCount += 1;
        return jsonResponse(200, loginBody(`tok${loginCount}`));
      }
      orderCalls += 1;
      if (orderCalls === 1) return jsonResponse(401, { message: 'unauthorized' });
      return jsonResponse(200, {
        data: { sdkOrder: { id: 'ord1', isCaptured: true } },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createPokClient(CONFIG);
    const order = await client.getOrder('ord1');

    expect(order.isCaptured).toBe(true);
    expect(fetchMock.mock.calls.filter(isLoginCall)).toHaveLength(2);
    expect(orderCalls).toBe(2);
  });

  it('gives up on a POK request that never answers', async () => {
    // Node's fetch would sit on this for ~5 minutes. The hourly reconcile polls
    // its whole open set sequentially, so one hung request used to eat the run
    // (and `concurrency: 1` then drops the next hour's tick entirely).
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject((init.signal as AbortSignal).reason),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createPokClient({ ...CONFIG, requestTimeoutMs: 25 });

    await expect(client.getOrder('ord1')).rejects.toThrow(
      'POK request timed out after 25ms',
    );
  });

  it('sends amount + currencyCode + autoCapture in the create-order body', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/auth/sdk/login')) return jsonResponse(200, loginBody('tok'));
      return jsonResponse(200, { data: { sdkOrder: { id: 'neworder' } } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createPokClient(CONFIG);
    const created = await client.createOrder({
      amountMinor: 2500,
      currency: 'ALL',
      extra: { description: 'Medium Solo (monthly)' },
    });

    expect(created.id).toBe('neworder');
    const createCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith('/merchants/m1/sdk-orders'),
    ) as unknown as [string, RequestInit] | undefined;
    expect(createCall).toBeDefined();
    const init = createCall![1];
    const body = JSON.parse(init.body as string);
    // POK requires `currencyCode` (not `currency`) and `autoCapture`.
    expect(body).toMatchObject({
      amount: 2500,
      currencyCode: 'ALL',
      autoCapture: true,
      description: 'Medium Solo (monthly)',
    });
    expect(body.currency).toBeUndefined();
    // Bearer token attached.
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
  });
});
