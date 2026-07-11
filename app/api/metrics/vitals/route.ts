import { logger } from '@/lib/log';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 1024;
const ALLOWED_METRICS = new Set(['LCP', 'CLS', 'FCP', 'TTFB', 'INP', 'FID']);

/**
 * Unauthenticated, non-amplifiable sink for sampled Web Vitals beacons
 * (`components/web-vitals-reporter.tsx`). Always returns 204 — a rejected
 * beacon isn't worth surfacing to the browser, and giving attackers a
 * distinguishing response code would only help probe the endpoint. Body size
 * is capped and the metric name is allowlisted so a malformed/oversized/
 * unknown payload is dropped before anything is logged.
 */
export async function POST(req: Request): Promise<Response> {
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 204 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return new Response(null, { status: 204 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 204 });
  }

  if (parsed && typeof parsed === 'object') {
    const { name, value, path } = parsed as Record<string, unknown>;
    const metric = typeof name === 'string' ? name : null;
    const numericValue = typeof value === 'number' ? value : Number(value);

    if (
      metric &&
      ALLOWED_METRICS.has(metric) &&
      Number.isFinite(numericValue)
    ) {
      logger.info('web_vitals', 'Web vital reported', {
        metric,
        value: numericValue,
        path: typeof path === 'string' ? path : undefined,
      });
    }
  }

  return new Response(null, { status: 204 });
}
