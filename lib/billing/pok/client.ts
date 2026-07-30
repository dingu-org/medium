/**
 * POK SDK API client (Phase 16 C5). A factory (not a module-global singleton) so
 * each caller — and every test — closes over its own in-memory token cache and a
 * fresh instance can be created without cross-test bleed.
 *
 * Contract notes (see docs.pokpay.io/llms-full.txt and the smoke-pok.ts spike):
 *  - Auth is `POST /auth/sdk/login` with {keyId, keySecret}; the bearer token is
 *    cached in memory and re-used until it nears expiry.
 *  - `expiresIn` is documented in seconds; we tolerate a ms value too.
 *  - Amounts are sent in MINOR units — payments.ts owns the ALL→minor factor.
 *
 * Nothing outside lib/billing/ may import this module. payments.ts is the only
 * boundary; scripts/smoke-pok.ts is the one sanctioned dev-tool exception.
 *
 * Never log keySecret, accessToken, or full request/response payloads. The typed
 * errors below carry only {status, pokErrorCode}; getOrder logging (at the
 * boundary) is limited to {orderId, status, pokErrorCode}.
 */
import {
  createOrderResponseSchema,
  getOrderResponseSchema,
  loginResponseSchema,
  type LoginResponse,
  type PokOrder,
} from './types';

export type { PokOrder } from './types';

export class PokError extends Error {
  readonly status?: number;
  readonly pokErrorCode?: string;
  constructor(
    message: string,
    opts: { status?: number; pokErrorCode?: string } = {},
  ) {
    super(message);
    this.name = 'PokError';
    this.status = opts.status;
    this.pokErrorCode = opts.pokErrorCode;
  }
}

/** Login failed, or an authorized request stayed 401 after one forced re-login. */
export class PokAuthError extends PokError {
  constructor(
    message: string,
    opts: { status?: number; pokErrorCode?: string } = {},
  ) {
    super(message, opts);
    this.name = 'PokAuthError';
  }
}

/** GET /sdk-orders/{id} returned 404 — the order id is unknown to POK. */
export class PokNotFoundError extends PokError {
  constructor(
    message: string,
    opts: { status?: number; pokErrorCode?: string } = {},
  ) {
    super(message, opts);
    this.name = 'PokNotFoundError';
  }
}

export type PokClientConfig = {
  apiBase: string;
  merchantId: string;
  keyId: string;
  keySecret: string;
  /** Per-request deadline; see POK_REQUEST_TIMEOUT_MS. */
  requestTimeoutMs?: number;
};

/**
 * Node's fetch has no default timeout worth the name (~300s per request), and
 * the reconcile cron polls up to SCAN_LIMIT orders sequentially every hour: one
 * degraded POK response would push a single run past its own window, and the
 * cron's `concurrency: 1` then silently drops the next hour's run. Every POK
 * call is therefore bounded.
 */
const POK_REQUEST_TIMEOUT_MS = 10_000;

export type CreateOrderArgs = {
  amountMinor: number;
  /** Currency code (e.g. 'ALL'); sent to POK as the required `currencyCode`. */
  currency: string;
  /** Spike-confirmed optional params (description, ...) spread into the request
   *  body. Only pass fields the smoke spike showed POK accepts. */
  extra?: Record<string, unknown>;
};

export type PokClient = {
  login(): Promise<LoginResponse['data']>;
  createOrder(args: CreateOrderArgs): Promise<{ id: string; confirmUrl?: string }>;
  getOrder(id: string): Promise<PokOrder>;
  captureOrder(id: string): Promise<void>;
};

async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/** Best-effort extraction of a POK error code — never throws, never leaks PII. */
function extractPokErrorCode(json: unknown): string | undefined {
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const nested = o.error as Record<string, unknown> | undefined;
    const code = o.errorCode ?? o.code ?? nested?.code ?? o.statusCode;
    if (typeof code === 'string' || typeof code === 'number') return String(code);
  }
  return undefined;
}

