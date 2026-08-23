import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

export async function getPwaAccountId(): Promise<string | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function requirePwaAccountId(): Promise<string> {
  const accountId = await getPwaAccountId();
  if (!accountId) redirect('/sign-in');
  return accountId;
}
