import type { DBTransaction } from '@/lib/db';
import { eventOutbox, events } from '@/lib/db/schema';

export async function appendStoredEvent(
  tx: DBTransaction,
  event: {
    accountId: string;
    type: string;
    payload: unknown;
  },
): Promise<string> {
  const [stored] = await tx
    .insert(events)
    .values({
      accountId: event.accountId,
      type: event.type,
      payload: event.payload,
    })
    .returning({ id: events.id });

  await tx.insert(eventOutbox).values({
    accountId: event.accountId,
    eventId: stored.id,
    eventType: event.type,
    payload: event.payload,
  });

  return stored.id;
}
