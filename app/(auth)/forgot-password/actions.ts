'use server';

import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
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
    return { error: null, fieldErrors: parsed.error.flatten().fieldErrors, success: false };
  }

  const supabase = await createServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/sign-in`,
  });

  // Always render success — don't leak whether the email exists.
  return { error: null, fieldErrors: null, success: true };
}
