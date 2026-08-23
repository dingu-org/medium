import { type NextRequest } from 'next/server';
import {
  sql,
  eq,
  and,
  or,
  isNull,
  isNotNull,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import { db, type DBTransaction } from '@/lib/db';
import { getPostgresErrorCode } from '@/lib/db/postgres-errors';
import {
  conversations,
  messages,
  customers,
  waMessageStatuses,
  whatsappConnections,
  whatsappContacts,
} from '@/lib/db/schema';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { markConnectionRevoked } from '@/lib/channels/whatsapp/client';
import { verifySignature } from '@/lib/channels/whatsapp/signature';
import { createLogger, newTraceId } from '@/lib/log';
import {
  inboundCaption,
  whatsappWebhookPayload,
  type WhatsappChangeValue,
} from '@/lib/channels/whatsapp/payload';
import {
  nonTextContent,
  nonTextPlaceholder,
} from '@/lib/conversation/non-text';

export const runtime = 'nodejs';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const APP_SECRET = requireEnv('META_APP_SECRET');
const VERIFY_TOKEN = requireEnv('META_WEBHOOK_VERIFY_TOKEN');

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const trace_id = req.headers.get('x-request-id') ?? newTraceId();
  const log = createLogger({ trace_id });
  const header = req.headers.get('x-hub-signature-256');

  if (!verifySignature({ rawBody, header, secret: APP_SECRET })) {
    log.warn('webhook.bad_signature', 'Rejected: invalid webhook signature', {
      hasHeader: header !== null,
    });
    return new Response('Invalid signature', { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    log.warn('webhook.invalid_json', 'Rejected: invalid JSON payload');
    return new Response('Bad payload', { status: 400 });
  }

  const parsed = whatsappWebhookPayload.safeParse(json);
  if (!parsed.success) {
    log.warn(
      'webhook.schema_mismatch',
      'Rejected: payload failed schema validation',
      { issue_count: parsed.error.issues.length },
    );
    return new Response('Bad payload', { status: 400 });
  }

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      switch (change.field) {
        case 'messages':
          await handleMessagesChange(change.value, trace_id);
          await handleStatusesChange(change.value, trace_id);
          break;
        case 'history':
          await handleHistoryChange(change.value, trace_id);
          break;
        case 'smb_app_state_sync':
          await handleAppStateSyncChange(change.value, trace_id);
          break;
        case 'smb_message_echoes':
          await handleMessageEchoesChange(change.value, trace_id);
          break;
        case 'account_update':
          await handleAccountUpdate(entry.id, change.value, trace_id);
          break;
        default:
          break;
      }
    }
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
}

type WebhookConnection = { id: string; accountId: string; wabaId: string };

async function loadConnectionByPhoneNumberId(
  phoneNumberId: string | undefined,
  source: string,
  trace_id: string,
): Promise<WebhookConnection | null> {
  const log = createLogger({ trace_id });
  if (!phoneNumberId) {
    log.warn(
      'webhook.missing_phone_number_id',
      'Webhook payload is missing phone_number_id',
      { source },
    );
    return null;
  }

  const [connection] = await db
    .select({
      id: whatsappConnections.id,
      accountId: whatsappConnections.accountId,
      wabaId: whatsappConnections.wabaId,
    })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.phoneNumberId, phoneNumberId),
        eq(whatsappConnections.status, 'active'),
      ),
    )
    .limit(1);

  if (!connection) {
    log.warn(
      'webhook.unknown_phone_number_id',
      'No active connection for phone_number_id',
      { phone_number_id: phoneNumberId, source },
    );
    return null;
  }
  return connection;
}

