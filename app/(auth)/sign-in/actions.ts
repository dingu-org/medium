'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { t } from '@/lib/i18n';

const schema = z.object({
  email: z.string().email(t.auth.errors.emailInvalid),
  password: z.string().min(1, t.auth.errors.passwordRequired),
});

export type SignInState = {
  error: string | null;
  fieldErrors: { email?: string[]; password?: string[] } | null;
};

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: null, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: t.auth.signIn.wrong, fieldErrors: null };
  }

  redirect('/today');
}
