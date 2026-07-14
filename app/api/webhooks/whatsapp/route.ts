import { type NextRequest } from 'next/server';
import { sql, eq, and, or, isNull, type SQL, type SQLWrapper } from 'drizzle-orm';
import { db, type DBTransaction } from '@/lib/db';
import {
  conversations,
  messages,
  patients,
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
  whatsappWebhookPayload,
  type WhatsappChangeValue,
} from '@/lib/channels/whatsapp/payload';

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
          await handleAccountUpdate(entry.id, change.value);
          break;
        default:
          break;
      }
    }
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
}

type WebhookConnection = { id: string; ptId: string; wabaId: string };

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
      ptId: whatsappConnections.ptId,
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
  const { ptId } = connection;

  for (const msg of value.messages ?? []) {
    if (msg.type !== 'text' || !msg.text) {
      log.warn('webhook.skipping_non_text_message', 'Skipping non-text message', {
        type: msg.type,
        externalId: msg.id,
      });
      continue;
    }
    const contact = value.contacts?.find((c) => c.wa_id === msg.from);
    const name = contact?.profile?.name ?? msg.from;
    const content = msg.text.body;

    const result = await db.transaction(async (tx) => {
      await linkManualPatient(tx, ptId, msg.from);
      await tx
        .insert(patients)
        .values({ ptId, name, phone: msg.from, waId: msg.from })
        .onConflictDoNothing({ target: [patients.ptId, patients.waId] });

      const [patient] = await tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.ptId, ptId), eq(patients.waId, msg.from)))
        .limit(1);

      if (!patient) {
        throw new Error(
          `[whatsapp-webhook] patient row missing after upsert (wa_id=${msg.from})`,
        );
      }

      const insertedConversation = await tx
        .insert(conversations)
        .values({
          ptId,
          patientId: patient.id,
          channel: 'whatsapp',
        })
        .onConflictDoNothing({
          target: [conversations.patientId, conversations.channel],
        })
        .returning({ id: conversations.id });
      const [existingConversation] = insertedConversation.length
        ? insertedConversation
        : await tx
            .select({ id: conversations.id })
            .from(conversations)
            .where(
              and(
                eq(conversations.patientId, patient.id),
                eq(conversations.channel, 'whatsapp'),
              ),
            )
            .limit(1);
      if (!existingConversation) {
        throw new Error(
          `[whatsapp-webhook] conversation row missing after upsert (patient_id=${patient.id})`,
        );
      }

      const inserted = await tx
        .insert(messages)
        .values({
          ptId,
          conversationId: existingConversation.id,
          externalId: msg.id,
          role: 'patient',
          channel: 'whatsapp',
          content,
        })
        .onConflictDoNothing({ target: messages.externalId })
        .returning({ id: messages.id });

      if (inserted.length !== 1) return { fresh: false as const };

      await tx
        .update(conversations)
        .set({
          lastInboundAt: sql`now()`,
          closedAt: null,
          aiActive: sql`CASE WHEN ${conversations.closedAt} IS NOT NULL THEN true ELSE ${conversations.aiActive} END`,
          escalationState: sql`CASE WHEN ${conversations.closedAt} IS NOT NULL THEN 'idle' ELSE ${conversations.escalationState} END`,
        })
        .where(eq(conversations.id, existingConversation.id));

      const messageId = inserted[0].id;
      const eventId = await appendBackgroundEvent(tx, {
        type: 'message.received',
        data: {
          messageId,
          ptId,
          conversationId: existingConversation.id,
          traceId: trace_id,
        },
      });
      return {
        fresh: true as const,
        messageId,
        conversationId: existingConversation.id,
        eventId,
      };
    });

    if (result.fresh) {
      await tryPublishOutboxEvent(result.eventId);
      log.info('webhook.message_accepted', 'Inbound message accepted', {
        pt_id: ptId,
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
  ptId: string;
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
      ptId: args.ptId,
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

/** First-write-wins: stamp `delivered_at` on the reminder job for this wamid. */
async function markReminderDelivered(
  ptId: string,
  wamid: string,
  ts: Date,
): Promise<void> {
  await db.execute(sql`
    UPDATE reminder_jobs AS rj
    SET delivered_at = ${ts.toISOString()}::timestamptz
    FROM messages AS m
    WHERE m.external_id = ${wamid}
      AND m.pt_id = ${ptId}
      AND rj.message_id = m.id
      AND rj.pt_id = ${ptId}
      AND rj.delivered_at IS NULL
  `);
}

/**
 * A `failed` status for a reminder whose template Meta accepted then dropped:
 * mark the job failed and emit `reminder.failed` (existing push/bell/flag
 * pipeline). Guarded so an already-delivered or already-answered reminder is
 * never re-flagged.
 */
async function failReminderDelivery(args: {
  ptId: string;
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
        AND m.pt_id = ${args.ptId}
        AND rj.message_id = m.id
        AND rj.pt_id = ${args.ptId}
        AND rj.status = 'sent'
        AND rj.delivered_at IS NULL
        AND rj.response_type IS NULL
      RETURNING rj.appointment_id AS "appointmentId"
    `);
    const [row] = affected;
    if (!row) return null;
    const eventId = await appendBackgroundEvent(tx, {
      type: 'reminder.failed',
      data: {
        ptId: args.ptId,
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
      { pt_id: args.ptId, appointment_id: result.appointmentId },
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
  const { ptId } = connection;

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
      ptId,
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
      await markReminderDelivered(ptId, status.id, ts);
    } else if (narrowed === 'failed') {
      const firstError = status.errors?.[0];
      const reason = firstError
        ? errorText(firstError)
        : 'template_delivery_failed';
      await failReminderDelivery({ ptId, wamid: status.id, reason, trace_id });
    }
  }
}

async function linkManualPatient(
  tx: DBTransaction,
  ptId: string,
  waId: string,
): Promise<void> {
  const [existing] = await tx
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.ptId, ptId), eq(patients.waId, waId)))
    .limit(1);
  if (existing) return;

  const digits = waId.replace(/\D/g, '');
  if (!digits) return;
  const [manual] = await tx
    .select({ id: patients.id })
    .from(patients)
    .where(
      and(
        eq(patients.ptId, ptId),
        isNull(patients.waId),
        sql`regexp_replace(${patients.phone}, '[^0-9]', '', 'g') = ${digits}`,
      ),
    )
    .limit(1);
  if (!manual) return;

  await tx
    .update(patients)
    .set({ waId })
    .where(
      and(
        eq(patients.id, manual.id),
        eq(patients.ptId, ptId),
        isNull(patients.waId),
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

  for (const item of value.state_sync ?? []) {
    if (item.type && item.type !== 'contact') continue;
    const contact = item.contact;
    const phone = contact?.phone_number;
    if (!phone) continue;

    const action = item.action ?? null;
    const lastSyncedAt = parseWebhookTimestamp(item.metadata?.timestamp);
    const deletedAt = isDeleteAction(item.action) ? lastSyncedAt : null;

    await db
      .insert(whatsappContacts)
      .values({
        ptId: connection.ptId,
        phone,
        waId: contact.wa_id ?? phone,
        fullName: contact.full_name ?? null,
        firstName: contact.first_name ?? null,
        sourceAction: action,
        lastSyncedAt,
        deletedAt,
      })
      .onConflictDoUpdate({
        target: [whatsappContacts.ptId, whatsappContacts.phone],
        set: {
          waId: contact.wa_id ?? phone,
          fullName: contact.full_name ?? null,
          firstName: contact.first_name ?? null,
          sourceAction: action,
          lastSyncedAt,
          deletedAt,
        },
      });
  }
}

async function contactName(ptId: string, phone: string): Promise<string> {
  const [contact] = await db
    .select({
      fullName: whatsappContacts.fullName,
      firstName: whatsappContacts.firstName,
    })
    .from(whatsappContacts)
    .where(
      and(
        eq(whatsappContacts.ptId, ptId),
        or(eq(whatsappContacts.phone, phone), eq(whatsappContacts.waId, phone)),
      ),
    )
    .limit(1);
  return contact?.fullName ?? contact?.firstName ?? phone;
}

async function ensureWhatsappConversation(
  tx: DBTransaction,
  args: {
    ptId: string;
    waId: string;
    name: string;
    lastInboundAt?: true;
    pauseUntil?: Date;
  },
): Promise<{ patientId: string; conversationId: string }> {
  await linkManualPatient(tx, args.ptId, args.waId);
  await tx
    .insert(patients)
    .values({
      ptId: args.ptId,
      name: args.name,
      phone: args.waId,
      waId: args.waId,
    })
    .onConflictDoNothing({ target: [patients.ptId, patients.waId] });

  const [patient] = await tx
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.ptId, args.ptId), eq(patients.waId, args.waId)))
    .limit(1);

  if (!patient) {
    throw new Error(
      `[whatsapp-webhook] patient row missing after upsert (wa_id=${args.waId})`,
    );
  }

  const baseValues = {
    ptId: args.ptId,
    patientId: patient.id,
    channel: 'whatsapp',
    ...(args.lastInboundAt ? { lastInboundAt: sql`now()` } : {}),
    ...(args.pauseUntil
      ? {
          aiActive: false,
          aiPausedUntil: args.pauseUntil,
          aiPauseReason: 'whatsapp_business_app_echo',
          escalationState: 'idle',
        }
      : {}),
  };
  const updateValues = args.lastInboundAt
    ? {
        lastInboundAt: sql`now()`,
        closedAt: null,
        aiActive: sql`CASE WHEN ${conversations.closedAt} IS NOT NULL THEN true ELSE ${conversations.aiActive} END`,
        escalationState: sql`CASE WHEN ${conversations.closedAt} IS NOT NULL THEN 'idle' ELSE ${conversations.escalationState} END`,
      }
    : args.pauseUntil
      ? {
          aiActive: false,
          aiPausedUntil: args.pauseUntil,
          aiPauseReason: 'whatsapp_business_app_echo',
          escalationState: 'idle',
        }
      : {};

  const [conversation] = await tx
    .insert(conversations)
    .values(baseValues)
    .onConflictDoUpdate({
      target: [conversations.patientId, conversations.channel],
      set: updateValues,
    })
    .returning({ id: conversations.id });

  return { patientId: patient.id, conversationId: conversation.id };
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

    const patientWaId = echo.to;
    const name = await contactName(connection.ptId, patientWaId);
    const pauseUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const result = await db.transaction(async (tx) => {
      const { patientId, conversationId } = await ensureWhatsappConversation(
        tx,
        {
          ptId: connection.ptId,
          waId: patientWaId,
          name,
          pauseUntil,
        },
      );

      const inserted = await tx
        .insert(messages)
        .values({
          ptId: connection.ptId,
          conversationId,
          externalId: echo.id,
          role: 'pt',
          channel: 'whatsapp',
          content: echo.text!.body,
        })
        .onConflictDoNothing({ target: messages.externalId })
        .returning({ id: messages.id });

      if (inserted.length !== 1) return { fresh: false as const };

      const eventId = await appendBackgroundEvent(tx, {
        type: 'conversation.ai_paused',
        data: {
          ptId: connection.ptId,
          conversationId,
          patientId,
          pausedUntil: pauseUntil.toISOString(),
          reason: 'whatsapp_business_app_echo',
        },
      });
      return {
        fresh: true as const,
        eventId,
        conversationId,
        messageId: inserted[0].id,
      };
    });

    if (result.fresh) {
      await tryPublishOutboxEvent(result.eventId);
      log.info('webhook.message_accepted', 'Inbound message accepted', {
        pt_id: connection.ptId,
        conversation_id: result.conversationId,
        message_id: result.messageId,
      });
    }
  }
}

async function handleAccountUpdate(
  wabaId: string,
  value: WhatsappChangeValue,
): Promise<void> {
  if (value.event !== 'PARTNER_REMOVED') return;

  const connections = await db
    .select({
      id: whatsappConnections.id,
      ptId: whatsappConnections.ptId,
    })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.wabaId, wabaId),
        eq(whatsappConnections.status, 'active'),
      ),
    );

  for (const connection of connections) {
    await markConnectionRevoked({
      connectionId: connection.id,
      ptId: connection.ptId,
      reason: 'partner_removed',
    });
  }
}
