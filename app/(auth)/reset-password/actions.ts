'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { RECOVERY_COOKIE } from '@/lib/auth/recovery';
import { t } from '@/lib/i18n';
import { createServerClient } from '@/lib/supabase/server';

const schema = z
  .object({
    password: z.string().min(8, t.auth.errors.passwordMin),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: t.auth.reset.mismatch,
    path: ['confirm'],
  });

export type ResetPasswordState = {
  error: string | null;
  fieldErrors: { password?: string[]; confirm?: string[] } | null;
};

export async function resetPassword(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = schema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    return { error: null, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Require the recovery marker set by the auth callback — updateUser() would
  // otherwise let any active session change the password with no re-auth.
  const store = await cookies();
  if (!store.get(RECOVERY_COOKIE)) {
    return { error: t.auth.errors.callbackFailed, fieldErrors: null };
  }
  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: t.auth.errors.callbackFailed, fieldErrors: null };
  store.delete(RECOVERY_COOKIE);
  redirect('/sign-in?reset=1');
}
