import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { RECOVERY_COOKIE } from '@/lib/auth/recovery';
import { t } from '@/lib/i18n';
import { ResetPasswordForm } from './form';

export const metadata = { title: `${t.auth.reset.title} · ${t.appName}` };

export default async function ResetPasswordPage() {
  // Only reachable from a genuine recovery link (see lib/auth/recovery.ts).
  const store = await cookies();
  if (!store.get(RECOVERY_COOKIE)) redirect('/sign-in');
  return (
    <section>
      <header className="mt-6 mb-7">
        <h1 className="font-heading text-[29px] leading-tight font-semibold tracking-[-0.03em]">{t.auth.reset.title}</h1>
        <p className="text-ink-2 mt-2 text-[14.5px] leading-normal">
          {t.auth.reset.subtitle}
        </p>
      </header>
      <ResetPasswordForm />
    </section>
  );
}
