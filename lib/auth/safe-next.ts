/**
 * Post-auth redirect targets. `next` reaches us from a query string or a form
 * field, so it is treated as untrusted: only same-origin paths are honoured and
 * anything else falls back to {@link DEFAULT_NEXT}.
 */
const DEFAULT_NEXT = '/today';

/**
 * Stand-in origin for the resolve check. Only the verdict matters — whether the
 * value stays on the origin it is resolved against — so any absolute origin the
 * app will never serve does the job.
 */
const PROBE_ORIGIN = 'https://internal.invalid';

/**
 * A path we are willing to redirect to. Must be rooted at `/`, must not start a
 * host, and must still resolve to its own origin once parsed.
 *
 * The shape test alone is not enough. `//evil.com` is protocol-relative and
 * `/\evil.com` resolves to `https://evil.com` because the WHATWG parser
 * normalises a backslash to a slash for http(s) — both are caught by the
 * pattern. But the parser also *strips* raw TAB, LF and CR from the input
 * before parsing, so `/\t/evil.com` passes any character-class test and still
 * resolves to `https://evil.com`; Node's header validation lets those bytes
 * into a Location header. Resolving is the check that holds.
 */
export function isInternalPath(value: string): boolean {
  if (!/^\/[^/\\]/.test(value)) return false;
  try {
    return new URL(value, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
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
