'use server';

import { redirect } from 'next/navigation';
import { instrumentedAction } from '@/lib/actions/instrument';
import {
  type ChatListPage,
  getChatListPage,
} from '@/lib/chat/queries';
import {
  type ChatMessageSnapshot,
  getOlderChatMessages,
} from '@/lib/pwa/read-models';
import { createServerClient } from '@/lib/supabase/server';

async function requirePtId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

/**
 * Fetch a later page of the conversation list for "load more". The PT is
 * resolved from auth here (untestable), while the actual paging query lives in
 * the `ptId`-parameterized `getChatListPage`, which is unit-testable directly.
 */
async function loadMoreConversationsImpl(input: {
  status: 'active' | 'closed';
  query?: string;
  page: number;
}): Promise<ChatListPage> {
  const ptId = await requirePtId();
  return getChatListPage(ptId, {
    status: input.status,
    query: input.query,
    page: input.page,
  });
}

export const loadMoreConversations = instrumentedAction(
  'chat.loadMoreConversations',
  loadMoreConversationsImpl,
);

/**
 * Fetch one older page of a thread's messages for the "load older" affordance.
 * As with the list loader, the PT is resolved from auth here and the paging
 * itself lives in the `ptId`-parameterized `getOlderChatMessages`. The cursor is
 * the oldest message the client currently holds.
 */
async function fetchOlderMessagesImpl(input: {
  conversationId: string;
  cursor: { createdAt: string; id: string };
}): Promise<{ messages: ChatMessageSnapshot[]; hasMore: boolean }> {
  const ptId = await requirePtId();
  return getOlderChatMessages(ptId, input.conversationId, input.cursor);
}

export const fetchOlderMessages = instrumentedAction(
  'chat.fetchOlderMessages',
  fetchOlderMessagesImpl,
);
