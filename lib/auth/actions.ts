'use server';

import { redirect } from 'next/navigation';
import { clearRecoveryCookie } from '@/lib/auth/recovery';
import { createServerClient } from '@/lib/supabase/server';

export async function signOut() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  // Outlives the session it was minted for otherwise, so the next PT to sign in
  // on a shared device inside its 10-minute window would walk into an open
  // password-reset gate.
  await clearRecoveryCookie();
  redirect('/sign-in');
}
