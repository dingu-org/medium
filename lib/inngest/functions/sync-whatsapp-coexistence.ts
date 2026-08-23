import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { requestCoexistenceSync } from '@/lib/channels/whatsapp/client';
import { inngest } from '../client';

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').slice(0, 500);
}

export async function syncWhatsappCoexistenceCore(args: {
  accountId: string;
  connectionId: string;
}): Promise<
  | {
      status: 'syncing';
      contactsRequestId: string | null;
      historyRequestId: string | null;
      existing: boolean;
    }
  | { skipped: 'connection_not_found' | 'not_coexistence' }
> {
  const [connection] = await db
    .select({
      id: whatsappConnections.id,
      mode: whatsappConnections.mode,
      status: whatsappConnections.status,
      contactsRequestId: whatsappConnections.coexistenceContactsRequestId,
      historyRequestId: whatsappConnections.coexistenceHistoryRequestId,
    })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.id, args.connectionId),
        eq(whatsappConnections.accountId, args.accountId),
      ),
    )
    .limit(1);

  if (!connection || connection.status !== 'active') {
    return { skipped: 'connection_not_found' };
  }
  if (connection.mode !== 'coexistence') {
    return { skipped: 'not_coexistence' };
  }

  let contactsRequestId = connection.contactsRequestId;
  let historyRequestId = connection.historyRequestId;
  const existing = Boolean(contactsRequestId && historyRequestId);

  try {
    if (!contactsRequestId) {
      contactsRequestId = (
        await requestCoexistenceSync(args.connectionId, 'smb_app_state_sync')
      ).requestId;
    }
    if (!historyRequestId) {
      historyRequestId = (
        await requestCoexistenceSync(args.connectionId, 'history')
      ).requestId;
    }
  } catch (error) {
    await db
      .update(whatsappConnections)
      .set({
        coexistenceSyncStatus: 'failed',
        coexistenceLastError: cleanError(error),
      })
      .where(eq(whatsappConnections.id, args.connectionId));
    throw error;
  }

  await db
    .update(whatsappConnections)
    .set({
      coexistenceSyncStatus: 'syncing',
      coexistenceContactsRequestId: contactsRequestId,
      coexistenceHistoryRequestId: historyRequestId,
      coexistenceLastError: null,
      coexistenceSyncDeadlineAt: sql`coalesce(${whatsappConnections.coexistenceSyncDeadlineAt}, now() + interval '24 hours')`,
    })
    .where(eq(whatsappConnections.id, args.connectionId));

  return {
    status: 'syncing',
    contactsRequestId,
    historyRequestId,
    existing,
  };
}

export const syncWhatsappCoexistence = inngest.createFunction(
  {
    id: 'sync-whatsapp-coexistence',
    retries: 3,
    idempotency: 'event.id',
  },
  { event: 'wa.connection.created' },
  async ({ event, step }) => {
    if (event.data.mode !== 'coexistence') return { skipped: 'not_coexistence' };
    return step.run('request-smb-app-data-sync', () =>
      syncWhatsappCoexistenceCore({
        accountId: event.data.accountId,
        connectionId: event.data.connectionId,
      }),
    );
  },
);
