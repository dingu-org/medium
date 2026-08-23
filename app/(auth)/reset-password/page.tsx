import { redirect } from 'next/navigation';
import { hasRecoveryMarker } from '@/lib/auth/recovery';
import { t } from '@/lib/i18n';
import { createServerClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from './form';

export const metadata = { title: `${t.auth.reset.title} · ${t.appName}` };

export default async function ResetPasswordPage() {
  // Only reachable from a genuine recovery link (see lib/auth/recovery.ts).
  // Matches the action's check rather than merely testing for the cookie, so a
  // marker left behind on a shared device shows the sign-in page instead of a
  // form that would fail on submit.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await hasRecoveryMarker(user.id))) redirect('/sign-in');
  return (
    <section>
      <header className="mt-6 mb-6">
        <h1 className="font-heading text-[29px] leading-tight font-semibold tracking-[-0.03em]">{t.auth.reset.title}</h1>
        <p className="text-ink-2 mt-2 text-[14.5px] leading-normal">
          {t.auth.reset.subtitle}
        </p>
      </header>
      <ResetPasswordForm />
    </section>
  );
}
