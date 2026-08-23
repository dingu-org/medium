/**
 * Structured JSON logger for the MVP observability baseline (Phase 11).
 *
 * There is no dedicated log platform: we emit one `JSON.stringify` line per
 * event to the level-mapped `console` fn, and rely on Vercel + Supabase log
 * ingestion + filtering. The standard line shape is:
 *
 *   { timestamp, level, trace_id?, account_id?, conversation_id?, event_name, message, ...attrs }
 *
 * The envelope keys (timestamp/level/trace_id/account_id/conversation_id/event_name/
 * message) are structural (uuids or the log discriminator) and are NEVER passed
 * through PII redaction. Only the caller-supplied `attrs` object is redacted.
 * `attrs` may carry `trace_id`/`account_id`/`conversation_id`, which are promoted
 * into the envelope (and therefore not redacted).
 *
 * NEVER log tokens, phone numbers, customer names, or message bodies. Redaction
 * is enforced here (see REDACT_KEY_RE + the E.164 value scrubber) as a backstop,
 * but callers should still pass ids/counts only.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = {
  trace_id?: string;
  account_id?: string;
  conversation_id?: string;
};

export type Logger = {
  debug(eventName: string, message: string, attrs?: Record<string, unknown>): void;
  info(eventName: string, message: string, attrs?: Record<string, unknown>): void;
  warn(eventName: string, message: string, attrs?: Record<string, unknown>): void;
  error(eventName: string, message: string, attrs?: Record<string, unknown>): void;
};

/**
 * Keys whose values must be redacted from structured log payloads. Matches
 * substrings case-insensitively, so `phoneNumber`, `customerName`, `authToken`,
 * `p256dh`, etc. are all caught.
 */
export const REDACT_KEY_RE =
  /phone|name|body|content|notes|email|token|secret|key|authorization|endpoint|p256dh|auth/i;

/**
 * Keys that match REDACT_KEY_RE (via `name`/`phone`) but are deliberately
 * non-PII and must survive redaction: the log discriminator, the thrown
 * error's class name, and Meta's business identifiers (template name and
 * phone_number_id — a WABA asset id, not a customer phone number).
 */
export const REDACT_ALLOWLIST: ReadonlySet<string> = new Set([
  'event_name',
  'errorName',
  'template_name',
  'templateName',
  'phone_number_id',
  'phoneNumberId',
]);

/** Scrub E.164 phone numbers (`+` followed by 7-15 digits) out of any string. */
function valueScrub(s: string): string {
  return s.replace(/\+\d{7,15}/g, '[REDACTED]');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively redact a value for logging. Exported only for unit tests.
 * - Object own-keys matching REDACT_KEY_RE (and not allowlisted) → '[REDACTED]'.
 * - Other keys recurse into their value.
 * - Arrays recurse per element.
 * - Surviving strings are E.164-scrubbed.
 * - Non-plain objects (Error, Date, ...) are coerced to string then scrubbed.
 */
export function redactAttrs(input: unknown): unknown {
  if (typeof input === 'string') return valueScrub(input);
  if (Array.isArray(input)) return input.map((item) => redactAttrs(item));
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input)) {
      if (REDACT_KEY_RE.test(key) && !REDACT_ALLOWLIST.has(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactAttrs(input[key]);
      }
    }
    return out;
  }
  // Non-plain objects (Error, Date, Map, ...): coerce then scrub.
  if (typeof input === 'object' && input !== null) {
    return valueScrub(String(input));
  }
  // Primitives (number, boolean, bigint, null, undefined, symbol) pass through.
  return input;
}

export function serializeError(
  err: unknown,
  opts?: { debug?: boolean },
): { errorName: string; errorMessage: string; stack?: string } {
  const errorName = err instanceof Error ? err.name : typeof err;
  const errorMessage = valueScrub(
    err instanceof Error ? err.message : String(err),
  );
  const result: { errorName: string; errorMessage: string; stack?: string } = {
    errorName,
    errorMessage,
  };
  if (opts?.debug === true && err instanceof Error && err.stack) {
    result.stack = err.stack;
  }
  return result;
}

export function newTraceId(): string {
  return crypto.randomUUID();
}

type Envelope = {
  timestamp: string;
  level: LogLevel;
  event_name: string;
  message: string;
} & LogContext &
  Record<string, unknown>;

const CONTEXT_KEYS = ['trace_id', 'account_id', 'conversation_id'] as const;

/**
 * Split caller attrs into the context keys to promote onto the envelope
 * (unredacted) and the remaining attrs to redact.
 */
function splitContext(attrs?: Record<string, unknown>): {
  context: LogContext;
  rest: Record<string, unknown>;
} {
  if (!attrs) return { context: {}, rest: {} };
  const context: LogContext = {};
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if ((CONTEXT_KEYS as readonly string[]).includes(key)) {
      const value = attrs[key];
      if (value !== undefined) {
        (context as Record<string, unknown>)[key] = value;
      }
    } else {
      rest[key] = attrs[key];
    }
  }
  return { context, rest };
}

function emit(
  level: LogLevel,
  base: LogContext,
  eventName: string,
  message: string,
  attrs?: Record<string, unknown>,
): void {
  const { context, rest } = splitContext(attrs);
  // Attrs spread first so the envelope keys always win — an attr named
  // `event_name`/`message`/`level` must never overwrite the discriminator.
  const line: Envelope = {
    ...(redactAttrs(rest) as Record<string, unknown>),
    timestamp: new Date().toISOString(),
    level,
    ...base,
    ...context,
    event_name: eventName,
    message,
  };
  const serialized = JSON.stringify(line);
  // debug → console.log; info/warn/error map to the same-named console fn.
  if (level === 'debug') console.log(serialized);
  else if (level === 'info') console.info(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.error(serialized);
}

export function createLogger(base: LogContext = {}): Logger {
  const frozenBase = Object.freeze({ ...base });
  return {
    debug: (eventName, message, attrs) =>
      emit('debug', frozenBase, eventName, message, attrs),
    info: (eventName, message, attrs) =>
      emit('info', frozenBase, eventName, message, attrs),
    warn: (eventName, message, attrs) =>
      emit('warn', frozenBase, eventName, message, attrs),
    error: (eventName, message, attrs) =>
      emit('error', frozenBase, eventName, message, attrs),
  };
}

export const logger: Logger = createLogger();

export default logger;
