import { afterEach, describe, it, expect, vi } from 'vitest';
import { GRAPH_VERSION } from '../constants';
import { GraphApiError } from '../errors';
import { graphFetch, graphUrl } from '../graph';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('graphUrl', () => {
  it('builds a versioned URL', () => {
    expect(graphUrl('123/messages')).toBe(
      `https://graph.facebook.com/${GRAPH_VERSION}/123/messages`,
    );
  });

  it('tolerates a leading slash', () => {
    expect(graphUrl('/oauth/access_token')).toBe(
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
    );
  });
});

describe('graphFetch', () => {
  it('returns parsed JSON and sets the bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'abc' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await graphFetch<{ id: string }>('123', { token: 'secret-token' });

    expect(result).toEqual({ id: 'abc' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    expect(init.method).toBe('GET');
  });

  it('appends search params and serializes the body for POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await graphFetch('123/register', {
      method: 'POST',
      searchParams: { messaging_product: 'whatsapp' },
      body: { pin: '000000' },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect((url as URL).searchParams.get('messaging_product')).toBe('whatsapp');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ pin: '000000' }));
  });

  it('throws GraphApiError carrying Meta status/code/subcode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, {
        error: { message: 'Invalid OAuth access token', code: 190, error_subcode: 463 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const err = (await graphFetch('123').catch((e) => e)) as GraphApiError;
    expect(err).toBeInstanceOf(GraphApiError);
    expect(err.status).toBe(401);
    expect(err.code).toBe(190);
    expect(err.subcode).toBe(463);
    expect(err.isAuthError).toBe(true);
  });

  it('throws GraphApiError even when the body has no error object', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const err = (await graphFetch('123').catch((e) => e)) as GraphApiError;
    expect(err).toBeInstanceOf(GraphApiError);
    expect(err.status).toBe(500);
    expect(err.isAuthError).toBe(false);
  });
});
