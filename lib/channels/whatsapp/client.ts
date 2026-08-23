import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  conversations,
  messageTemplates,
  customers,
  whatsappConnections,
} from '@/lib/db/schema';
import { decryptToken } from '@/lib/db/crypto';
import { appendBackgroundEvent } from '@/lib/events/background';
import type { BackgroundEventPayloads } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { graphFetch } from './graph';
import {
  ConnectionRevokedError,
  GraphApiError,
  OutsideWindowError,
  TemplateNotApprovedError,
} from './errors';

const WINDOW_MS = 24 * 60 * 60 * 1000;

type ActiveConnection = {
  id: string;
  accountId: string;
  phoneNumberId: string;
  wabaId: string;
  token: string;
};

export type SendResult = { messageId: string | null };
export type CoexistenceSyncType = 'smb_app_state_sync' | 'history';
type RevocationReason =
  BackgroundEventPayloads['wa.connection.revoked']['reason'];

/** Load an active connection and decrypt its token at the call site. */
async function getConnection(connectionId: string): Promise<ActiveConnection> {
  const [row] = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.id, connectionId))
    .limit(1);

  if (!row || row.status !== 'active' || !row.accessTokenEncrypted) {
    throw new ConnectionRevokedError();
  }

  const token = await decryptToken(row.accessTokenEncrypted);
  return {
    id: row.id,
    accountId: row.accountId,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    token,
  };
}

/** Flip the connection to revoked and notify the PT (PWA shows "Reconnect"). */
async function markRevoked(
  connectionId: string,
  accountId: string,
  reason: RevocationReason,
): Promise<void> {
  const eventId = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(whatsappConnections)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(whatsappConnections.id, connectionId),
          eq(whatsappConnections.status, 'active'),
        ),
      )
      .returning({ id: whatsappConnections.id });
    if (!updated) return null;

    return appendBackgroundEvent(tx, {
      type: 'wa.connection.revoked',
      data: { accountId, connectionId, reason },
    });
  });
  if (eventId) await tryPublishOutboxEvent(eventId);
}

export async function markConnectionRevoked(args: {
  connectionId: string;
  accountId: string;
  reason: RevocationReason;
}): Promise<void> {
  await markRevoked(args.connectionId, args.accountId, args.reason);
}

/**
 * Best-effort detach of Medium's app from the PT's WABA at Meta, used by
 * account erasure. Decryption stays inside this module (the only sanctioned
 * home for the token). Never throws — a failed detach must not block deletion.
 */
export async function detachWabaSubscription(args: {
  accountId: string;
}): Promise<{ detached: boolean }> {
  const [row] = await db
    .select()
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.accountId, args.accountId),
        eq(whatsappConnections.status, 'active'),
      ),
    )
    .orderBy(desc(whatsappConnections.createdAt))
    .limit(1);

  if (!row || !row.accessTokenEncrypted) return { detached: false };

  try {
    const token = await decryptToken(row.accessTokenEncrypted);
    await graphFetch(`${row.wabaId}/subscribed_apps`, {
      method: 'DELETE',
      token,
    });
    return { detached: true };
  } catch (err) {
    console.warn('[gdpr] waba detach failed', {
      accountId: args.accountId,
      errorName: err instanceof Error ? err.name : typeof err,
    });
    return { detached: false };
  }
}

/** Graph call that turns an auth failure into a revoked connection. Token never logged. */
async function authedGraph<T>(
  conn: ActiveConnection,
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'DELETE';
    searchParams?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<T> {
  try {
    return await graphFetch<T>(path, { token: conn.token, ...opts });
  } catch (err) {
    if (err instanceof GraphApiError && err.isAuthError) {
      await markRevoked(
        conn.id,
        conn.accountId,
        err.status === 401 ? 'unauthorized' : 'forbidden',
      );
      throw new ConnectionRevokedError();
    }
    throw err;
  }
}

type SendResponse = { messages?: { id: string }[] };

/**
 * Send a free-form text message. Refuses if the 24h customer-service window is
 * closed — checked at send time against the customer's last inbound message,
 * because by the time a background job runs the window may have lapsed.
 */
export async function sendFreeForm(
  connectionId: string,
  to: string,
  body: string,
): Promise<SendResult> {
  const conn = await getConnection(connectionId);

  const [conversation] = await db
    .select({ lastInboundAt: conversations.lastInboundAt })
    .from(conversations)
    .innerJoin(customers, eq(conversations.customerId, customers.id))
    .where(
      and(
        eq(conversations.accountId, conn.accountId),
        eq(conversations.channel, 'whatsapp'),
        eq(customers.waId, to),
      ),
    )
    .limit(1);

  const lastInbound = conversation?.lastInboundAt;
  if (!lastInbound || Date.now() - lastInbound.getTime() > WINDOW_MS) {
    throw new OutsideWindowError();
  }

  const res = await authedGraph<SendResponse>(
    conn,
    `${conn.phoneNumberId}/messages`,
    {
      method: 'POST',
      body: { messaging_product: 'whatsapp', to, type: 'text', text: { body } },
    },
  );
  return { messageId: res.messages?.[0]?.id ?? null };
}

/**
 * Send an approved template message (usable outside the 24h window). Refuses if
 * the PT has no approved template by that name + language.
 */
export async function sendTemplate(
  connectionId: string,
  to: string,
  templateName: string,
  language: string,
  variables: string[] = [],
): Promise<SendResult> {
  const conn = await getConnection(connectionId);

  const [tpl] = await db
    .select({ status: messageTemplates.status })
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.accountId, conn.accountId),
        eq(messageTemplates.name, templateName),
        eq(messageTemplates.language, language),
      ),
    )
    .limit(1);

  if (!tpl || tpl.status !== 'approved') {
    throw new TemplateNotApprovedError(templateName);
  }

  const components =
    variables.length > 0
      ? [
          {
            type: 'body',
            parameters: variables.map((text) => ({ type: 'text', text })),
          },
        ]
      : undefined;

  const res = await authedGraph<SendResponse>(
    conn,
    `${conn.phoneNumberId}/messages`,
    {
      method: 'POST',
      body: {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          ...(components && { components }),
        },
      },
    },
  );
  return { messageId: res.messages?.[0]?.id ?? null };
}

