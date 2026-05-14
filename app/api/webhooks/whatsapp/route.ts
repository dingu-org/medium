import { type NextRequest } from 'next/server';
import { sql, eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages, patients, whatsappConnections } from '@/lib/db/schema';
import { inngest } from '@/lib/inngest/client';
import { verifySignature } from '@/lib/channels/whatsapp/signature';
import { whatsappWebhookPayload, type WhatsappChangeValue } from '@/lib/channels/whatsapp/payload';

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
    console.warn('[whatsapp-webhook] rejected: bad signature', { hasHeader: header !== null });
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
    console.warn('[whatsapp-webhook] rejected: schema mismatch', { issues: parsed.error.issues });
    return new Response('Bad payload', { status: 400 });
  }

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      await handleMessagesChange(change.value);
    }
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
}

async function handleMessagesChange(value: WhatsappChangeValue): Promise<void> {
  const phoneNumberId = value.metadata.phone_number_id;
  const [connection] = await db
    .select({ ptId: whatsappConnections.ptId })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.phoneNumberId, phoneNumberId))
    .limit(1);

  if (!connection) {
    console.warn('[whatsapp-webhook] unknown phone_number_id', { phoneNumberId });
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
        throw new Error(`[whatsapp-webhook] patient row missing after upsert (wa_id=${msg.from})`);
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

      return inserted.length === 1
        ? { fresh: true as const, messageId: inserted[0].id, conversationId: conversation.id }
        : { fresh: false as const };
    });

    if (result.fresh) {
      try {
        await inngest.send({
          name: 'message.received',
          data: { messageId: result.messageId, ptId, conversationId: result.conversationId },
        });
      } catch (err) {
        console.warn('[whatsapp-webhook] inngest.send failed (message still persisted)', {
          messageId: result.messageId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
