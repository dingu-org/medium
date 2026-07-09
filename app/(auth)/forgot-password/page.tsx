import { t } from '@/lib/i18n';
import { ForgotPasswordForm } from './form';

export const metadata = { title: `${t.auth.forgot.title} · ${t.appName}` };

export default function ForgotPasswordPage() {
  return (
    <section>
      <header className="mt-6 mb-7">
        <h1 className="font-heading text-[29px] leading-tight font-semibold tracking-[-0.03em]">{t.auth.forgot.title}</h1>
        <p className="text-ink-2 mt-2 text-[14.5px] leading-normal">
          {t.auth.forgot.subtitle}
        </p>
      </header>
      <ForgotPasswordForm />
    </section>
  );
}
