'use client';

import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// The Supabase realtime client pulls in a large bundle, so we load it lazily
// (a separate async chunk) the first time a subscription mounts — keeping it
// out of every dashboard route's initial JS. One instance per tab: channels
// are bound to a single client.
let clientPromise: Promise<SupabaseClient> | null = null;
function loadBrowserClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@/lib/supabase/browser').then((m) =>
      m.createBrowserClient(),
    );
  }
  return clientPromise;
}

export type RealtimeStatus = 'connecting' | 'connected' | 'error';

type ChangeHandler<T extends Record<string, unknown>> = (
  payload: RealtimePostgresChangesPayload<T>,
) => void;

/**
 * Subscribe to `postgres_changes` on a table (optionally filtered, e.g.
 * `pt_id=eq.<uuid>`). RLS is enforced channel-side by Supabase, so a PT only
 * ever receives rows they own. Cleans up on unmount and reconnects with
 * exponential backoff if the channel errors or times out.
 */
export function useRealtimeChannel<T extends Record<string, unknown>>(
  table: string,
  filter: string | undefined,
  onChange: ChangeHandler<T>,
  enabled = true,
): RealtimeStatus {
  const handlerRef = useRef(onChange);
  useEffect(() => {
    handlerRef.current = onChange;
  });

  const [status, setStatus] = useState<RealtimeStatus>('connecting');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let attempt = 0;
    let channel: RealtimeChannel | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let client: SupabaseClient | null = null;

    const connect = (supabase: SupabaseClient) => {
      if (cancelled) return;
      setStatus('connecting');
      channel = supabase.channel(`rt-${table}-${filter ?? 'all'}-${Date.now()}`);
      channel
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'postgres_changes' as any,
          { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
          (payload: RealtimePostgresChangesPayload<T>) =>
            handlerRef.current(payload),
        )
        .subscribe((state) => {
          if (cancelled) return;
          if (state === 'SUBSCRIBED') {
            setStatus('connected');
            attempt = 0;
          } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
            setStatus('error');
            if (channel) supabase.removeChannel(channel);
            const delay = Math.min(30_000, 1_000 * 2 ** attempt);
            attempt += 1;
            timer = setTimeout(() => connect(supabase), delay);
          }
        });
    };

    loadBrowserClient().then((supabase) => {
      if (cancelled) return;
      client = supabase;
      connect(supabase);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel && client) client.removeChannel(channel);
    };
  }, [table, filter, enabled]);

  return status;
}

// Catch-up refreshes collapse to at most one per second across the whole tab.
// Several hook instances mount per screen (the chat list has two refreshers,
// today has three) and a reconnect or foreground event fires every one of them
// at once; without this throttle they would stampede router.refresh(). The
// live-event path keeps its own 250ms debounce (see useRealtimeRefresh) — this
// guards only the catch-up path.
const CATCH_UP_THROTTLE_MS = 1_000;
let lastCatchUpAt = 0;

function triggerCatchUp(refresh: () => void): void {
  const now = Date.now();
  if (now - lastCatchUpAt < CATCH_UP_THROTTLE_MS) return;
  lastCatchUpAt = now;
  refresh();
}

/**
 * Backfill realtime events a lazily-subscribed channel can't deliver. The
 * socket connects after the server render, so any change in that window is
 * lost; it also dies silently when the iOS PWA / tab is backgrounded, and a
 * CHANNEL_ERROR/TIMED_OUT reconnect never replays what it missed. This re-runs
 * `refresh` on the signals that mark such a gap: every transition INTO
 * `connected` (initial subscribe and each re-subscribe — once per cycle, not
 * per event), the tab returning to the foreground (visibilitychange), and a
 * bfcache restore (pageshow with `persisted`). Refreshes are throttled
 * module-wide (see triggerCatchUp). Watches the `status` value rather than
 * touching useRealtimeChannel, so all public hook signatures stay unchanged.
 */
