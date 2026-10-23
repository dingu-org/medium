const key = (accountId: string) => `onb:notif-answered:${accountId}`;

/**
 * Remembers, on this device, that the user already answered the notifications
 * question ("Jo tani", or a granted/denied result), so the Finish prompt
 * (MED-124) does not ask again right away. Device-scoped on purpose: an
 * installed iPhone app has its own storage and is still offered the prompt.
 * The `onb:` prefix means sign-out cleanup drops it.
 */
export function markNotificationsAnsweredHere(accountId: string): void {
  try {
    window.localStorage.setItem(key(accountId), '1');
  } catch {
    // Storage blocked: the prompt may be offered once more. Never a block.
  }
}

export function notificationsAnsweredHere(accountId: string): boolean {
  try {
    return window.localStorage.getItem(key(accountId)) === '1';
  } catch {
    return false;
  }
}
