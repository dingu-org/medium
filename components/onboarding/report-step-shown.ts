import type { FlowScreenId } from '@/lib/onboarding/flow';

const URL = '/api/onboarding/shown';

/**
 * Tells the funnel a guided-onboarding screen was shown (MED-125). A beacon, so
 * it never delays the user's next tap; the server takes the account from the
 * session, so only the screen id is sent. Fire-and-forget: it never throws.
 */
export function reportStepShown(screen: FlowScreenId): void {
  try {
    const body = JSON.stringify({ screen });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon?.(URL, body)) {
      return;
    }
    fetch(URL, { method: 'POST', body, keepalive: true }).catch(
      () => undefined,
    );
  } catch {
    // Reporting is best effort.
  }
}
