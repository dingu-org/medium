import { t } from '@/lib/i18n';
import { SignUpForm } from './form';

export const metadata = { title: `${t.auth.signUp.title} · ${t.appName}` };

export default function SignUpPage() {
  return (
    <section>
      <header className="mt-6 mb-7">
        <h1 className="font-heading text-[29px] leading-tight font-semibold tracking-[-0.03em]">{t.auth.signUp.title}</h1>
        <p className="text-ink-2 mt-2 text-[14.5px] leading-normal">
          {t.auth.signUp.subtitle}
        </p>
      </header>
      <SignUpForm />
    </section>
  );
}
