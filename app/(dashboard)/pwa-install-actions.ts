'use server';

import { db } from '@/lib/db';
import { appendBackgroundEvent } from '@/lib/events/background';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Best-effort funnel metric: records that the current PT accepted the
 * install prompt. No consumer listens for `pwa.installed` — the outbox row
 * it also produces just drains with no matching Inngest trigger. A failure
 * here must never surface to the install flow, so it's swallowed.
 */
async function recordPwaInstalledImpl(): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  try {
    await db.transaction((tx) =>
      appendBackgroundEvent(tx, {
        type: 'pwa.installed',
        data: { ptId: user.id },
      }),
    );
  } catch {
    // swallow: metric recording must never fail the install flow.
  }
}

export const recordPwaInstalled = instrumentedAction(
  'pwa.recordPwaInstalled',
  recordPwaInstalledImpl,
);
