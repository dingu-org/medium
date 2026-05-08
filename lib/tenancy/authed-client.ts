import { createServerClient } from '@/lib/supabase/server';

export async function getAuthedClient() {
  return createServerClient();
}