type TemplateBodyComponent = {
  type: 'BODY';
  text: string;
  example?: { body_text: string[][] };
};

/**
 * Build the BODY component for a template submission/edit. Meta rejects a
 * variable-bearing body (`{{1}}` …) submitted without sample values with
 * INVALID_FORMAT, so attach `example.body_text` whenever the body has
 * variables. A static body must omit `example` entirely — an empty example is
 * itself invalid.
 */
function buildTemplateBodyComponent(
  body: string,
  exampleValues: string[],
): TemplateBodyComponent {
  const component: TemplateBodyComponent = { type: 'BODY', text: body };
  if (body.includes('{{')) {
    component.example = { body_text: [exampleValues] };
  }
  return component;
}

/** Submit a UTILITY template to Meta for approval (Business Management API). */
export async function submitTemplate(
  connectionId: string,
  name: string,
  language: string,
  body: string,
  exampleValues: string[] = [],
): Promise<{ metaId: string; status: string }> {
  const conn = await getConnection(connectionId);
  const res = await authedGraph<{ id: string; status?: string }>(
    conn,
    `${conn.wabaId}/message_templates`,
    {
      method: 'POST',
      body: {
        name,
        language,
        category: 'UTILITY',
        components: [buildTemplateBodyComponent(body, exampleValues)],
      },
    },
  );
  return { metaId: res.id, status: res.status ?? 'PENDING' };
}

/**
 * Re-submit an existing template's content (Business Management API). Name and
 * language are immutable at edit time, so only `category` + `components` are
 * sent. Editing a REJECTED template re-enters Meta review, flipping its status
 * back to PENDING — this is how we repair templates Meta rejected for
 * INVALID_FORMAT (variables without example values).
 */
export async function editTemplate(
  connectionId: string,
  metaTemplateId: string,
  body: string,
  exampleValues: string[] = [],
): Promise<{ success: boolean }> {
  const conn = await getConnection(connectionId);
  const res = await authedGraph<{ success?: boolean }>(conn, metaTemplateId, {
    method: 'POST',
    body: {
      category: 'UTILITY',
      components: [buildTemplateBodyComponent(body, exampleValues)],
    },
  });
  return { success: res.success ?? true };
}

/** Poll a submitted template's approval status (consumed by Phase 5). */
export async function getTemplateStatus(
  connectionId: string,
  metaTemplateId: string,
): Promise<{ status: string; name?: string }> {
  const conn = await getConnection(connectionId);
  return authedGraph<{ status: string; name?: string }>(conn, metaTemplateId, {
    searchParams: { fields: 'status,name' },
  });
}

export async function getQualityRating(connectionId: string): Promise<{
  qualityRating: string;
  tier: string | null;
}> {
  const conn = await getConnection(connectionId);
  const result = await authedGraph<{
    quality_rating?: string;
    messaging_limit_tier?: string;
  }>(conn, conn.phoneNumberId, {
    searchParams: { fields: 'quality_rating,messaging_limit_tier' },
  });
  return {
    qualityRating: result.quality_rating?.toUpperCase() || 'UNKNOWN',
    tier: result.messaging_limit_tier ?? null,
  };
}

export async function getDisplayNumber(connectionId: string): Promise<{
  displayPhoneNumber: string | null;
  verifiedName: string | null;
}> {
  const conn = await getConnection(connectionId);
  const result = await authedGraph<{
    display_phone_number?: string;
    verified_name?: string;
  }>(conn, conn.phoneNumberId, {
    searchParams: { fields: 'display_phone_number,verified_name' },
  });
  return {
    displayPhoneNumber: result.display_phone_number ?? null,
    verifiedName: result.verified_name ?? null,
  };
}

export async function requestCoexistenceSync(
  connectionId: string,
  syncType: CoexistenceSyncType,
): Promise<{ requestId: string | null }> {
  const conn = await getConnection(connectionId);
  const result = await authedGraph<{
    messaging_product?: string;
    request_id?: string;
  }>(conn, `${conn.phoneNumberId}/smb_app_data`, {
    method: 'POST',
    body: { messaging_product: 'whatsapp', sync_type: syncType },
  });
  return { requestId: result.request_id ?? null };
}
