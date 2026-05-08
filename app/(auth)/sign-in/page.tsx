import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignInForm } from './form';

export const metadata = {
  title: 'Sign in · Medium',
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
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to manage your practice.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm confirmHint={confirm === '1'} />
      </CardContent>
    </Card>
  );
}
