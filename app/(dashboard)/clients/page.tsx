import { redirect } from 'next/navigation';
import { getClientDirectory } from '@/lib/clients/queries';
import { createServerClient } from '@/lib/supabase/server';
import { ClientsDirectory } from './clients-directory';

export const metadata = { title: 'Klientët · Medium' };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const snapshot = await getClientDirectory(user.id, q);
  return <ClientsDirectory snapshot={snapshot} />;
}
