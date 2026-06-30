import { redirect } from 'next/navigation';
import { getChatListSnapshot } from '@/lib/pwa/read-models';
import { createServerClient } from '@/lib/supabase/server';
import { ChatList } from './chat-list';

export const metadata = { title: 'Bisedat · Medium' };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { tab, q } = await searchParams;
  const status = tab === 'closed' ? 'closed' : 'active';
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const rows = await getChatListSnapshot(user.id, { status, query: q });
  return (
    <ChatList ptId={user.id} rows={rows} status={status} query={q ?? ''} />
  );
}