async function handleMessagesChange(
  value: WhatsappChangeValue,
  trace_id: string,
): Promise<void> {
  const log = createLogger({ trace_id });
  if (value.errors?.some((error) => error.code === 131060)) {
    log.warn(
      'webhook.unsupported_coexistence_request',
      'Unsupported coexistence request',
      { codes: value.errors.map((error) => error.code).filter(Boolean) },
    );
    return;
  }
  const connection = await loadConnectionByPhoneNumberId(
    value.metadata?.phone_number_id,
    'messages',
    trace_id,
  );
  if (!connection) {
    return;
  }
  const { accountId } = connection;

  for (const msg of value.messages ?? []) {
    const contact = value.contacts?.find((c) => c.wa_id === msg.from);
    const name = contact?.profile?.name ?? msg.from;

    // A body the assistant cannot read (voice note, photo, document, …). It is
    // still persisted, as a deterministic placeholder plus whatever caption the
    // customer typed: that one row is what gives the PT an unread badge, a
    // chat-list preview and a realtime refresh — all three read it, and without
    // it the message simply never happened as far as the PT is concerned. The
    // `message.received` event carries `nonText` so the inbound job answers with
    // its fixed notice instead of handing our own placeholder to the model.
    //
    // `bumpLastInboundAt` keeps taking the inbound's own timestamp (not now()):
    // Meta redelivers whole batches, and a two-day-old image must not re-open a
    // 24h service window that has in fact expired.
    if (msg.type !== 'text' || !msg.text) {
      const placeholder = nonTextPlaceholder(msg.type);
      if (!placeholder) {
        log.warn(
          'webhook.skipping_non_text_message',
          'Skipping non-text message',
          { type: msg.type, externalId: msg.id },
        );
        continue;
      }

      const inboundAt = parseWebhookTimestamp(msg.timestamp);
      const nonTextResult = await db.transaction(async (tx) => {
        const { conversationId } = await ensureWhatsappConversation(tx, {
          accountId,
          waId: msg.from,
          name,
        });
        const inserted = await tx
          .insert(messages)
          .values({
            accountId,
            conversationId,
            externalId: msg.id,
            role: 'customer',
            channel: 'whatsapp',
            content: nonTextContent(placeholder, inboundCaption(msg)),
          })
          .onConflictDoNothing({ target: messages.externalId })
          .returning({ id: messages.id });

        // Unconditional, and before the dedupe check: the window bump is
        // idempotent by construction (GREATEST on the inbound's timestamp) and
        // this transaction is still the only writer of `last_inbound_at`.
        await bumpLastInboundAt(tx, conversationId, inboundAt);

        if (inserted.length !== 1) return { fresh: false as const };

        const messageId = inserted[0].id;
        const eventId = await appendBackgroundEvent(tx, {
          type: 'message.received',
          data: {
            messageId,
            accountId,
            conversationId,
            nonText: true,
            traceId: trace_id,
          },
        });
        return { fresh: true as const, messageId, conversationId, eventId };
      });

      if (nonTextResult.fresh) {
        await tryPublishOutboxEvent(nonTextResult.eventId);
        log.info(
          'webhook.non_text_message_accepted',
          'Inbound non-text message accepted',
          {
            account_id: accountId,
            type: msg.type,
            conversation_id: nonTextResult.conversationId,
            message_id: nonTextResult.messageId,
          },
        );
      }
      continue;
    }
    const content = msg.text.body;

    const result = await db.transaction(async (tx) => {
      const { conversationId } = await ensureWhatsappConversation(tx, {
        accountId,
        waId: msg.from,
        name,
      });

      const inserted = await tx
        .insert(messages)
        .values({
          accountId,
          conversationId,
          externalId: msg.id,
          role: 'customer',
          channel: 'whatsapp',
          content,
        })
        .onConflictDoNothing({ target: messages.externalId })
        .returning({ id: messages.id });

      if (inserted.length !== 1) return { fresh: false as const };

      await bumpLastInboundAt(tx, conversationId);

      const messageId = inserted[0].id;
      const eventId = await appendBackgroundEvent(tx, {
        type: 'message.received',
        data: {
          messageId,
          accountId,
          conversationId,
          traceId: trace_id,
        },
      });
      return {
        fresh: true as const,
        messageId,
        conversationId,
        eventId,
      };
    });

    if (result.fresh) {
      await tryPublishOutboxEvent(result.eventId);
      log.info('webhook.message_accepted', 'Inbound message accepted', {
        account_id: accountId,
        conversation_id: result.conversationId,
        message_id: result.messageId,
      });
    }
  }
}

