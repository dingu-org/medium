import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { ForgotPasswordForm } from './form';

export const metadata = {
  title: `${t.auth.forgot.title} · ${t.appName}`,
};

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>{t.auth.forgot.title}</CardTitle>
        <CardDescription>{t.auth.forgot.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
