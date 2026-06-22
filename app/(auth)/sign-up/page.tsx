import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { SignUpForm } from './form';

export const metadata = {
  title: `${t.auth.signUp.title} · ${t.appName}`,
};

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>{t.auth.signUp.title}</CardTitle>
        <CardDescription>{t.auth.signUp.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm />
      </CardContent>
    </Card>
  );
}
