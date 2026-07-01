import { t } from '@/lib/i18n';
import { SignUpForm } from './form';

export const metadata = { title: `${t.auth.signUp.title} · ${t.appName}` };

export default function SignUpPage() {
  return (
    <section>
      <header className="mb-7 text-center">
        <h1 className="text-2xl font-semibold">{t.auth.signUp.title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {t.auth.signUp.subtitle}
        </p>
      </header>
      <SignUpForm />
    </section>
  );
}
