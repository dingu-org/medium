/**
 * Post-auth redirect targets. `next` reaches us from a query string or a form
 * field, so it is treated as untrusted: only same-origin paths are honoured and
 * anything else falls back to {@link DEFAULT_NEXT}.
 */
const DEFAULT_NEXT = '/today';

/**
 * A path we are willing to redirect to. Must be rooted at `/` and must not start
 * a host: `//evil.com` is protocol-relative, and `/\evil.com` resolves to
 * `https://evil.com` too because the WHATWG URL parser normalises a backslash to
 * a slash for http(s).
 */
export function isInternalPath(value: string): boolean {
  return /^\/[^/\\]/.test(value);
}

/** Sanitised `next` target, verified to resolve back to `origin`. */
export function safeNext(next: string | null, origin: string): string {
  if (!next || !isInternalPath(next)) return DEFAULT_NEXT;
  try {
    if (new URL(next, origin).origin !== origin) return DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }
  return next;
}
