import { t } from '@/lib/i18n';
import { ForgotPasswordForm } from './form';

export const metadata = { title: `${t.auth.forgot.title} · ${t.appName}` };

export default function ForgotPasswordPage() {
  return (
    <section>
      <header className="mb-7 text-center">
        <h1 className="text-2xl font-semibold">{t.auth.forgot.title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {t.auth.forgot.subtitle}
        </p>
      </header>
      <ForgotPasswordForm />
    </section>
  );
}
