'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type SignUpState = {
  error: string | null;
  fieldErrors: { email?: string[]; password?: string[] } | null;
};

export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: null, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message, fieldErrors: null };
  }

  redirect('/sign-in?confirm=1');
}
