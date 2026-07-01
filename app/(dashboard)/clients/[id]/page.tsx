import { notFound, redirect } from 'next/navigation';
import { getClientDetail } from '@/lib/clients/queries';
import { createServerClient } from '@/lib/supabase/server';
import { ClientDetail } from './client-detail';

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const client = await getClientDetail(user.id, id);
  if (!client) notFound();
  return <ClientDetail client={client} />;
}
