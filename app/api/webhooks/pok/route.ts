import { type NextRequest } from 'next/server';
import { applyOrderOutcome } from '@/lib/billing/payments';
import { createLogger, newTraceId, serializeError } from '@/lib/log';

/**
 * POK payment webhook (Phase 16 C5) — a TRIGGER ONLY. A forged or replayed call
 * must be harmless: we never trust the body, we only pull an order id from it and
 * hand that to applyOrderOutcome, which RE-FETCHES the authoritative order from
 * POK before doing anything. Settlement is idempotent, so a double webhook + a
 * concurrent redirect cannot double-extend.
 *
 * We import ONLY lib/billing/payments (the boundary) — never lib/billing/pok/.
 *
 * POK's webhook contract (payload shape, any signature header) is undocumented
 * and the staging spike could not authenticate to observe a real delivery, so
 * there is no signature check yet — authenticity comes entirely from the
 * server-side getOrder re-fetch. TODO(spike): if a confirmed delivery reveals a
 * signature header, add verification isolated to this file.
 *
 * Any processing failure still returns 200: the hourly reconcile cron is the
 * retry net, so we never ask POK to redeliver (and never leak internal state).
 */
export const runtime = 'nodejs';

/** Pull an order id from POK's (undocumented) payload across candidate fields. */
function extractOrderId(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : undefined;
  const candidates = [data?.id, data?.orderId, root.orderId, root.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const trace_id = req.headers.get('x-request-id') ?? newTraceId();
  const log = createLogger({ trace_id });

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    log.warn('pok_webhook.invalid_json', 'Rejected: invalid JSON payload');
    return new Response('Bad payload', { status: 400 });
  }

  const orderId = extractOrderId(json);
  if (!orderId) {
    log.warn('pok_webhook.no_order_id', 'POK webhook carried no recognizable order id');
    return new Response('EVENT_RECEIVED', { status: 200 });
  }

  try {
    const result = await applyOrderOutcome(orderId);
    log.info('pok_webhook.processed', 'POK webhook processed', {
      order_id: orderId,
      result,
    });
  } catch (error) {
    // getOrder network/5xx (or any settle error): swallow and 200. The reconcile
    // cron will retry this order until it settles or expires.
    log.error(
      'pok_webhook.apply_failed',
      'POK webhook settle failed; reconcile cron will retry',
      { order_id: orderId, ...serializeError(error) },
    );
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
}
