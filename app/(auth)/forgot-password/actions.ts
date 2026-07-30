'use server';

import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { t } from '@/lib/i18n';

const schema = z.object({
  email: z.string().email(t.auth.errors.emailInvalid),
});

export type ForgotPasswordState = {
  error: string | null;
  fieldErrors: { email?: string[] } | null;
  success: boolean;
};

export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = schema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return {
      error: null,
      fieldErrors: parsed.error.flatten().fieldErrors,
      success: false,
    };
  }

  const supabase = await createServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    // /auth/confirm verifies a token hash, which — unlike the PKCE code the
    // callback exchanges — carries no per-browser state, so the mail can be
    // opened anywhere. It forwards a legacy `code` link to /auth/callback.
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
  });

  // Always render success — don't leak whether the email exists.
  return { error: null, fieldErrors: null, success: true };
}
