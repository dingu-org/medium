'use client';

import { useCallback, useEffect, useState } from 'react';
import { offersNotificationsPromptOnFinish } from '@/lib/onboarding/notifications';
import { readNotificationsEnv } from '@/lib/pwa/device';
import {
  enableNotifications,
  type PushPermissionState,
} from '@/lib/pwa/push-client';
import {
  markNotificationsAnsweredHere,
  notificationsAnsweredHere,
} from './notifications-answered';

/**
 * The tap-driven notifications prompt for the Finish screen (MED-123 builds it,
 * MED-124 places it). `offered` is `null` until mounted.
 *
 * `enable` MUST be called synchronously as the first thing in the tap handler
 * (before any await): the system prompt needs the user activation, which iOS
 * standalone does not keep across a server action.
 */
export function useNotificationsPrompt(accountId: string): {
  offered: boolean | null;
  enable: () => Promise<PushPermissionState>;
  dismiss: () => void;
} {
  const [offered, setOffered] = useState<boolean | null>(null);

  useEffect(() => {
    setOffered(
      offersNotificationsPromptOnFinish(
        readNotificationsEnv(),
        notificationsAnsweredHere(accountId),
      ),
    );
  }, [accountId]);

  const enable = useCallback(() => {
    const result = enableNotifications();
    return result.then((state) => {
      if (state === 'granted' || state === 'denied') {
        markNotificationsAnsweredHere(accountId);
      }
      return state;
    });
  }, [accountId]);

  const dismiss = useCallback(() => {
    markNotificationsAnsweredHere(accountId);
  }, [accountId]);

  return { offered, enable, dismiss };
}
