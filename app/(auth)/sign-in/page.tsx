import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { SignInForm } from './form';

export const metadata = {
  title: `${t.auth.signIn.title} · ${t.appName}`,
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ confirm?: string }>;
}) {
  const { confirm } = await searchParams;
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>{t.auth.signIn.title}</CardTitle>
        <CardDescription>{t.auth.signIn.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm confirmHint={confirm === '1'} />
      </CardContent>
    </Card>
  );
}