export function createPokClient(config: PokClientConfig): PokClient {
  const apiBase = config.apiBase.replace(/\/+$/, '');
  const { merchantId, keyId, keySecret } = config;
  const timeoutMs = config.requestTimeoutMs ?? POK_REQUEST_TIMEOUT_MS;

  /** fetch with the per-request deadline; a timeout surfaces as a PokError. */
  async function pokFetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new PokError(`POK request timed out after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  // Private per-instance state. `expiresAtMs` is already skew-adjusted so the
  // reuse check is a plain `now < expiresAtMs`. `loginInFlight` collapses
  // concurrent callers onto a single login round-trip.
  let tokenCache: { token: string; expiresAtMs: number } | null = null;
  let loginInFlight: Promise<LoginResponse['data']> | null = null;

  async function performLogin(): Promise<LoginResponse['data']> {
    const res = await pokFetch(`${apiBase}/auth/sdk/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId, keySecret }),
    });
    const json = await readJsonSafe(res);
    if (!res.ok) {
      throw new PokAuthError('POK SDK login failed', {
        status: res.status,
        pokErrorCode: extractPokErrorCode(json),
      });
    }
    const { data } = loginResponseSchema.parse(json);
    // `expiresIn` > one day almost certainly means the value is already in ms.
    const ttlMs = data.expiresIn > 86_400 ? data.expiresIn : data.expiresIn * 1000;
    const skew = Math.min(60_000, ttlMs * 0.1);
    tokenCache = { token: data.accessToken, expiresAtMs: Date.now() + ttlMs - skew };
    return data;
  }

  async function ensureToken(): Promise<string> {
    if (tokenCache && Date.now() < tokenCache.expiresAtMs) return tokenCache.token;
    if (!loginInFlight) {
      loginInFlight = performLogin().finally(() => {
        loginInFlight = null;
      });
    }
    return (await loginInFlight).accessToken;
  }

  // Bearer-authorized request. On 401, clear the cache, force one re-login, and
  // retry exactly once (the `retried` flag prevents an infinite loop); a second
  // 401 surfaces as PokAuthError. All other statuses are returned to the caller.
  async function authorizedRequest(
    path: string,
    init: RequestInit,
    retried = false,
  ): Promise<Response> {
    const token = await ensureToken();
    const res = await pokFetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 401) {
      if (!retried) {
        tokenCache = null;
        return authorizedRequest(path, init, true);
      }
      throw new PokAuthError('POK authorization failed after re-login', {
        status: 401,
        pokErrorCode: extractPokErrorCode(await readJsonSafe(res)),
      });
    }
    return res;
  }

  async function createOrder(
    args: CreateOrderArgs,
  ): Promise<{ id: string; confirmUrl?: string }> {
    const res = await authorizedRequest(`/merchants/${merchantId}/sdk-orders`, {
      method: 'POST',
      body: JSON.stringify({
        amount: args.amountMinor,
        // POK requires `currencyCode` (NOT `currency`) and a required
        // `autoCapture` flag — `true` captures in a single flow, which is right
        // for one-off prepaid and avoids a separate AUTHORIZED→capture step.
        // Confirmed by the smoke-pok staging spike.
        currencyCode: args.currency,
        autoCapture: true,
        ...args.extra,
      }),
    });
    const json = await readJsonSafe(res);
    if (!res.ok) {
      throw new PokError('POK create order failed', {
        status: res.status,
        pokErrorCode: extractPokErrorCode(json),
      });
    }
    const sdkOrder = createOrderResponseSchema.parse(json).data.sdkOrder;
    return { id: sdkOrder.id, confirmUrl: sdkOrder._self?.confirmUrl };
  }

  async function getOrder(id: string): Promise<PokOrder> {
    const res = await authorizedRequest(`/sdk-orders/${id}`, { method: 'GET' });
    const json = await readJsonSafe(res);
    if (res.status === 404) {
      throw new PokNotFoundError('POK order not found', {
        status: 404,
        pokErrorCode: extractPokErrorCode(json),
      });
    }
    if (!res.ok) {
      throw new PokError('POK get order failed', {
        status: res.status,
        pokErrorCode: extractPokErrorCode(json),
      });
    }
    return getOrderResponseSchema.parse(json).data.sdkOrder;
  }

  async function captureOrder(id: string): Promise<void> {
    const res = await authorizedRequest(
      `/merchants/${merchantId}/sdk-orders/${id}/capture`,
      { method: 'POST' },
    );
    if (!res.ok) {
      throw new PokError('POK capture order failed', {
        status: res.status,
        pokErrorCode: extractPokErrorCode(await readJsonSafe(res)),
      });
    }
  }

  return { login: performLogin, createOrder, getOrder, captureOrder };
}
