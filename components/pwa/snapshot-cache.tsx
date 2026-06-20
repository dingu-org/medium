'use client';

import { useEffect } from 'react';
import { putSnapshot } from '@/lib/pwa/client-store';

export function SnapshotCache({
  cacheKey,
  kind,
  payload,
}: {
  cacheKey: string;
  kind: string;
  payload: unknown;
}) {
  useEffect(() => {
    putSnapshot({ key: cacheKey, kind, payload }).catch(() => {
      // Offline cache is best-effort; the live screen remains authoritative.
    });
  }, [cacheKey, kind, payload]);

  return null;
}
