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
      <header className="mt-6 mb-7">
        <h1 className="font-heading text-[29px] leading-tight font-semibold tracking-[-0.03em]">{t.auth.signIn.title}</h1>
        <p className="text-ink-2 mt-2 text-[14.5px] leading-normal">
          {t.auth.signIn.subtitle}
        </p>
      </header>
      <SignInForm
        confirmHint={confirm === '1'}
        resetHint={reset === '1'}
        callbackError={error ? t.auth.signIn.linkFailed : null}
      />
    </section>
  );
}
