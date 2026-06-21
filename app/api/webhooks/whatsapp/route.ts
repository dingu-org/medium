import { type NextRequest } from 'next/server';
import { sql, eq, and, or } from 'drizzle-orm';
import { db, type DBTransaction } from '@/lib/db';
import {
  conversations,
  messages,
  patients,
  whatsappConnections,
  whatsappContacts,
} from '@/lib/db/schema';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { markConnectionRevoked } from '@/lib/channels/whatsapp/client';
import { verifySignature } from '@/lib/channels/whatsapp/signature';
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
  const header = req.headers.get('x-hub-signature-256');

  if (!verifySignature({ rawBody, header, secret: APP_SECRET })) {
    console.warn('[whatsapp-webhook] rejected: bad signature', {
      hasHeader: header !== null,
    });
    return new Response('Invalid signature', { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    console.warn('[whatsapp-webhook] rejected: invalid JSON');
    return new Response('Bad payload', { status: 400 });
  }

  const parsed = whatsappWebhookPayload.safeParse(json);
  if (!parsed.success) {
    console.warn('[whatsapp-webhook] rejected: schema mismatch', {
      issues: parsed.error.issues,
    });
    return new Response('Bad payload', { status: 400 });
  }

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      switch (change.field) {
        case 'messages':
          await handleMessagesChange(change.value);
          break;
        case 'history':
          await handleHistoryChange(change.value);
          break;
        case 'smb_app_state_sync':
          await handleAppStateSyncChange(change.value);
          break;
        case 'smb_message_echoes':
          await handleMessageEchoesChange(change.value);
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
): Promise<WebhookConnection | null> {
  if (!phoneNumberId) {
    console.warn('[whatsapp-webhook] missing phone_number_id', { source });
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
    console.warn('[whatsapp-webhook] unknown phone_number_id', {
      phoneNumberId,
      source,
    });
    return null;
  }
  return connection;
}

async function handleMessagesChange(value: WhatsappChangeValue): Promise<void> {
  if (value.errors?.some((error) => error.code === 131060)) {
    console.warn('[whatsapp-webhook] unsupported coexistence request', {
      codes: value.errors.map((error) => error.code).filter(Boolean),
    });
    return;
  }
  const connection = await loadConnectionByPhoneNumberId(
    value.metadata?.phone_number_id,
    'messages',
  );
  if (!connection) {
    return;
  }
  const { ptId } = connection;

  for (const msg of value.messages ?? []) {
    if (msg.type !== 'text' || !msg.text) {
      console.warn('[whatsapp-webhook] skipping non-text message', {
        type: msg.type,
        externalId: msg.id,
      });
      continue;
    }
    const contact = value.contacts?.find((c) => c.wa_id === msg.from);
    const name = contact?.profile?.name ?? msg.from;
    const content = msg.text.body;

    const result = await db.transaction(async (tx) => {
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

      const [conversation] = await tx
        .insert(conversations)
        .values({
          ptId,
          patientId: patient.id,
          channel: 'whatsapp',
          lastInboundAt: sql`now()`,
        })
        .onConflictDoUpdate({
          target: [conversations.patientId, conversations.channel],
          set: { lastInboundAt: sql`now()` },
        })
        .returning({ id: conversations.id });

      const inserted = await tx
        .insert(messages)
        .values({
          ptId,
          conversationId: conversation.id,
          externalId: msg.id,
          role: 'patient',
          channel: 'whatsapp',
          content,
        })
        .onConflictDoNothing({ target: messages.externalId })
        .returning({ id: messages.id });

      if (inserted.length !== 1) return { fresh: false as const };

      const messageId = inserted[0].id;
      const eventId = await appendBackgroundEvent(tx, {
        type: 'message.received',
        data: { messageId, ptId, conversationId: conversation.id },
      });
      return {
        fresh: true as const,
        messageId,
        conversationId: conversation.id,
        eventId,
      };
    });

    if (result.fresh) {
      await tryPublishOutboxEvent(result.eventId);
    }
  }
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

async function handleHistoryChange(value: WhatsappChangeValue): Promise<void> {
  const connection = await loadConnectionByPhoneNumberId(
    value.metadata?.phone_number_id,
    'history',
  );
  if (!connection) return;

  let syncStatus:
    | 'syncing'
    | 'complete'
    | 'failed'
    | 'history_declined' = 'syncing';
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
): Promise<void> {
  const connection = await loadConnectionByPhoneNumberId(
    value.metadata?.phone_number_id,
    'smb_app_state_sync',
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
    ? { lastInboundAt: sql`now()` }
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
): Promise<void> {
  const connection = await loadConnectionByPhoneNumberId(
    value.metadata?.phone_number_id,
    'smb_message_echoes',
  );
  if (!connection) return;

  for (const echo of value.message_echoes ?? []) {
    if (echo.type !== 'text' || !echo.text) {
      console.warn('[whatsapp-webhook] skipping non-text message echo', {
        type: echo.type,
        externalId: echo.id,
      });
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
      return { fresh: true as const, eventId };
    });

    if (result.fresh) {
      await tryPublishOutboxEvent(result.eventId);
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