// Monotonic status progression: never let an out-of-order webhook downgrade
// `last_status`. `delivered` and `failed` tie at 2 (mutually-exclusive outcomes
// at the same stage) — the first to arrive holds `last_status`, and neither can
// overwrite `read` (3) nor be overwritten by `sent` (1). Per-status timestamp
// columns are stamped independently (first-write-wins), so `delivered_at` — the
// billing signal — is never lost to a late `failed`.
const WA_STATUS_RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  failed: 2,
  read: 3,
};

const WA_STATUS_TS_COLUMN = {
  sent: 'sentAt',
  delivered: 'deliveredAt',
  read: 'readAt',
  failed: 'failedAt',
} as const;

/** `CASE`-based rank of a status expression (column or SQL), per WA_STATUS_RANK. */
function statusRankSql(expr: SQLWrapper): SQL {
  return sql`CASE ${expr} WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'failed' THEN 2 WHEN 'read' THEN 3 ELSE 0 END`;
}

async function upsertMessageStatus(args: {
  accountId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  ts: Date;
  externalId: string;
  billable: boolean | null;
  pricingCategory: string | null;
  pricingType: string | null;
  pricingModel: string | null;
  errorCode: number | null;
}): Promise<void> {
  const tsColumn = WA_STATUS_TS_COLUMN[args.status];
  await db
    .insert(waMessageStatuses)
    .values({
      accountId: args.accountId,
      externalId: args.externalId,
      lastStatus: args.status,
      sentAt: tsColumn === 'sentAt' ? args.ts : null,
      deliveredAt: tsColumn === 'deliveredAt' ? args.ts : null,
      readAt: tsColumn === 'readAt' ? args.ts : null,
      failedAt: tsColumn === 'failedAt' ? args.ts : null,
      billable: args.billable,
      pricingCategory: args.pricingCategory,
      pricingType: args.pricingType,
      pricingModel: args.pricingModel,
      errorCode: args.errorCode,
    })
    .onConflictDoUpdate({
      target: waMessageStatuses.externalId,
      set: {
        lastStatus: sql`CASE WHEN ${statusRankSql(sql`excluded.last_status`)} > ${statusRankSql(waMessageStatuses.lastStatus)} THEN excluded.last_status ELSE ${waMessageStatuses.lastStatus} END`,
        sentAt: sql`COALESCE(${waMessageStatuses.sentAt}, excluded.sent_at)`,
        deliveredAt: sql`COALESCE(${waMessageStatuses.deliveredAt}, excluded.delivered_at)`,
        readAt: sql`COALESCE(${waMessageStatuses.readAt}, excluded.read_at)`,
        failedAt: sql`COALESCE(${waMessageStatuses.failedAt}, excluded.failed_at)`,
        billable: sql`COALESCE(${waMessageStatuses.billable}, excluded.billable)`,
        pricingCategory: sql`COALESCE(${waMessageStatuses.pricingCategory}, excluded.pricing_category)`,
        pricingType: sql`COALESCE(${waMessageStatuses.pricingType}, excluded.pricing_type)`,
        pricingModel: sql`COALESCE(${waMessageStatuses.pricingModel}, excluded.pricing_model)`,
        errorCode: sql`COALESCE(${waMessageStatuses.errorCode}, excluded.error_code)`,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Record the delivery Meta confirmed for the message the reminder job is
 * CURRENTLY linked to. The timestamp is read back from `wa_message_statuses`,
 * which is already first-write-wins per wamid, so a redelivered `delivered`
 * webhook can never move it.
 *
 * Two writes, one statement so they cannot disagree:
 * - `reminder_deliveries` gets the metered fact, one row per delivered wamid.
 *   This is what the monthly plan quota counts (lib/billing/usage.ts), and it is
 *   what makes a rescheduled appointment's second — separately billed — template
 *   countable at all: `reminder_jobs` is unique per appointment, so one scalar
 *   there can only ever describe one of the two cycles.
 * - `reminder_jobs.delivered_at` keeps the latest cycle for the appointment
 *   badge. Skipping the UPDATE when it already holds this delivery keeps it from
 *   churning; the delivery row is still written either way.
 */
async function markReminderDelivered(
  accountId: string,
  wamid: string,
): Promise<void> {
  await db.execute(sql`
    WITH delivered AS (
      SELECT rj.id AS job_id, rj.account_id, rj.appointment_id, s.delivered_at
      FROM reminder_jobs AS rj
      INNER JOIN messages AS m ON m.id = rj.message_id
      INNER JOIN wa_message_statuses AS s
        ON s.external_id = m.external_id AND s.account_id = m.account_id
      WHERE m.external_id = ${wamid}
        AND m.account_id = ${accountId}
        AND rj.account_id = ${accountId}
        AND s.delivered_at IS NOT NULL
    ), stamped AS (
      UPDATE reminder_jobs AS rj
      SET delivered_at = delivered.delivered_at
      FROM delivered
      WHERE rj.id = delivered.job_id
        AND rj.delivered_at IS DISTINCT FROM delivered.delivered_at
    )
    INSERT INTO reminder_deliveries (account_id, appointment_id, external_id, delivered_at)
    SELECT account_id, appointment_id, ${wamid}, delivered_at FROM delivered
    ON CONFLICT (external_id) DO NOTHING
  `);
}

/**
 * A `failed` status for a reminder whose template Meta accepted then dropped:
 * mark the job failed and emit `reminder.failed` (existing push/bell/flag
 * pipeline). Guarded so an already-answered reminder is never re-flagged, and so
 * a failure is ignored once Meta has confirmed delivery — of THIS wamid, per
 * `wa_message_statuses`, not of whatever cycle last stamped
 * `reminder_jobs.delivered_at` (a reschedule leaves that scalar behind, which
 * silently swallowed every second-cycle failure).
 */
async function failReminderDelivery(args: {
  accountId: string;
  wamid: string;
  reason: string;
  trace_id: string;
}): Promise<void> {
  const log = createLogger({ trace_id: args.trace_id });
  const result = await db.transaction(async (tx) => {
    const affected = await tx.execute<{ appointmentId: string }>(sql`
      UPDATE reminder_jobs AS rj
      SET status = 'failed', last_error = ${args.reason}, skipped_reason = NULL
      FROM messages AS m
      WHERE m.external_id = ${args.wamid}
        AND m.account_id = ${args.accountId}
        AND rj.message_id = m.id
        AND rj.account_id = ${args.accountId}
        AND rj.status = 'sent'
        AND rj.response_type IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM wa_message_statuses AS s
          WHERE s.external_id = m.external_id
            AND s.account_id = m.account_id
            AND s.delivered_at IS NOT NULL
        )
      RETURNING rj.appointment_id AS "appointmentId"
    `);
    const [row] = affected;
    if (!row) return null;
    const eventId = await appendBackgroundEvent(tx, {
      type: 'reminder.failed',
      data: {
        accountId: args.accountId,
        appointmentId: row.appointmentId,
        reason: args.reason,
        traceId: args.trace_id,
      },
    });
    return { eventId, appointmentId: row.appointmentId };
  });

  if (result) {
    await tryPublishOutboxEvent(result.eventId);
    log.info(
      'webhook.reminder_delivery_failed',
      'Reminder template delivery failed',
      { account_id: args.accountId, appointment_id: result.appointmentId },
    );
  }
}

async function handleStatusesChange(
  value: WhatsappChangeValue,
  trace_id: string,
): Promise<void> {
  const log = createLogger({ trace_id });
  const statuses = value.statuses ?? [];
  if (statuses.length === 0) return;

  const connection = await loadConnectionByPhoneNumberId(
    value.metadata?.phone_number_id,
    'statuses',
    trace_id,
  );
  if (!connection) return;
  const { accountId } = connection;

  for (const status of statuses) {
    if (!(status.status in WA_STATUS_RANK)) {
      log.warn(
        'webhook.unknown_message_status',
        'Ignoring unrecognized message status',
        { status: status.status, externalId: status.id },
      );
      continue;
    }
    const narrowed = status.status as 'sent' | 'delivered' | 'read' | 'failed';
    const ts = parseWebhookTimestamp(status.timestamp);

    await upsertMessageStatus({
      accountId,
      status: narrowed,
      ts,
      externalId: status.id,
      billable: status.pricing?.billable ?? null,
      pricingCategory: status.pricing?.category ?? null,
      pricingType: status.pricing?.type ?? null,
      pricingModel: status.pricing?.pricing_model ?? null,
      errorCode: status.errors?.[0]?.code ?? null,
    });

    if (narrowed === 'delivered') {
      await markReminderDelivered(accountId, status.id);
    } else if (narrowed === 'failed') {
      const firstError = status.errors?.[0];
      const reason = firstError
        ? errorText(firstError)
        : 'template_delivery_failed';
      await failReminderDelivery({ accountId, wamid: status.id, reason, trace_id });
    }
  }
}

async function linkManualCustomer(
  tx: DBTransaction,
  accountId: string,
  waId: string,
): Promise<void> {
  const [existing] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.accountId, accountId), eq(customers.waId, waId)))
    .limit(1);
  if (existing) return;

  const digits = waId.replace(/\D/g, '');
  if (!digits) return;
  const [manual] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.accountId, accountId),
        isNull(customers.waId),
        sql`regexp_replace(${customers.phone}, '[^0-9]', '', 'g') = ${digits}`,
      ),
    )
    .limit(1);
  if (!manual) return;

  await tx
    .update(customers)
    .set({ waId })
    .where(
      and(
        eq(customers.id, manual.id),
        eq(customers.accountId, accountId),
        isNull(customers.waId),
      ),
    );
}

function progressValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function errorText(
  error: NonNullable<WhatsappChangeValue['errors']>[number],
): string {
  return (
    error.message ??
    error.title ??
    error.error_data?.details ??
    `WhatsApp webhook error ${error.code ?? 'unknown'}`
  );
}

async function handleHistoryChange(
  value: WhatsappChangeValue,
  trace_id: string,
): Promise<void> {
  const connection = await loadConnectionByPhoneNumberId(
    value.metadata?.phone_number_id,
    'history',
    trace_id,
  );
  if (!connection) return;

  let syncStatus: 'syncing' | 'complete' | 'failed' | 'history_declined' =
    'syncing';
  let maxProgress: number | null = null;
  let lastError: string | null = null;

  for (const item of value.history ?? []) {
    const progress = progressValue(item.metadata?.progress);
    if (progress !== null) {
      maxProgress = Math.max(maxProgress ?? 0, progress);
    }

    for (const error of item.errors ?? []) {
      lastError = errorText(error);
      syncStatus = error.code === 2593109 ? 'history_declined' : 'failed';
    }
  }

  if (syncStatus === 'syncing' && maxProgress !== null && maxProgress >= 100) {
    syncStatus = 'complete';
  }

  await db
    .update(whatsappConnections)
    .set({
      coexistenceSyncStatus: syncStatus,
      coexistenceLastProgress: maxProgress,
      coexistenceLastError: lastError,
    })
    .where(eq(whatsappConnections.id, connection.id));
}

