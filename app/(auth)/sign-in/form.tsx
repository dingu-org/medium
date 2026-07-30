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

export function SignInForm({
  confirmHint,
  resetHint,
  callbackError,
  canRequestNewLink = true,
}: {
  confirmHint?: boolean;
  resetHint?: boolean;
  callbackError?: string | null;
  /** False when the banner is not about an emailed link — see link-errors.ts. */
  canRequestNewLink?: boolean;
}) {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <div className="space-y-6">
      {confirmHint && (
        <div className="border-border bg-muted/40 text-muted-foreground rounded-md border p-3 text-sm">
          {t.auth.signIn.confirmHint}
        </div>
      )}
      {resetHint && (
        <div className="rounded-md border border-[var(--success-200)] bg-[var(--success-50)] p-3 text-sm text-[var(--success-700)]">
          {t.auth.reset.complete}
        </div>
      )}
      {callbackError && (
        <div className="border-destructive/30 text-destructive rounded-md border bg-[var(--danger-50)] p-3 text-sm">
          <p>{callbackError}</p>
          {canRequestNewLink && (
            <Link
              href="/forgot-password"
              className="mt-1 inline-block font-medium underline"
            >
              {t.auth.signIn.linkFailedAction}
            </Link>
          )}
        </div>
      )}

      <form action={action} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">{t.auth.signIn.email}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          {state.fieldErrors?.email && (
            <p className="text-destructive text-sm">
              {state.fieldErrors.email[0]}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t.auth.signIn.password}</Label>
            <Link
              href="/forgot-password"
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              {t.auth.signIn.forgot}
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {state.fieldErrors?.password && (
            <p className="text-destructive text-sm">
              {state.fieldErrors.password[0]}
            </p>
          )}
        </div>
        {state.error && (
          <p className="text-destructive text-sm">{state.error}</p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t.auth.signIn.submitting : t.auth.signIn.submit}
        </Button>
      </form>

      <Separator label={t.auth.signIn.or} />

      <GoogleSignInButton label={t.auth.signIn.google} />

      <p className="text-muted-foreground text-center text-sm">
        {t.auth.signIn.footerQuestion}{' '}
        <Link
          href="/sign-up"
          className="text-foreground font-medium hover:underline"
        >
          {t.auth.signIn.footerAction}
        </Link>
      </p>
    </div>
  );
}

function Separator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="bg-border h-px flex-1" />
      <span className="text-muted-foreground text-xs tracking-wider uppercase">
        {label}
      </span>
      <div className="bg-border h-px flex-1" />
    </div>
  );
}
