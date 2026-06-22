'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { type ForgotPasswordState, requestPasswordReset } from './actions';

const initialState: ForgotPasswordState = { error: null, fieldErrors: null, success: false };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);

  if (state.success) {
    return (
      <div className="space-y-4">
        <p className="text-sm">{t.auth.forgot.sent}</p>
        <Link
          href="/sign-in"
          className="block text-center text-sm font-medium text-foreground hover:underline"
        >
          {t.auth.forgot.backToSignIn}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">{t.auth.signIn.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        {state.fieldErrors?.email && (
          <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
        )}
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.auth.forgot.submitting : t.auth.forgot.submit}
      </Button>
      <Link
        href="/sign-in"
        className="block text-center text-sm text-muted-foreground hover:text-foreground"
      >
        {t.auth.forgot.backToSignIn}
      </Link>
    </form>
  );
}