function parseWebhookTimestamp(input: unknown): Date {
  if (typeof input === 'number') return new Date(input * 1000);
  if (typeof input === 'string') {
    const numeric = Number.parseInt(input, 10);
    if (Number.isFinite(numeric)) return new Date(numeric * 1000);
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function isDeleteAction(action: string | undefined): boolean {
  return ['delete', 'deleted', 'remove', 'removed'].includes(
    action?.toLowerCase() ?? '',
  );
}

async function handleAppStateSyncChange(
  value: WhatsappChangeValue,
  trace_id: string,
): Promise<void> {
  const connection = await loadConnectionByPhoneNumberId(
    value.metadata?.phone_number_id,
    'smb_app_state_sync',
    trace_id,
  );
  if (!connection) return;

  const log = createLogger({ trace_id });

  for (const item of value.state_sync ?? []) {
    if (item.type && item.type !== 'contact') continue;
    const contact = item.contact;
    const phone = contact?.phone_number;
    if (!phone) continue;

    const action = item.action ?? null;
    const lastSyncedAt = parseWebhookTimestamp(item.metadata?.timestamp);
    const deletedAt = isDeleteAction(item.action) ? lastSyncedAt : null;
    const waId = contact.wa_id ?? phone;
    const set = {
      phone,
      waId,
      fullName: contact.full_name ?? null,
      firstName: contact.first_name ?? null,
      sourceAction: action,
      lastSyncedAt,
      deletedAt,
    };

    // The table is unique on both (account_id, phone) and (account_id, wa_id) — an
    // explicit ON CONFLICT target only covers one index, so infer on wa_id
    // whenever Meta sent one (two address-book entries with differently
    // formatted phone strings resolve to the same wa_id). A collision on the
    // other index can still raise 23505; ack it per contact rather than 500 the
    // batch, which Meta would redeliver forever.
    const arbiter = contact.wa_id
      ? {
          target: [whatsappContacts.accountId, whatsappContacts.waId],
          // Required to infer the partial index (…) WHERE wa_id IS NOT NULL.
          targetWhere: isNotNull(whatsappContacts.waId),
        }
      : { target: [whatsappContacts.accountId, whatsappContacts.phone] };

    try {
      await db
        .insert(whatsappContacts)
        .values({ accountId: connection.accountId, ...set })
        .onConflictDoUpdate({ ...arbiter, set });
    } catch (err) {
      log.warn('webhook.contact_sync_failed', 'Skipping unsyncable contact', {
        account_id: connection.accountId,
        pg_code: getPostgresErrorCode(err),
        wa_id: waId,
      });
    }
  }
}

async function contactName(accountId: string, phone: string): Promise<string> {
  const [contact] = await db
    .select({
      fullName: whatsappContacts.fullName,
      firstName: whatsappContacts.firstName,
    })
    .from(whatsappContacts)
    .where(
      and(
        eq(whatsappContacts.accountId, accountId),
        or(eq(whatsappContacts.phone, phone), eq(whatsappContacts.waId, phone)),
      ),
    )
    .limit(1);
  return contact?.fullName ?? contact?.firstName ?? phone;
}

/**
 * Bump the 24h service window and reopen a manually closed conversation. Every
 * `CASE` reads the pre-update row, so a conversation that was already open keeps
 * its AI / escalation state untouched.
 *
 * `inboundAt` is passed for inbounds we do not persist (no `messages` row means
 * no `external_id` dedupe). Meta redelivers the whole batch whenever any change
 * in the POST throws, so both the reopen AND the window itself are keyed off the
 * inbound's own timestamp, never `now()`: a conversation the PT closed *after*
 * the customer wrote stays closed however many times the batch comes back, and a
 * redelivered image from yesterday cannot re-open a service window that has in
 * fact expired (the PT's free-form reply would then be rejected by Meta or
 * billed as a new conversation). `GREATEST` keeps the window monotonic.
 */
async function bumpLastInboundAt(
  tx: DBTransaction,
  conversationId: string,
  inboundAt?: Date,
): Promise<void> {
  const reopen = inboundAt
    ? sql`(${conversations.closedAt} IS NOT NULL AND ${conversations.closedAt} <= ${inboundAt.toISOString()}::timestamptz)`
    : sql`${conversations.closedAt} IS NOT NULL`;
  await tx
    .update(conversations)
    .set({
      // GREATEST ignores NULLs, so a first inbound stamps the inbound's own time.
      lastInboundAt: inboundAt
        ? sql`GREATEST(${conversations.lastInboundAt}, ${inboundAt.toISOString()}::timestamptz)`
        : sql`now()`,
      closedAt: sql`CASE WHEN ${reopen} THEN NULL ELSE ${conversations.closedAt} END`,
      aiActive: sql`CASE WHEN ${reopen} THEN true ELSE ${conversations.aiActive} END`,
      escalationState: sql`CASE WHEN ${reopen} THEN 'idle' ELSE ${conversations.escalationState} END`,
    })
    .where(eq(conversations.id, conversationId));
}

/** Ensure the customer + WhatsApp conversation rows exist; never touches
 *  handling state (callers own `last_inbound_at` / AI pauses). */
async function ensureWhatsappConversation(
  tx: DBTransaction,
  args: {
    accountId: string;
    waId: string;
    name: string;
  },
): Promise<{ customerId: string; conversationId: string }> {
  await linkManualCustomer(tx, args.accountId, args.waId);
  await tx
    .insert(customers)
    .values({
      accountId: args.accountId,
      name: args.name,
      phone: args.waId,
      waId: args.waId,
    })
    .onConflictDoNothing({ target: [customers.accountId, customers.waId] });

  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.accountId, args.accountId), eq(customers.waId, args.waId)))
    .limit(1);

  if (!customer) {
    throw new Error(
      `[whatsapp-webhook] customer row missing after upsert (wa_id=${args.waId})`,
    );
  }

  const insertedConversation = await tx
    .insert(conversations)
    .values({
      accountId: args.accountId,
      customerId: customer.id,
      channel: 'whatsapp',
    })
    .onConflictDoNothing({
      target: [conversations.customerId, conversations.channel],
    })
    .returning({ id: conversations.id });
  const [conversation] = insertedConversation.length
    ? insertedConversation
    : await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.customerId, customer.id),
            eq(conversations.channel, 'whatsapp'),
          ),
        )
        .limit(1);
  if (!conversation) {
    throw new Error(
      `[whatsapp-webhook] conversation row missing after upsert (customer_id=${customer.id})`,
    );
  }

  return { customerId: customer.id, conversationId: conversation.id };
}

