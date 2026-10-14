/**
 * The Embedded Signup v4 wire protocol: what Meta's popup posts back, and what
 * we are allowed to conclude from it. Kept out of the React component so both
 * test projects can exercise it and so the trust boundary (which origins, which
 * events) reads as one thing.
 *
 * See docs/whatsapp/embedded-signup-v4-setup.md for the sourced event table.
 */

/**
 * Exact origins Meta's Embedded Signup popup posts from. Meta's own sample uses
 * `event.origin.endsWith('facebook.com')`, which also matches
 * `https://evilfacebook.com` and `https://notfacebook.com` — and nothing else
 * here authenticates the IDs the message carries, so a lookalike origin could
 * hand us a forged phone_number_id/waba_id and we would POST it. Compare the
 * whole origin instead.
 */
export const META_SIGNUP_ORIGINS: readonly string[] = [
  'https://www.facebook.com',
  'https://web.facebook.com',
  'https://business.facebook.com',
];

/** What the popup told us, captured out of band from the FB.login auth code. */
export type SignupSession = {
  event?: string;
  phoneNumberId?: string;
  wabaId?: string;
};

/**
 * Connection mode implied by the popup's finish event. Events missing from this
 * table — `FINISH_OBO_MIGRATION` (a number moved from another partner) and
 * `FINISH_GRANT_ONLY_API_ACCESS` — are outcomes we have no onboarding for, so
 * they yield no mode and surface the "incomplete" card rather than being
 * guessed into a connection.
 *
 * `FINISH_ONLY_WABA` is deliberately mapped to `cloud_api`: it is the standard
 * flow stopped short of sharing a number, not coexistence. It therefore trips
 * the same "cloud_api needs a phone number" precondition as any other numberless
 * cloud_api finish — one rule, no special case — which is the exact rule the
 * server enforces in app/api/auth/meta-embedded/route.ts.
 */
const MODE_BY_FINISH_EVENT: Readonly<
  Record<string, 'cloud_api' | 'coexistence'>
> = {
  FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING: 'coexistence',
  FINISH: 'cloud_api',
  FINISH_ONLY_WABA: 'cloud_api',
};

/**
 * Parse one popup message. Returns the session to remember, or `null` when the
 * message is not a finish notice we should act on. Only `FINISH*` events are
 * captured, so a later message cannot clobber a completed signup's IDs.
 */
