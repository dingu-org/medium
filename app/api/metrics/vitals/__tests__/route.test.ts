import { describe, expect, it, vi } from 'vitest';

const infoSpy = vi.hoisted(() => vi.fn());
vi.mock('@/lib/log', () => ({
  logger: { info: infoSpy, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';

function makePost(body: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/metrics/vitals', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('POST /api/metrics/vitals', () => {
  it('logs a known metric and returns 204', async () => {
    const res = await POST(
      makePost(JSON.stringify({ name: 'LCP', value: 1234.5, path: '/today' })),
    );
    expect(res.status).toBe(204);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      'web_vitals',
      'Web vital reported',
      { metric: 'LCP', value: 1234.5, path: '/today' },
    );
  });

  it('drops an unknown metric name without logging', async () => {
    infoSpy.mockClear();
    const res = await POST(
      makePost(JSON.stringify({ name: 'NOT_A_METRIC', value: 1, path: '/x' })),
    );
    expect(res.status).toBe(204);
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('drops a non-finite value without logging', async () => {
    infoSpy.mockClear();
    const res = await POST(
      makePost(JSON.stringify({ name: 'CLS', value: 'nope', path: '/x' })),
    );
    expect(res.status).toBe(204);
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('rejects an oversized body via content-length without logging', async () => {
    infoSpy.mockClear();
    const res = await POST(
      makePost(JSON.stringify({ name: 'LCP', value: 1, path: '/x' }), {
        'content-length': String(2000),
      }),
    );
    expect(res.status).toBe(204);
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('returns 204 even for invalid JSON', async () => {
    const res = await POST(makePost('not json'));
    expect(res.status).toBe(204);
  });
});
