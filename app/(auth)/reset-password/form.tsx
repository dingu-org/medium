'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { resetPassword, type ResetPasswordState } from './actions';

const initialState: ResetPasswordState = { error: null, fieldErrors: null };

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPassword, initialState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="password">{t.auth.reset.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        {state.fieldErrors?.password && (
          <p className="text-destructive text-sm">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">{t.auth.reset.confirm}</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        {state.fieldErrors?.confirm && (
          <p className="text-destructive text-sm">
            {state.fieldErrors.confirm[0]}
          </p>
        )}
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.auth.reset.submitting : t.auth.reset.submit}
      </Button>
    </form>
  );
}
