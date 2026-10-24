import { z } from 'zod';
import { FUNNEL_STEPS, recordOnboardingEvent } from '@/lib/onboarding/funnel';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 1024;
const bodySchema = z.object({ screen: z.enum(FUNNEL_STEPS) });

/**
 * Sink for the "screen shown" beacon (`components/onboarding/report-step-shown.ts`,
 * MED-125). Always 204, like the Web Vitals sink: a rejected beacon is not worth
 * surfacing and a distinguishing status would only help probing. The account
 * comes from the session, never from the body; the body is capped at 1 KB and
 * the screen id is allowlisted. Eligibility (guided, not completed) is decided
 * by `recordOnboardingEvent`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (contentLength > MAX_BODY_BYTES) return noContent();

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return noContent();

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return noContent();
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return noContent();

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return noContent();

    await recordOnboardingEvent(user.id, parsed.data.screen, 'shown');
  } catch {
    // Never surfaced: the funnel must not affect the user.
  }
  return noContent();
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}
