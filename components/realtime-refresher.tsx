'use client';

import { useRealtimeRefresh } from '@/lib/hooks/realtime';

/**
 * Invisible client component that triggers a soft router.refresh() whenever a
 * row in `table` matching `filter` changes. Drop it into a server-rendered list
 * to make it live without converting the whole screen to a client component.
 */
export function RealtimeRefresher({
  table,
  filter,
}: {
  table: string;
  filter?: string;
}) {
  useRealtimeRefresh(table, filter);
  return null;
}
