'use client';

import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'onb:';

function draftKey(accountId: string, screen: string): string {
  return `${PREFIX}draft:${accountId}:${screen}`;
}

/** Drops a screen's unsaved draft. Safe when storage is unavailable. */
export function clearStepDraft(accountId: string, screen: string): void {
  try {
    window.localStorage.removeItem(draftKey(accountId, screen));
  } catch {
    // Storage blocked: nothing was kept, nothing to clear.
  }
}

/** Drops every onboarding key; runs on sign-out. */
export function clearAllOnboardingStorage(): void {
  for (const storage of ['localStorage', 'sessionStorage'] as const) {
    try {
      const area = window[storage];
      for (const key of Object.keys(area)) {
        if (key.startsWith(PREFIX)) area.removeItem(key);
      }
    } catch {
      // Storage blocked.
    }
  }
}

/**
 * Unsaved step input that survives Back and closing the app. The server value
 * renders first (so hydration matches) and a stored draft replaces it after
 * mount. Cleared by the shell when the step saves. If storage is unavailable
 * the step simply keeps the server values.
 */
export function useStepDraft<T>(
  accountId: string,
  screen: string,
  serverInitial: T,
): [T, (value: T) => void, () => void] {
  const [value, setValue] = useState<T>(serverInitial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey(accountId, screen));
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      // Unreadable or blocked: fall back to the server values.
    }
  }, [accountId, screen]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(
          draftKey(accountId, screen),
          JSON.stringify(next),
        );
      } catch {
        // Quota or blocked: the draft is best effort.
      }
    },
    [accountId, screen],
  );

  const clear = useCallback(
    () => clearStepDraft(accountId, screen),
    [accountId, screen],
  );

  return [value, update, clear];
}
