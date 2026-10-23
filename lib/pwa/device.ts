import type { NotificationsEnv } from '@/lib/onboarding/notifications';
import { getPushPermissionState } from '@/lib/pwa/push-client';

/** iPhone, iPod and iPad (iPadOS reports itself as a touch-capable Mac). */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** Running as an installed app (home screen) rather than in a browser tab. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Synchronous read of everything the notifications matrix depends on. */
export function readNotificationsEnv(): NotificationsEnv {
  return {
    ios: isIosDevice(),
    standalone: isStandaloneDisplay(),
    permission: getPushPermissionState(),
  };
}
