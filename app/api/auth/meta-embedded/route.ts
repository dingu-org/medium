import { type NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { getServiceClient, withAuditLog } from '@/lib/tenancy';
import { createServerClient } from '@/lib/supabase/server';
import { graphFetch } from '@/lib/channels/whatsapp/graph';
import {
  GraphApiError,
  MetaSignupError,
  type MetaSignupErrorKind,
} from '@/lib/channels/whatsapp/errors';

export const runtime = 'nodejs';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const APP_ID = requireEnv('META_APP_ID');
const APP_SECRET = requireEnv('META_APP_SECRET');
const APP_URL = requireEnv('NEXT_PUBLIC_APP_URL');

const bodySchema = z.object({
  code: z.string().min(1),
  phoneNumberId: z.string().min(1).optional(),
  wabaId: z.string().min(1),
  mode: z.enum(['cloud_api', 'coexistence']).default('coexistence'),
});

const STATUS_BY_KIND: Record<MetaSignupErrorKind, number> = {
  duplicate_number: 409,
  token_exchange_failed: 400,
  rejected: 400,
  graph_error: 502,
};

/**
 * Embedded Signup callback. The settings-page client runs Meta's JS-SDK popup,
 * which returns { code, phone_number_id, waba_id }, then POSTs them here. We
 * exchange the code for the PT's business token, wire up the number on Meta's
 * side, and persist an encrypted connection. CSRF is bound by the authenticated
 * session + an Origin check — there is no redirect round-trip to carry a state token.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== APP_URL) {
    console.warn('[meta-embedded] rejected: bad origin', {
      origin: req.headers.get('origin'),
    });
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }
  const ptId = user.id;

  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await req.json());
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const { code, wabaId, mode } = payload;

  try {
    const token = await exchangeCodeForToken(code);
    const phoneNumberId = await resolvePhoneNumberId({
      wabaId,
      token: token.accessToken,
      providedPhoneNumberId: payload.phoneNumberId,
      mode,
    });

    if (mode === 'cloud_api') {
      await registerPhoneNumber(phoneNumberId, token.accessToken);
    }
    await subscribeApp(wabaId, token.accessToken); // also validates the token before we persist

    const encrypted = await encryptToken(token.accessToken);
    const tokenExpiresAt = new Date(
      Date.now() + (token.expiresInSeconds ?? 60 * 24 * 60 * 60) * 1000,
    );
    const { eventId } = await withAuditLog(
      {
        ptId,
        actor: 'pt',
        action: 'wa.token.issued',
        targetTable: 'whatsapp_connections',
        metadata: { phone_number_id: phoneNumberId, waba_id: wabaId },
      },
      () =>
        persistConnection({
          ptId,
          phoneNumberId,
          wabaId,
          mode,
          encrypted,
          tokenExpiresAt,
        }),
    );
    await tryPublishOutboxEvent(eventId);

    return Response.json({ ok: true, status: 'active' }, { status: 200 });
  } catch (err) {
    if (err instanceof MetaSignupError) {
      console.warn('[meta-embedded] signup failed', { kind: err.kind, ptId });
      return Response.json(
        { ok: false, error: err.kind },
        { status: STATUS_BY_KIND[err.kind] },
      );
    }
    console.error('[meta-embedded] unexpected error', {
      ptId,
      err: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, error: 'graph_error' }, { status: 502 });
  }
}

async function resolvePhoneNumberId(args: {
  wabaId: string;
  token: string;
  providedPhoneNumberId?: string;
  mode: 'cloud_api' | 'coexistence';
}): Promise<string> {
  if (args.providedPhoneNumberId) return args.providedPhoneNumberId;
  if (args.mode === 'cloud_api') {
    throw new MetaSignupError(
      'rejected',
      'Cloud API signup did not provide a phone_number_id',
    );
  }

  let res: {
    data?: {
      id?: string;
      platform_type?: string;
      is_on_biz_app?: boolean;
      display_phone_number?: string;
    }[];
  };
  try {
    res = await graphFetch(args.wabaId + '/phone_numbers', {
      token: args.token,
      searchParams: {
        fields: 'id,display_phone_number,platform_type,is_on_biz_app',
      },
    });
  } catch (err) {
    throw new MetaSignupError(
      'graph_error',
      err instanceof Error ? err.message : undefined,
    );
  }

  const numbers = (res.data ?? []).filter((row) => row.id);
  const appNumbers = numbers.filter((row) => row.is_on_biz_app === true);
  const chosen = appNumbers.length === 1 ? appNumbers[0] : numbers[0];
  if (!chosen?.id || (appNumbers.length !== 1 && numbers.length !== 1)) {
    throw new MetaSignupError(
      'rejected',
      'Could not resolve a unique WhatsApp Business app phone number',
    );
  }
  return chosen.id;
}

/** Exchange the Embedded Signup auth code for the long-lived business token. */
async function exchangeCodeForToken(
  code: string,
): Promise<{ accessToken: string; expiresInSeconds?: number }> {
  let res: { access_token?: string; expires_in?: number };
  try {
    res = await graphFetch<{ access_token?: string }>('oauth/access_token', {
      searchParams: { client_id: APP_ID, client_secret: APP_SECRET, code },
    });
  } catch (err) {
    throw new MetaSignupError(
      'token_exchange_failed',
      err instanceof Error ? err.message : undefined,
    );
  }
  if (!res.access_token) {
    throw new MetaSignupError(
      'token_exchange_failed',
      'No access_token in response',
    );
  }
  return {
    accessToken: res.access_token,
    expiresInSeconds:
      typeof res.expires_in === 'number' && res.expires_in > 0
        ? res.expires_in
        : undefined,
  };
}

/**
 * Enable Cloud API for the number. Best-effort: Embedded Signup numbers are
 * usually pre-registered, so a failure here should not block the connection.
 */
async function registerPhoneNumber(
  phoneNumberId: string,
  token: string,
): Promise<void> {
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  try {
    await graphFetch(`${phoneNumberId}/register`, {
      method: 'POST',
      token,
      body: { messaging_product: 'whatsapp', pin },
    });
  } catch (err) {
    console.warn('[meta-embedded] phone register skipped/failed (continuing)', {
      phoneNumberId,
      status: err instanceof GraphApiError ? err.status : undefined,
    });
  }
}

/** Subscribe our app to this WABA so its inbound messages reach our webhook. */
async function subscribeApp(wabaId: string, token: string): Promise<void> {
  await graphFetch(`${wabaId}/subscribed_apps`, { method: 'POST', token });
}

// Drizzle wraps driver errors in DrizzleQueryError, so the Postgres SQLSTATE
// ('23505' = unique_violation) lives on `.cause`. Walk the chain to find it.
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (
      typeof current === 'object' &&
      'code' in current &&
      (current as { code?: string }).code === '23505'
    ) {
      return true;
    }
    current =
      typeof current === 'object' && 'cause' in current
        ? (current as { cause?: unknown }).cause
        : null;
  }
  return false;
}

