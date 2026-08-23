import { notFound, redirect } from 'next/navigation';
import { getChatThreadSnapshot } from '@/lib/pwa/read-models';
import { createServerClient } from '@/lib/supabase/server';
import { ChatThread } from './chat-thread';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const snapshot = await getChatThreadSnapshot(user.id, conversationId);
  if (!snapshot) notFound();

  return (
    <ChatThread
      key={snapshot.conversationId}
      conversationId={snapshot.conversationId}
      customerName={snapshot.customerName}
      customerPhone={snapshot.customerPhone}
      initialMessages={snapshot.initialMessages}
      aiActive={snapshot.aiActive}
      windowOpen={snapshot.windowOpen}
      closed={snapshot.closed}
      escalationState={snapshot.escalationState}
      aiPausedUntil={snapshot.aiPausedUntil}
      aiPauseReason={snapshot.aiPauseReason}
      connectionStatus={snapshot.connectionStatus}
      upcomingAppointment={snapshot.upcomingAppointment}
      capReached={snapshot.conversationCap.atCap}
    />
  );
}
