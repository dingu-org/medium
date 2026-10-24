import type { PushPermissionState } from '@/lib/pwa/push-client';
import { screenHref } from './flow';

/** What this device can do about notifications; read on the client. */
export type NotificationsEnv = {
  ios: boolean;
  standalone: boolean;
  /** `'unsupported'`: the browser has no notification API at all. */
  permission: PushPermissionState;
};

export type NotificationsView = 'ask' | 'install' | 'denied' | 'unsupported';

/**
 * The device matrix for step 7 (MED-123), shared by the step, the guide and the
 * Finish prompt (MED-124). iPhone detection comes first: in a Safari tab the
 * notification API is absent, which must read as "install", not "unsupported".
 */
export function notificationsView(env: NotificationsEnv): NotificationsView {
  if (env.ios && !env.standalone) return 'install';
  if (env.permission === 'unsupported') return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  return 'ask';
}

/**
 * Whether the Finish screen (MED-124) should show the "turn on notifications"
 * card: only when a tap can still raise the system prompt, and the user did not
 * already answer on this device.
 */
export function offersNotificationsPromptOnFinish(
  env: NotificationsEnv,
  answeredHere: boolean,
): boolean {
  return (
    notificationsView(env) === 'ask' &&
    env.permission === 'default' &&
    !answeredHere
  );
}

export const NOTIFICATIONS_STEP_HREF = screenHref('notifications');

/** The iPhone install guide is a nested route (a pushed sub-screen). */
export const NOTIFICATIONS_GUIDE_HREF = `${NOTIFICATIONS_STEP_HREF}/guide`;
