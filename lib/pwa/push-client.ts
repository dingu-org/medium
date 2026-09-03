import {
  getVapidPublicKey,
  isEndpointOwned,
  removePushSubscription,
  savePushSubscription,
} from '@/app/(dashboard)/settings/push-actions';

export type PushPermissionState =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied';

/**
 * Remembers that the PT switched push OFF on this device. Notification
 * permission stays 'granted' after we drop the subscription, so without this
 * marker the reconcile below would silently re-subscribe on the next app open
 * and the toggle would flip itself back on. Per-browser, which is the scope a
 * push subscription lives at anyway — which is also why it must be cleared on
 * sign-out (clearPushOptOut, called from clearPwaData): otherwise a PT who
 * disabled push and later signs out leaves this marker for whoever signs in
 * next on the same device, and reconcile silently withholds their push too.
 */
const OPT_OUT_KEY = 'medium:push-opted-out';

function isPushOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

function setPushOptedOut(value: boolean): void {
  try {
    if (value) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // Storage can be unavailable (private mode); the toggle still works.
  }
}

/**
 * Drop the local opt-out marker. Called from clearPwaData() on sign-out — see
 * the OPT_OUT_KEY docstring for why leaving it behind would silently break
 * push for the next PT on a shared device.
 */
export function clearPushOptOut(): void {
  setPushOptedOut(false);
}

/** Whether this browser supports the Web Push stack we rely on. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getPushPermissionState(): PushPermissionState {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission as PushPermissionState;
}

/** VAPID keys arrive as URL-safe base64; the subscribe API wants a byte array. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  return (await registration.pushManager.getSubscription()) !== null;
}

/**
 * Request permission, subscribe via the push manager, and persist the
 * subscription server-side. Returns the resulting permission state so the
 * caller can surface "granted" / "denied" feedback.
 */
export async function subscribeToPush(): Promise<PushPermissionState> {
  if (!isPushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission as PushPermissionState;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return 'unsupported';
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const key = await getVapidPublicKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }

  await savePushSubscription(subscription.toJSON(), navigator.userAgent);
  setPushOptedOut(false);
  return 'granted';
}

/**
 * Make the server's view of this browser match reality. Push dies silently
 * otherwise: the browser can rotate the endpoint on its own, and the server
 * prunes a row the moment a dispatch returns 404/410 — after which nothing ever
 * re-uploads the new subscription and Settings still reports push as on.
 * Permission is already granted here, so re-subscribing needs no PT action —
 * unless the PT turned push off on this device, which is standing intent that
 * outranks the origin-level permission.
 *
 * Runs on every mount and on every SW `pushsubscriptionchange` relay, not only
 * on a deliberate click, so it must never claim a subscription for the current
 * PT that it does not already own: a shared front-desk device where PT A's
 * session merely expired (no explicit sign-out, so the browser-level
 * subscription survives) would otherwise have PT B's very next app open
 * silently reassign A's subscription to B, and A stops receiving push with no
 * signal. When the live endpoint isn't ours, drop it and mint a fresh one
 * instead of stealing it.
 * Safe to call on every app open; a no-op when the server already owns the row.
 */
export async function reconcilePushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (isPushOptedOut()) return;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    if (await isEndpointOwned(subscription.endpoint)) return;
    await subscription.unsubscribe();
    subscription = null;
  }

  if (!subscription) {
    const key = await getVapidPublicKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }
  await savePushSubscription(subscription.toJSON(), navigator.userAgent);
}

/**
 * Tear down this browser's subscription. Pass `optOut` when the PT asked for
 * push to stay off (the Settings toggle) rather than when we are just cleaning
 * up the device (sign-out) — only the former must survive the next app open.
 */
export async function unsubscribeFromPush(
  options: { optOut?: boolean } = {},
): Promise<void> {
  if (!isPushSupported()) return;
  if (options.optOut) setPushOptedOut(true);
  // getRegistration(), not .ready — dev never registers a worker (see
  // pwa-provider.tsx), and .ready then hangs forever, taking sign-out with it.
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await removePushSubscription(endpoint);
}
