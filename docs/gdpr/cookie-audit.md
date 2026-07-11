# Cookie audit

Grep-verified inventory of every cookie the app sets, as of Phase 10. All
three are **first-party** and functionally necessary — there are no
third-party, analytics, advertising, or tracking cookies anywhere in the
current codebase.

| Cookie | Set by | Purpose | Lifetime | HttpOnly | Notes |
|---|---|---|---|---|---|
| `sb-*` (Supabase auth cookies) | `lib/supabase/server.ts` (via `@supabase/ssr`) | Authenticated session (access/refresh tokens) | Session-managed by Supabase Auth | Yes | Required for any signed-in functionality; standard Supabase SSR cookie set, not app-authored. |
| `onboarding_skipped` | `app/onboarding/actions.ts` (constant in `app/onboarding/constants.ts`) | Lets a PT skip onboarding steps and reach Settings directly, without re-prompting the onboarding gate on every load | Not explicitly time-bounded in code — persists until cleared/overwritten | Not verified as HttpOnly in this audit — functional preference only, no PII | Purely a UI-flow preference; carries no patient data. |
| `pw-recovery` | `app/auth/callback/route.ts` (constant `RECOVERY_COOKIE` in `lib/auth/recovery.ts`) | Marks a session as a genuine password-recovery flow so `/reset-password` accepts the request; prevents an already-authenticated session on a shared device from silently resetting the password outside the recovery link flow | 600 seconds (10 minutes), deleted immediately on successful reset | Yes | `secure` in production, `sameSite: 'lax'`. This is an honest addition beyond the phase spec's original two-cookie assumption — found via grep, documented here for completeness. |

## What we do NOT set

- No third-party analytics (Sentry and PostHog are explicitly skipped for MVP
  per the 2026-05-06 decisions log — free-tier limits exhausted; the app uses
  structured platform logs instead).
- No advertising/marketing pixels.
- No cross-site tracking cookies of any kind on the marketing/public pages
  (`/`, `/privacy`, `/terms`, `/sign-in`, `/sign-up`).

## Consent posture

Given the current inventory is limited to strictly-necessary first-party
cookies (session auth, a UI-flow preference, and a short-lived security gate),
no cookie-consent banner is required under the ePrivacy "strictly necessary"
exemption. If a third-party analytics or marketing cookie is ever introduced,
this document and the consent posture must be revisited before that change
ships.

## How this was verified

`grep -rn "cookies()\|\.set(\|Set-Cookie" app/ lib/` was walked manually
against every match to confirm each cookie's setter, purpose, and lifetime
match this table. Re-run the same grep sweep whenever cookie-setting code
changes, to keep this document accurate rather than aspirational.
