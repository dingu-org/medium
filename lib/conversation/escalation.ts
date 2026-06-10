import { and, eq } from 'drizzle-orm';
import { conversations } from '@/lib/db/schema';
import { getServiceClient } from '@/lib/tenancy';

export type ConversationEscalationContext = {
  ptId: string;
  patientId: string;
  conversationId: string;
};

export async function escalateConversationToHuman(
  context: ConversationEscalationContext,
): Promise<boolean> {
  const svc = getServiceClient(context.ptId);
  const [updated] = await svc.db
    .update(conversations)
    .set({ aiActive: false, escalationState: 'requested' })
    .where(
      and(
        eq(conversations.id, context.conversationId),
        eq(conversations.ptId, context.ptId),
        eq(conversations.patientId, context.patientId),
      ),
    )
    .returning({ id: conversations.id });

  return Boolean(updated);
}
