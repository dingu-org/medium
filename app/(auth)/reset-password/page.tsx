import { t } from '@/lib/i18n';
import { ResetPasswordForm } from './form';

export const metadata = { title: `${t.auth.reset.title} · ${t.appName}` };

export default function ResetPasswordPage() {
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
