import { and, asc, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { conversations, messages, patients } from '@/lib/db/schema';
import { privacyName } from '@/lib/format/name';
import type { LiveMessage } from '@/lib/hooks/realtime';
import { createServerClient } from '@/lib/supabase/server';
import { ChatThread } from './chat-thread';

const WINDOW_MS = 24 * 60 * 60 * 1000;

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

  const [conversation] = await db
    .select({
      id: conversations.id,
      aiActive: conversations.aiActive,
      lastInboundAt: conversations.lastInboundAt,
      patientName: patients.name,
    })
    .from(conversations)
    .innerJoin(patients, eq(conversations.patientId, patients.id))
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.ptId, user.id),
      ),
    )
    .limit(1);

  if (!conversation) notFound();

  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(200);

  const initialMessages: LiveMessage[] = rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
  }));

  const windowOpen = conversation.lastInboundAt
    ? Date.now() - conversation.lastInboundAt.getTime() <= WINDOW_MS
    : false;

  return (
    <ChatThread
      conversationId={conversation.id}
      patientName={privacyName(conversation.patientName)}
      initialMessages={initialMessages}
      aiActive={conversation.aiActive}
      windowOpen={windowOpen}
    />
  );
}
