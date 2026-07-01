import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { patients, pts } from '@/lib/db/schema';
import { privacyName } from '@/lib/format/name';
import { resolveNotificationPrefs } from '@/lib/pwa/read-models';
import { buildPushPayload, pushPrefKey, type PushEvent } from './push-payload';
import { sendPush } from './push';

export type DispatchResult =
  | { status: 'sent' }
  | {
      status: 'skipped';
      reason: 'pt_not_found' | 'pref_disabled' | 'no_payload';
    };

/**
 * Resolve the PT's preferences + patient name, build the push payload, and fan
 * it out. Pure enough to test directly without the Inngest runtime.
 */
export async function dispatchPushForEvent(
  event: PushEvent,
): Promise<DispatchResult> {
  const { ptId } = event.data;

  const [pt] = await db
    .select({
      timezone: pts.timezone,
      notificationPrefs: pts.notificationPrefs,
    })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);
  if (!pt) return { status: 'skipped', reason: 'pt_not_found' };

  const prefs = resolveNotificationPrefs(pt.notificationPrefs);
  if (!prefs[pushPrefKey(event)]) {
    return { status: 'skipped', reason: 'pref_disabled' };
  }

  const patientId = 'patientId' in event.data ? event.data.patientId : undefined;
  let patientName: string | undefined;
  if (patientId) {
    const [patient] = await db
      .select({ name: patients.name })
      .from(patients)
      .where(and(eq(patients.id, patientId), eq(patients.ptId, ptId)))
      .limit(1);
    if (patient) patientName = privacyName(patient.name);
  }

  const payload = buildPushPayload(event, {
    patientName,
    timezone: pt.timezone ?? 'Europe/Berlin',
  });
  if (!payload) return { status: 'skipped', reason: 'no_payload' };

  await sendPush(ptId, payload);
  return { status: 'sent' };
}