/**
 * Insert the connection. On a phone-number collision: the same PT reconnecting
 * updates their row (token refresh); a different PT is a duplicate-number conflict.
 */
async function persistConnection(args: {
  ptId: string;
  phoneNumberId: string;
  wabaId: string;
  mode: 'cloud_api' | 'coexistence';
  encrypted: Buffer;
  tokenExpiresAt: Date;
}): Promise<{ connectionId: string; eventId: string }> {
  const { ptId, phoneNumberId, wabaId, mode, encrypted, tokenExpiresAt } = args;
  const svc = getServiceClient(ptId);
  const coexistence = mode === 'coexistence';

  try {
    return await svc.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(whatsappConnections)
        .values({
          ptId,
          phoneNumberId,
          wabaId,
          accessTokenEncrypted: encrypted,
          mode,
          coexistenceSyncStatus: coexistence ? 'pending' : 'not_applicable',
          coexistenceSyncDeadlineAt: coexistence
            ? sql`now() + interval '24 hours'`
            : null,
          coexistenceContactsRequestId: null,
          coexistenceHistoryRequestId: null,
          coexistenceLastProgress: null,
          coexistenceLastError: null,
          status: 'active',
          connectedAt: sql`now()`,
          tokenExpiresAt,
        })
        .returning({ id: whatsappConnections.id });
      const eventId = await appendBackgroundEvent(tx, {
        type: 'wa.connection.created',
        data: {
          ptId,
          connectionId: row.id,
          phoneNumberId,
          wabaId,
          mode,
        },
      });
      return { connectionId: row.id, eventId };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    const [existing] = await db
      .select({ id: whatsappConnections.id, ptId: whatsappConnections.ptId })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.phoneNumberId, phoneNumberId))
      .limit(1);

    if (!existing || existing.ptId !== ptId) {
      throw new MetaSignupError('duplicate_number');
    }

    return db.transaction(async (tx) => {
      await tx
        .update(whatsappConnections)
        .set({
          wabaId,
          accessTokenEncrypted: encrypted,
          mode,
          coexistenceSyncStatus: coexistence ? 'pending' : 'not_applicable',
          coexistenceSyncDeadlineAt: coexistence
            ? sql`now() + interval '24 hours'`
            : null,
          coexistenceContactsRequestId: null,
          coexistenceHistoryRequestId: null,
          coexistenceLastProgress: null,
          coexistenceLastError: null,
          status: 'active',
          connectedAt: sql`now()`,
          tokenExpiresAt,
          expiryWarningSentAt: null,
        })
        .where(eq(whatsappConnections.id, existing.id));
      const eventId = await appendBackgroundEvent(tx, {
        type: 'wa.connection.created',
        data: {
          ptId,
          connectionId: existing.id,
          phoneNumberId,
          wabaId,
          mode,
        },
      });
      return { connectionId: existing.id, eventId };
    });
  }
}
