import { GRAPH_BASE, GRAPH_VERSION } from './constants';
import { GraphApiError } from './errors';

/** Build a versioned Graph API URL from a path like `123/messages` or `oauth/access_token`. */
export function graphUrl(path: string): string {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${clean}`;
}

type GraphFetchOptions = {
  /** Bearer token. Set on the Authorization header — never logged. */
  token?: string;
  method?: 'GET' | 'POST' | 'DELETE';
  searchParams?: Record<string, string>;
  body?: unknown;
};

type GraphErrorBody = { error?: { message?: string; code?: number; error_subcode?: number } };

/**
 * Single choke point for Graph API calls. Sets the bearer header, parses JSON,
 * and throws {@link GraphApiError} on any non-2xx. Uses global `fetch` so tests
 * stub it via `vi.stubGlobal('fetch', ...)`. Never logs the token or the URL
 * (the token-exchange URL carries the app secret in its query string).
 */
export async function graphFetch<T = unknown>(
  path: string,
  options: GraphFetchOptions = {},
): Promise<T> {
  const { token, method = 'GET', searchParams, body } = options;

  const url = new URL(graphUrl(path));
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = {};
    }
  }

  if (!res.ok) {
    const err = (json as GraphErrorBody).error;
    throw new GraphApiError({
      status: res.status,
      code: err?.code,
      subcode: err?.error_subcode,
      message: err?.message ?? `Graph API request failed (${res.status})`,
    });
  }

  return json as T;
}