async function handleMessageEchoesChange(
  value: WhatsappChangeValue,
  trace_id: string,
): Promise<void> {
  const log = createLogger({ trace_id });
  const connection = await loadConnectionByPhoneNumberId(
    value.metadata?.phone_number_id,
    'smb_message_echoes',
    trace_id,
  );
  if (!connection) return;

  for (const echo of value.message_echoes ?? []) {
    if (echo.type !== 'text' || !echo.text) {
      log.warn(
        'webhook.skipping_non_text_message_echo',
        'Skipping non-text message echo',
        { type: echo.type, externalId: echo.id },
      );
      continue;
    }

    const customerWaId = echo.to;
    const name = await contactName(connection.accountId, customerWaId);
    const pauseUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const result = await db.transaction(async (tx) => {
      const { customerId, conversationId } = await ensureWhatsappConversation(
        tx,
        {
          accountId: connection.accountId,
          waId: customerWaId,
          name,
        },
      );

      const inserted = await tx
        .insert(messages)
        .values({
          accountId: connection.accountId,
          conversationId,
          externalId: echo.id,
          role: 'account',
          channel: 'whatsapp',
          content: echo.text!.body,
        })
        .onConflictDoNothing({ target: messages.externalId })
        .returning({ id: messages.id });

      if (inserted.length !== 1) return { fresh: false as const };

      // Pause only after the dedupe above, so a redelivered echo cannot advance
      // `ai_paused_until` past the resume job already scheduled for it. An
      // indefinite hold the PT set themselves (`ai_active = false` with no echo
      // reason — manual takeover or an open escalation) is left alone: it must
      // not become a 2h auto-resuming pause, and `escalation_state` is never
      // cleared here.
      const stillEchoPause = sql`(${conversations.aiActive} OR ${conversations.aiPauseReason} = 'whatsapp_business_app_echo')`;
      const [paused] = await tx
        .update(conversations)
        .set({
          aiActive: false,
          aiPausedUntil: sql`CASE WHEN ${stillEchoPause} THEN ${pauseUntil.toISOString()}::timestamptz ELSE ${conversations.aiPausedUntil} END`,
          aiPauseReason: sql`CASE WHEN ${stillEchoPause} THEN 'whatsapp_business_app_echo' ELSE ${conversations.aiPauseReason} END`,
        })
        .where(eq(conversations.id, conversationId))
        .returning({ aiPauseReason: conversations.aiPauseReason });

      // No resume job for a hold we did not write — it would fire against a
      // conversation a human is still handling.
      const eventId =
        paused?.aiPauseReason === 'whatsapp_business_app_echo'
          ? await appendBackgroundEvent(tx, {
              type: 'conversation.ai_paused',
              data: {
                accountId: connection.accountId,
                conversationId,
                customerId,
                pausedUntil: pauseUntil.toISOString(),
                reason: 'whatsapp_business_app_echo',
              },
            })
          : null;
      return {
        fresh: true as const,
        eventId,
        conversationId,
        messageId: inserted[0].id,
      };
    });

    if (result.fresh) {
      if (result.eventId) await tryPublishOutboxEvent(result.eventId);
      log.info('webhook.message_accepted', 'Inbound message accepted', {
        account_id: connection.accountId,
        conversation_id: result.conversationId,
        message_id: result.messageId,
      });
    }
  }
}