function useCatchUpRefresh(
  status: RealtimeStatus,
  refresh: () => void,
  enabled = true,
): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  // Fire only when status crosses into `connected`, so a (re)subscribe
  // refetches once — not on every subsequent event while already connected.
  const prevStatus = useRef<RealtimeStatus | null>(null);
  useEffect(() => {
    if (
      enabled &&
      status === 'connected' &&
      prevStatus.current !== 'connected'
    ) {
      triggerCatchUp(refreshRef.current);
    }
    prevStatus.current = status;
  }, [status, enabled]);

  // Foreground catch-up: the socket can die unnoticed while backgrounded, so
  // refetch when the tab becomes visible again or is restored from the bfcache.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        triggerCatchUp(refreshRef.current);
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) triggerCatchUp(refreshRef.current);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [enabled]);
}

/**
 * For list views whose rows are joined server-side (calendar, conversation
 * list, notifications): on any change to `table`, trigger a soft
 * `router.refresh()` so the server re-renders with correct joins — no full
 * reload, client state preserved. Debounced to coalesce bursts. Also backfills
 * events missed while the channel was not yet subscribed or the tab was
 * backgrounded, by refetching on (re)connect and on foreground — same debounced
 * refresh, throttled across instances (see useCatchUpRefresh).
 */
export function useRealtimeRefresh(
  table: string,
  filter: string | undefined,
  enabled = true,
): RealtimeStatus {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Soft refresh, debounced to coalesce bursts of live events into one refetch.
  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 250);
  }, [router]);

  const status = useRealtimeChannel(table, filter, refresh, enabled);
  useCatchUpRefresh(status, refresh, enabled);
  return status;
}

export type LiveMessage = {
  id: string;
  role: 'patient' | 'ai' | 'pt';
  content: string;
  createdAt: string;
};

type RawMessage = {
  id: string;
  role: 'patient' | 'ai' | 'pt';
  content: string;
  created_at: string;
};

/**
 * Live message thread for one conversation. Seeds from server-fetched messages
 * and applies realtime INSERT/UPDATE so new patient/AI/PT messages appear
 * instantly. Keyed by id, so an optimistic row and its realtime echo dedupe.
 * On (re)connect and on foreground it re-seeds from the server to backfill any
 * messages that landed while the socket was down (see useCatchUpRefresh).
 */
export function useMessages(
  conversationId: string,
  initial: LiveMessage[],
): { messages: LiveMessage[]; status: RealtimeStatus } {
  const router = useRouter();
  const [byId, setById] = useState<Map<string, LiveMessage>>(
    () => new Map(initial.map((m) => [m.id, m])),
  );

  // Re-seed if the server payload changes (e.g. after router.refresh).
  const seedKey = initial.map((m) => m.id).join(',');
  useEffect(() => {
    setById((prev) => {
      const next = new Map(prev);
      for (const m of initial) next.set(m.id, m);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const status = useRealtimeChannel<RawMessage>(
    'messages',
    `conversation_id=eq.${conversationId}`,
    (payload) => {
      if (payload.eventType === 'DELETE') {
        const old = payload.old as Partial<RawMessage>;
        if (!old.id) return;
        setById((prev) => {
          const next = new Map(prev);
          next.delete(old.id as string);
          return next;
        });
        return;
      }
      const row = payload.new as RawMessage;
      if (!row?.id) return;
      setById((prev) => {
        const next = new Map(prev);
        next.set(row.id, {
          id: row.id,
          role: row.role,
          content: row.content,
          createdAt: row.created_at,
        });
        return next;
      });
    },
  );

  // Only live INSERTs land here, so a message that arrived while the socket was
  // down would never appear. router.refresh() re-runs the server fetch, which
  // flows back through the seed effect above and merges by id.
  useCatchUpRefresh(status, () => router.refresh());

  const messages = useMemo(
    () =>
      [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [byId],
  );

  return { messages, status };
}

/** Browser online/offline state for the top-bar sync indicator. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
