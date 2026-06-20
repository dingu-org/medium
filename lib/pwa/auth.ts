import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

export async function getPwaPtId(): Promise<string | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function requirePwaPtId(): Promise<string> {
  const ptId = await getPwaPtId();
  if (!ptId) redirect('/sign-in');
  return ptId;
}
