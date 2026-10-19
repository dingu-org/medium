import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import {
  createLogger,
  newTraceId,
  redactAttrs,
  serializeError,
} from '@/lib/log';
import { createServerClient } from '@/lib/supabase/server';
import { MAX_SIGNUP_MESSAGE_SUMMARIES } from '@/app/(dashboard)/settings/whatsapp-signup';

export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

const text = z.string().max(200);

const messageSchema = z
  .object({
    origin: text,
    originAccepted: z.boolean(),
    type: text.optional(),
    event: text.optional(),
    hasNumberId: z.boolean(),
    hasWabaId: z.boolean(),
    currentStep: text.optional(),
    errorId: text.optional(),
    errorMessage: text.optional(),
    sessionId: text.optional(),
  })
  .strict();

// Strict on purpose: the trail is stored for 730 days, so nothing the schema
// does not name — an auth code, a phone number id — can ride along.
const bodySchema = z
  .object({
    attemptId: z.string().uuid(),
    outcome: z.enum([
      'started',
      'cancelled_by_user',
      'no_code',
      'no_finish_message',
      'unsupported_event',
      'missing_waba',
      'missing_number',
      'post_ok',
      'post_failed',
      'threw',
      'page_unloaded',
      'resumed_after_reload',
    ]),
    loginStatus: text.optional(),
    hasCode: z.boolean().optional(),
    messages: z
      .array(messageSchema)
      .max(MAX_SIGNUP_MESSAGE_SUMMARIES)
      .optional(),
    elapsedMs: z.number().int().nonnegative().optional(),
    displayMode: z.enum(['standalone', 'browser']).optional(),
    httpStatus: z.number().int().optional(),
    errorKind: text.optional(),
    serverTraceId: text.optional(),
    errorName: text.optional(),
    errorMessage: text.optional(),
  })
  .strict();

/**
 * Embedded Signup client diagnostics. The browser half of the signup causes no
 * request of its own unless it succeeds far enough to POST the callback, and
 * platform logs are short-lived, so the settings client reports each attempt's
 * start and outcome here and we keep it in `audit_log`. Same CSRF posture as
 * the callback: authenticated session + exact Origin. Never fails the caller —
 * a diagnostics outage must not be able to break a signup.
 */
export async function POST(req: NextRequest) {
  const trace_id = newTraceId();
  const log = createLogger({ trace_id });

  if (req.headers.get('origin') !== APP_URL) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  let report: z.infer<typeof bodySchema>;
  try {
    report = bodySchema.parse(await req.json());
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // E.164 scrub over Meta's free-text error message before it is stored.
  const metadata = redactAttrs(report) as Record<string, unknown>;
  const level =
    report.outcome === 'started' || report.outcome === 'post_ok'
      ? 'info'
      : 'warn';
  log[level]('meta_embedded.client_outcome', 'Embedded Signup client outcome', {
    account_id: user.id,
    ...metadata,
  });

  try {
    await db.insert(auditLog).values({
      accountId: user.id,
      actor: 'account',
      action: 'wa.signup.client_outcome',
      targetTable: 'whatsapp_connections',
      metadata,
    });
  } catch (err) {
    log.error(
      'meta_embedded.diagnostics_write_failed',
      'Could not persist Embedded Signup diagnostics',
      { account_id: user.id, ...serializeError(err) },
    );
  }

  return new Response(null, { status: 204 });
}
