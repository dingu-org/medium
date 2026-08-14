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
