import { t } from '@/lib/i18n';
import { SignInForm } from './form';

export const metadata = { title: `${t.auth.signIn.title} · ${t.appName}` };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ confirm?: string; error?: string; reset?: string }>;
}) {
  const { confirm, error, reset } = await searchParams;
  return (
    <section>
      <header className="mb-7 text-center">
        <h1 className="text-2xl font-semibold">{t.auth.signIn.title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {t.auth.signIn.subtitle}
        </p>
      </header>
      <SignInForm
        confirmHint={confirm === '1'}
        resetHint={reset === '1'}
        callbackError={error ? t.auth.errors.callbackFailed : null}
      />
    </section>
  );
}
