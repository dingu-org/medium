import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { patients, pts } from '@/lib/db/schema';
import { privacyName } from '@/lib/format/name';
import { resolveNotificationPrefs } from '@/lib/pwa/read-models';
import { buildPushPayload, pushPrefKey, type PushEvent } from './push-payload';
import { sendPush } from './push';

export type DispatchResult =
  | { status: 'sent'; sent: number; removed: number }
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

  const patientId =
    'patientId' in event.data ? event.data.patientId : undefined;
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

  const { sent, removed } = await sendPush(ptId, payload);
  // Surfacing the fan-out counts up to the Inngest step return gives Phase 11 a
  // free per-dispatch delivery signal in the run history. A dispatch where every
  // subscription turned out stale (removed>0, sent===0) means we believed we
  // could reach this PT but couldn't — worth a structured warn. sent===0 with
  // no removals is just a PT who hasn't enabled push yet, so we stay quiet.
  if (sent === 0 && removed > 0) {
    console.warn('[push] dispatch reached no live subscriptions', {
      ptId,
      event: event.name,
      removed,
    });
  }
  return { status: 'sent', sent, removed };
}