// Meta `account_update` events that leave the whole WABA unusable for sending.
// Any other event (PHONE_NUMBER_ADDED, ACCOUNT_VERIFIED, PIN_CHANGED, …) is
// informational and must not revoke a working connection. ACCOUNT_RESTRICTION is
// deliberately absent: it also covers soft restrictions (a lowered messaging
// tier, "cannot add a phone number") that leave sending fully functional, and
// re-running Embedded Signup cannot clear a revocation. PHONE_NUMBER_REMOVED is
// handled separately — it names one number, not the account.
const DISABLING_ACCOUNT_EVENTS: Record<
  string,
  'partner_removed' | 'account_disconnected'
> = {
  PARTNER_REMOVED: 'partner_removed',
  DISABLED_UPDATE: 'account_disconnected',
  ACCOUNT_VIOLATION: 'account_disconnected',
  ACCOUNT_DELETED: 'account_disconnected',
};

/** Revoke the active connections on the WABA that `extra` narrows to. */
async function revokeActiveConnections(
  wabaId: string,
  reason: 'partner_removed' | 'account_disconnected',
  extra?: SQL,
): Promise<number> {
  const connections = await db
    .select({
      id: whatsappConnections.id,
      accountId: whatsappConnections.accountId,
    })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.wabaId, wabaId),
        eq(whatsappConnections.status, 'active'),
        ...(extra ? [extra] : []),
      ),
    );

  for (const connection of connections) {
    await markConnectionRevoked({
      connectionId: connection.id,
      accountId: connection.accountId,
      reason,
    });
  }
  return connections.length;
}

