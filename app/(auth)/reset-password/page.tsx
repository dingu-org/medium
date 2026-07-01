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
      <header className="mb-7 text-center">
        <h1 className="text-2xl font-semibold">{t.auth.reset.title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {t.auth.reset.subtitle}
        </p>
      </header>
      <ResetPasswordForm />
    </section>
  );
}
