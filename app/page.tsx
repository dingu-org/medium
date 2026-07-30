import { redirect } from 'next/navigation';
import { LandingPage } from '@/app/_landing/landing-page';
import { RESET_PASSWORD_PATH } from '@/lib/auth/recovery';
import { hasSupabaseConfig } from '@/lib/supabase/env';
import { createServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Medium — asistenti që rezervon takime në WhatsApp',
  description:
    'Medium bisedon me pacientët tuaj në WhatsApp, cakton takime dhe i mban orët tuaja të mbushura — ndërsa ju qëndroni në kontroll.',
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // GoTrue silently falls back to SITE_URL when an email link's `redirect_to`
  // is not in the project's allowlist, dropping a one-time auth token on `/`.
  // Nothing here would consume it and the token burns on click, so a PT whose
  // hosted allowlist is missing /auth/confirm would be locked out of password
  // reset entirely. Hand it to the route that knows how to redeem it.
  const { code, token_hash: tokenHash, type } = await searchParams;
  if (typeof code === 'string' && code) {
    // The fallback strips the original `redirect_to` and its `next`, so the
    // callback would default to /today, skip the recovery marker and burn the
    // one-time code — the exact lockout this guard exists to prevent. Assume
    // recovery: Google OAuth asks for `origin + /auth/callback`, the same host
    // as Site URL, so it never falls back here, and a signup confirmation that
    // did would merely be offered a password change.
    redirect(
      `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(RESET_PASSWORD_PATH)}`,
    );
  }
  if (typeof tokenHash === 'string' && tokenHash && typeof type === 'string') {
    redirect(
      `/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`,
    );
  }

  // Same reason middleware.ts lets the public paths through without a client:
  // NEXT_PUBLIC_* are inlined at build time and have gone missing from a build
  // before. Without them we cannot tell whether the visitor is signed in — that
  // is a reason to serve the marketing page, not to 500 on it.
  if (!hasSupabaseConfig()) return <LandingPage />;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/today');

  return <LandingPage />;
}
