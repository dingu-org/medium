'use client';

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { t } from '@/lib/i18n';
import { clearPushOptOut } from '@/lib/pwa/push-client';

export const PWA_QUEUE_CHANGED_EVENT = 'medium:pwa-queue-changed';
export const PWA_MUTATION_SYNCED_EVENT = 'medium:pwa-mutation-synced';
export const PWA_MUTATION_FAILED_EVENT = 'medium:pwa-mutation-failed';
export const PWA_ENGAGEMENT_EVENT = 'medium:pwa-engaged';

const DB_NAME = 'medium-pwa';
const DB_VERSION = 1;
const MAX_QUEUE_ITEMS = 100;
const BACKGROUND_SYNC_TAG = 'medium-pwa-mutations';

export type PendingMutationStatus = 'pending' | 'failed';

export type PendingMutation = {
  id: string;
  endpoint: string;
  body: unknown;
  type: string;
  createdAt: number;
  retryCount: number;
  status: PendingMutationStatus;
  lastError?: string;
};

type QueueCounts = {
  pending: number;
  failed: number;
  total: number;
};

export type QueueReason = 'offline' | 'retryable';

type SendResult =
  | { status: 'sent'; response: unknown }
  | { status: 'queued'; mutation: PendingMutation; reason: QueueReason }
  | { status: 'failed'; error: string; statusCode?: number; code?: string };

interface MediumPwaDb extends DBSchema {
  pendingMutations: {
    key: string;
    value: PendingMutation;
    indexes: {
      createdAt: number;
      status: PendingMutationStatus;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<MediumPwaDb>> | null = null;

function browserDb(): Promise<IDBPDatabase<MediumPwaDb>> {
  if (typeof indexedDB === 'undefined') {
    throw new Error(t.pwa.storageUnavailable);
  }
  if (!dbPromise) {
    dbPromise = openDB<MediumPwaDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pendingMutations')) {
          const mutations = db.createObjectStore('pendingMutations', {
            keyPath: 'id',
          });
          mutations.createIndex('createdAt', 'createdAt');
          mutations.createIndex('status', 'status');
        }
      },
    });
  }
  return dbPromise;
}

function emit(name: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
  if (name !== PWA_QUEUE_CHANGED_EVENT) {
    window.dispatchEvent(new CustomEvent(PWA_QUEUE_CHANGED_EVENT));
  }
}

