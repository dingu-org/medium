import type { DBTransaction } from '@/lib/db';
import { eventOutbox, events } from '@/lib/db/schema';

export async function appendStoredEvent(
  tx: DBTransaction,
  event: {
    ptId: string;
    type: string;
    payload: unknown;
  },
): Promise<string> {
  const [stored] = await tx
    .insert(events)
    .values({
      ptId: event.ptId,
      type: event.type,
      payload: event.payload,
    })
    .returning({ id: events.id });

  await tx.insert(eventOutbox).values({
    ptId: event.ptId,
    eventId: stored.id,
    eventType: event.type,
    payload: event.payload,
  });

  return stored.id;
}
