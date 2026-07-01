import { and, eq } from 'drizzle-orm';
import { conversations } from '@/lib/db/schema';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
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

  // Flip to human handling and emit the escalation event in one transaction so
  // the PT push (Phase 9) and bell feed only fire when the state actually
  // changed. Mirrors markRevoked in the WhatsApp client.
  const eventId = await svc.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(conversations)
      .set({ aiActive: false, escalationState: 'requested' })
      .where(
        and(
          eq(conversations.id, context.conversationId),
          eq(conversations.ptId, context.ptId),
          eq(conversations.patientId, context.patientId),
          // Guard on the source state (AI still handling) so a repeat
          // escalate_to_human call can't re-emit the event/push. Mirrors
          // markRevoked's `status = 'active'` transition guard.
          eq(conversations.aiActive, true),
        ),
      )
      .returning({ id: conversations.id });
    if (!updated) return null;

    return appendBackgroundEvent(tx, {
      type: 'conversation.escalated',
      data: {
        ptId: context.ptId,
        conversationId: context.conversationId,
        patientId: context.patientId,
      },
    });
  });

  if (eventId) await tryPublishOutboxEvent(eventId);
  return Boolean(eventId);
}