export async function listPendingMutations(): Promise<PendingMutation[]> {
  const db = await browserDb();
  const all = await db.getAll('pendingMutations');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getMutationCounts(): Promise<QueueCounts> {
  const all = await listPendingMutations();
  const pending = all.filter((m) => m.status === 'pending').length;
  const failed = all.filter((m) => m.status === 'failed').length;
  return { pending, failed, total: all.length };
}

export async function enqueueMutation(input: {
  endpoint: string;
  body: unknown;
  type: string;
  id?: string;
  lastError?: string;
}): Promise<PendingMutation> {
  const db = await browserDb();
  const count = await db.count('pendingMutations');
  if (count >= MAX_QUEUE_ITEMS) {
    throw new Error(t.pwa.queueFull);
  }
  const id = input.id ?? crypto.randomUUID();
  const existing = await db.get('pendingMutations', id);
  const mutation: PendingMutation = {
    id,
    endpoint: input.endpoint,
    body: input.body,
    type: input.type,
    createdAt: existing?.createdAt ?? Date.now(),
    retryCount: existing?.retryCount ?? 0,
    status: 'pending',
    lastError: input.lastError ?? existing?.lastError,
  };
  await db.put('pendingMutations', mutation);
  emit(PWA_QUEUE_CHANGED_EVENT);
  void registerBackgroundSync();
  return mutation;
}

export async function removeMutation(id: string): Promise<void> {
  const db = await browserDb();
  await db.delete('pendingMutations', id);
  emit(PWA_QUEUE_CHANGED_EVENT);
}

export async function retryMutation(id: string): Promise<void> {
  const db = await browserDb();
  const mutation = await db.get('pendingMutations', id);
  if (!mutation) return;
  await db.put('pendingMutations', {
    ...mutation,
    status: 'pending',
    lastError: undefined,
  });
  emit(PWA_QUEUE_CHANGED_EVENT);
  await replayPendingMutations();
}

export async function sendOrQueueMutation(input: {
  endpoint: string;
  body: Record<string, unknown>;
  type: string;
  id: string;
}): Promise<SendResult> {
  if (!navigator.onLine) {
    return {
      status: 'queued',
      mutation: await enqueueMutation(input),
      reason: 'offline',
    };
  }

  try {
    const response = await postMutation(input.endpoint, input.body);
    if (response.ok) {
      emit(PWA_ENGAGEMENT_EVENT);
      return { status: 'sent', response: response.body };
    }
    if (response.final) {
      return {
        status: 'failed',
        error: response.error,
        statusCode: response.status,
        code: response.code,
      };
    }
    // Non-final (5xx). `persist_pending` means the WhatsApp send already
    // succeeded but the server has not finished the local write; enqueue under
    // the same id so replay finishes it (the server recovers by skipping Graph,
    // never re-sending). The optimistic bubble stays pending and heals without
    // PT action. Other 5xx surface as failures for a deliberate retry.
    if (response.code === 'persist_pending') {
      return {
        status: 'queued',
        mutation: await enqueueMutation({
          ...input,
          lastError: response.error,
        }),
        reason: 'retryable',
      };
    }
    return {
      status: 'failed',
      error: response.error,
      statusCode: response.status,
      code: response.code,
    };
  } catch {
    // A thrown fetch is always a transport failure, and its message is
    // browser-generated English ("Failed to fetch") — the banner shows
    // `lastError` verbatim, so use our own copy instead.
    return {
      status: 'queued',
      mutation: await enqueueMutation({
        ...input,
        lastError: t.pwa.networkUnavailable,
      }),
      reason: navigator.onLine ? 'retryable' : 'offline',
    };
  }
}

export async function replayPendingMutations(): Promise<void> {
  const db = await browserDb();
  const mutations = (await db.getAllFromIndex(
    'pendingMutations',
    'createdAt',
  )).filter((m) => m.status === 'pending');

  for (const mutation of mutations) {
    try {
      const response = await postMutation(
        mutation.endpoint,
        mutation.body as Record<string, unknown>,
      );
      if (response.ok) {
        await db.delete('pendingMutations', mutation.id);
        emit(PWA_MUTATION_SYNCED_EVENT, { id: mutation.id, mutation });
        continue;
      }
      if (response.final) {
        await db.put('pendingMutations', {
          ...mutation,
          retryCount: mutation.retryCount + 1,
          status: 'failed',
          lastError: response.error,
        });
        emit(PWA_MUTATION_FAILED_EVENT, {
          id: mutation.id,
          mutation,
          error: response.error,
        });
        continue;
      }
      await db.put('pendingMutations', {
        ...mutation,
        retryCount: mutation.retryCount + 1,
        lastError: response.error,
      });
      break;
    } catch {
      await db.put('pendingMutations', {
        ...mutation,
        retryCount: mutation.retryCount + 1,
        lastError: t.pwa.networkUnavailable,
      });
      break;
    }
  }
  emit(PWA_QUEUE_CHANGED_EVENT);
}

async function postMutation(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; body: unknown }
  | { ok: false; status: number; error: string; final: boolean; code?: string }
> {
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return { ok: true, body: payload };
  const error =
    typeof payload.error === 'string' ? payload.error : t.pwa.requestFailed;
  const code = typeof payload.code === 'string' ? payload.code : undefined;
  return {
    ok: false,
    status: response.status,
    error,
    final: response.status >= 400 && response.status < 500,
    code,
  };
}

export function subscribeToQueueChanges(listener: () => void): () => void {
  window.addEventListener(PWA_QUEUE_CHANGED_EVENT, listener);
  return () => window.removeEventListener(PWA_QUEUE_CHANGED_EVENT, listener);
}

export async function clearPwaData(): Promise<void> {
  const db = await browserDb();
  await Promise.all([db.clear('pendingMutations'), clearCaches()]);
  // The push opt-out marker is scoped to the browser, not the signed-out PT
  // (see its docstring in push-client.ts) — drop it here or it silently
  // withholds push from whichever PT signs in next on this device.
  clearPushOptOut();
  emit(PWA_QUEUE_CHANGED_EVENT);
}

async function clearCaches() {
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

async function registerBackgroundSync() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const syncRegistration = registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await syncRegistration.sync?.register(BACKGROUND_SYNC_TAG);
  } catch {
    // Background Sync is best-effort; online/app-start replay still handles it.
  }
}
