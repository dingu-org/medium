'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { type SignInState, signIn } from './actions';
import { GoogleSignInButton } from './oauth-buttons';

const initialState: SignInState = { error: null, fieldErrors: null };

export function SignInForm({ confirmHint }: { confirmHint?: boolean }) {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <div className="space-y-6">
      {confirmHint && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t.auth.signIn.confirmHint}
        </div>
      )}

      <form action={action} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">{t.auth.signIn.email}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
          {state.fieldErrors?.email && (
            <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t.auth.signIn.password}</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t.auth.signIn.forgot}
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
          {state.fieldErrors?.password && (
            <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
          )}
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t.auth.signIn.submitting : t.auth.signIn.submit}
        </Button>
      </form>

      <Separator label={t.auth.signIn.or} />

      <GoogleSignInButton label={t.auth.signIn.google} />

      <p className="text-center text-sm text-muted-foreground">
        {t.auth.signIn.footerQuestion}{' '}
        <Link href="/sign-up" className="font-medium text-foreground hover:underline">
          {t.auth.signIn.footerAction}
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