export function readSignupMessage(event: {
  origin: string;
  data: unknown;
}): SignupSession | null {
  if (!META_SIGNUP_ORIGINS.includes(event.origin)) return null;
  let data: {
    type?: string;
    event?: string;
    data?: Record<string, unknown>;
  };
  try {
    data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch {
    return null; // non-JSON message — ignore
  }
  if (data?.type !== 'WA_EMBEDDED_SIGNUP') return null;
  if (typeof data.event !== 'string' || !data.event.startsWith('FINISH')) {
    return null;
  }
  return {
    event: data.event,
    phoneNumberId: data.data?.phone_number_id as string | undefined,
    wabaId: data.data?.waba_id as string | undefined,
  };
}

/**
 * The mode to POST for a captured session, or `null` when the signup cannot be
 * completed. A connection needs a WABA, a finish event we support, and — for
 * every mode but coexistence — the number the popup should have carried.
 * Coexistence is the one flow that legitimately arrives without one: the server
 * resolves it from `GET /<waba_id>/phone_numbers`. Refusing here means we do not
 * burn the one-time auth code on a POST the server would reject anyway, and the
 * PT sees the accurate "connection stayed half-done" card instead of an error
 * that blames Meta.
 */
export function postableMode(
  session: SignupSession,
): 'cloud_api' | 'coexistence' | null {
  const mode = session.event ? MODE_BY_FINISH_EVENT[session.event] : undefined;
  if (!mode || !session.wabaId) return null;
  if (mode !== 'coexistence' && !session.phoneNumberId) return null;
  return mode;
}

/**
 * Diagnostics. The browser half of Embedded Signup is otherwise invisible to
 * the server: a missing auth code, a finish message that never arrived, a
 * message from an origin we refuse — none of them cause a request. Everything
 * below builds the PII-free trail the client reports to
 * /api/auth/meta-embedded/diagnostics. IDs are reduced to "present or not" and
 * the auth code never appears.
 */

/** Cap on the popup-message summaries one attempt reports. */
export const MAX_SIGNUP_MESSAGE_SUMMARIES = 20;
const MAX_DIAGNOSTIC_TEXT = 200;

/** One popup message, reduced to what is safe and useful to store. */
export type SignupMessageSummary = {
  origin: string;
  /** Whether {@link readSignupMessage} would have trusted this origin. */
  originAccepted: boolean;
  type?: string;
  event?: string;
  hasNumberId: boolean;
  hasWabaId: boolean;
  /** Meta's CANCEL payload: the screen the popup was abandoned on. */
  currentStep?: string;
  /** Meta's error-report payload. */
  errorId?: string;
  errorMessage?: string;
};

function clip(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  return String(value).slice(0, MAX_DIAGNOSTIC_TEXT);
}

/**
 * Summarise one window message for the diagnostic trail, or `null` when it is
 * unrelated noise (extensions, the FB SDK's own cross-domain chatter).
 * Deliberately wider than {@link readSignupMessage}: CANCEL and error events,
 * and messages from an origin we refuse, are exactly what explains a signup
 * that "finished" in the popup and never reached us.
 */
export function describeSignupMessage(event: {
  origin: string;
  data: unknown;
}): SignupMessageSummary | null {
  let data: unknown = event.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  const payload =
    typeof data === 'object' && data !== null
      ? (data as { type?: unknown; event?: unknown; data?: unknown })
      : {};
  const isSignupPayload = payload.type === 'WA_EMBEDDED_SIGNUP';
  const originAccepted = META_SIGNUP_ORIGINS.includes(event.origin);
  // The SDK posts plenty of unrelated messages; keep signup payloads only —
  // from any origin, since a refused origin is itself the finding.
  if (!isSignupPayload) return null;
  const inner =
    typeof payload.data === 'object' && payload.data !== null
      ? (payload.data as Record<string, unknown>)
      : {};
  return {
    origin: event.origin.slice(0, MAX_DIAGNOSTIC_TEXT),
    originAccepted,
    type: clip(payload.type),
    event: clip(payload.event),
    hasNumberId: Boolean(inner.phone_number_id),
    hasWabaId: Boolean(inner.waba_id),
    currentStep: clip(inner.current_step),
    errorId: clip(inner.error_id ?? inner.error_code),
    errorMessage: clip(inner.error_message),
  };
}

/** Why a finished popup could not be turned into a callback POST. */
export type SignupRefusal =
  | 'cancelled_by_user'
  | 'no_code'
  | 'no_finish_message'
  | 'unsupported_event'
  | 'missing_waba'
  | 'missing_number';

/**
 * Name the reason a popup result is not postable, or `null` when it is. Mirrors
 * {@link postableMode} branch for branch — the UI shows one "half-done" card
 * for all of these, so this is the only place the cause is told apart.
 */
export function classifySignupRefusal(args: {
  cancelled: boolean;
  hasCode: boolean;
  session: SignupSession;
}): SignupRefusal | null {
  if (args.cancelled) return 'cancelled_by_user';
  if (!args.hasCode) return 'no_code';
  const { session } = args;
  if (!session.event) return 'no_finish_message';
  const mode = MODE_BY_FINISH_EVENT[session.event];
  if (!mode) return 'unsupported_event';
  if (!session.wabaId) return 'missing_waba';
  if (mode !== 'coexistence' && !session.phoneNumberId) return 'missing_number';
  return null;
}