/**
 * PHONE_NUMBER_REMOVED names one number on the WABA; the others keep sending, so
 * match the payload's number against the connection instead of revoking the
 * account. Meta formats `phone_number` for display ("+1 555-123-4567"), hence the
 * digits-only comparison against `display_phone_number`.
 */
async function handlePhoneNumberRemoved(
  wabaId: string,
  value: WhatsappChangeValue,
  trace_id: string,
): Promise<void> {
  const log = createLogger({ trace_id });
  const phoneNumber = value.phone_number ?? '';
  const digits = phoneNumber.replace(/\D/g, '');
  if (!digits) {
    log.warn(
      'webhook.phone_number_removed_unmatched',
      'PHONE_NUMBER_REMOVED carried no phone number',
      { waba_id: wabaId },
    );
    return;
  }

  const revoked = await revokeActiveConnections(
    wabaId,
    'account_disconnected',
    or(
      eq(whatsappConnections.phoneNumberId, phoneNumber),
      sql`regexp_replace(COALESCE(${whatsappConnections.displayPhoneNumber}, ''), '[^0-9]', '', 'g') = ${digits}`,
    ),
  );

  if (revoked === 0) {
    log.warn(
      'webhook.phone_number_removed_unmatched',
      'No active connection matches the removed phone number',
      { waba_id: wabaId },
    );
  }
}

async function handleAccountUpdate(
  wabaId: string,
  value: WhatsappChangeValue,
  trace_id: string,
): Promise<void> {
  const log = createLogger({ trace_id });
  const event = value.event;

  if (event === 'PHONE_NUMBER_REMOVED') {
    await handlePhoneNumberRemoved(wabaId, value, trace_id);
    return;
  }

  // Worth watching (it can precede a violation) but not a disconnection: leaving
  // the connection active keeps reminders and chat sends working.
  if (event === 'ACCOUNT_RESTRICTION') {
    log.warn(
      'webhook.account_restricted',
      'Meta reported a restriction on the WABA',
      { waba_id: wabaId },
    );
    return;
  }

  const reason = event ? DISABLING_ACCOUNT_EVENTS[event] : undefined;
  if (!reason) {
    log.warn(
      'webhook.account_update_ignored',
      'Ignoring account_update event',
      { event: event ?? null, waba_id: wabaId },
    );
    return;
  }

  await revokeActiveConnections(wabaId, reason);
}
