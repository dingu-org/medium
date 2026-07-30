import { redirect } from 'next/navigation';
import { LandingPage } from '@/app/_landing/landing-page';
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
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  }
  if (typeof tokenHash === 'string' && tokenHash && typeof type === 'string') {
    redirect(
      `/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`,
    );
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/today');

  return <LandingPage />;
}
