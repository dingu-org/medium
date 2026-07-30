'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { t } from '@/lib/i18n';

const schema = z.object({
  email: z.string().email(t.auth.errors.emailInvalid),
  password: z.string().min(8, t.auth.errors.passwordMin),
});

export type SignUpState = {
  error: string | null;
  fieldErrors: { email?: string[]; password?: string[] } | null;
};

export async function signUp(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: null, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    return {
      error: error.message.toLowerCase().includes('already')
        ? t.auth.signUp.emailTaken
        : t.auth.errors.signUpFailed,
      fieldErrors: null,
    };
  }

  // With email confirmations disabled, signUp returns a live session that the
  // server client has already written into the cookie jar — sending an already
  // signed-in PT to a "confirm your email" screen dead-ends the first run.
  if (data.session) redirect('/onboarding');

  redirect('/sign-in?confirm=1');
}
