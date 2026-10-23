'use client';

import { useEffect, useState } from 'react';
import {
  notificationsView,
  type NotificationsView,
} from '@/lib/onboarding/notifications';
import { readNotificationsEnv } from '@/lib/pwa/device';

/** The device's notifications view; `null` until mounted (SSR-safe). */
export function useNotificationsView(): NotificationsView | null {
  const [view, setView] = useState<NotificationsView | null>(null);
  useEffect(() => {
    setView(notificationsView(readNotificationsEnv()));
  }, []);
  return view;
}
