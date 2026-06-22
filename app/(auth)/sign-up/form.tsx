'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { GoogleSignInButton } from '../sign-in/oauth-buttons';
import { type SignUpState, signUp } from './actions';

const initialState: SignUpState = { error: null, fieldErrors: null };

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, initialState);

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">{t.auth.signIn.email}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder={t.auth.signUp.emailPlaceholder} />
          {state.fieldErrors?.email && (
            <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t.auth.signIn.password}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder={t.auth.signUp.passwordPlaceholder}
          />
          {state.fieldErrors?.password && (
            <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
          )}
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t.auth.signUp.submitting : t.auth.signUp.submit}
        </Button>
      </form>

      <Separator label={t.auth.signIn.or} />

      <GoogleSignInButton label={t.auth.signIn.google} />

      <p className="text-center text-sm text-muted-foreground">
        {t.auth.signUp.footerQuestion}{' '}
        <Link href="/sign-in" className="font-medium text-foreground hover:underline">
          {t.auth.signUp.footerAction}
        </Link>
      </p>
    </div>
  );
}

function Separator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
