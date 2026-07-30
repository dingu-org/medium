import { createBrowserClient as createSsrBrowserClient } from '@supabase/ssr';
import { supabaseAnonKey, supabaseUrl } from './env';

export function createBrowserClient() {
  return createSsrBrowserClient(supabaseUrl(), supabaseAnonKey());
}
