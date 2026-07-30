'use server';

import { z } from 'zod';
import {
  CONFIRM_RECOVERY_PATH,
  emailRedirectUrl,
} from '@/lib/auth/email-links';
import { logger } from '@/lib/log';
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
  // /auth/confirm verifies a token hash, which — unlike the PKCE code the
  // callback exchanges — carries no per-browser state, so the mail can be
  // opened anywhere. It forwards a legacy `code` link to /auth/callback.
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: emailRedirectUrl(CONFIRM_RECOVERY_PATH) },
  );

  // A rejected redirect_to or the 2/hour email cap fails here while the PT is
  // told to check an inbox that will stay empty. The response cannot say so
  // without leaking whether the account exists, so the operator has to.
  if (error) {
    logger.error(
      'auth.reset_email_failed',
      'resetPasswordForEmail was refused; no recovery mail was sent',
      { errorName: error.name, status: error.status, errorCode: error.code },
    );
  }

  // Always render success — don't leak whether the email exists.
  return { error: null, fieldErrors: null, success: true };
}
