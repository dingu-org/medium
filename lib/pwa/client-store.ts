'use client';

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

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

export type SnapshotRecord = {
  key: string;
  kind: string;
  payload: unknown;
  cachedAt: number;
};

type QueueCounts = {
  pending: number;
  failed: number;
  total: number;
};

type SendResult =
  | { status: 'sent'; response: unknown }
  | { status: 'queued'; mutation: PendingMutation }
  | { status: 'failed'; error: string; statusCode?: number };

interface MediumPwaDb extends DBSchema {
  snapshots: {
    key: string;
    value: SnapshotRecord;
    indexes: { kind: string };
  };
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
    throw new Error('IndexedDB is not available in this browser.');
  }
  if (!dbPromise) {
    dbPromise = openDB<MediumPwaDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapshots = db.createObjectStore('snapshots', {
            keyPath: 'key',
          });
          snapshots.createIndex('kind', 'kind');
        }
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

export async function putSnapshot(record: Omit<SnapshotRecord, 'cachedAt'>) {
  const db = await browserDb();
  await db.put('snapshots', { ...record, cachedAt: Date.now() });
}

export async function getSnapshot<T = unknown>(
  key: string,
): Promise<SnapshotRecord & { payload: T } | null> {
  const db = await browserDb();
  return ((await db.get('snapshots', key)) as
    | (SnapshotRecord & { payload: T })
    | undefined) ?? null;
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
    throw new Error('Too many pending changes. Reconnect before adding more.');
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
      };
    }
    return {
      status: 'queued',
      mutation: await enqueueMutation({
        ...input,
        lastError: response.error,
      }),
    };
  } catch (error) {
    return {
      status: 'queued',
      mutation: await enqueueMutation({
        ...input,
        lastError:
          error instanceof Error ? error.message : 'Network unavailable.',
      }),
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
    } catch (error) {
      await db.put('pendingMutations', {
        ...mutation,
        retryCount: mutation.retryCount + 1,
        lastError:
          error instanceof Error ? error.message : 'Network unavailable.',
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
  | { ok: false; status: number; error: string; final: boolean }
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
    typeof payload.error === 'string' ? payload.error : 'Request failed.';
  return {
    ok: false,
    status: response.status,
    error,
    final: response.status >= 400 && response.status < 500,
  };
}

export function subscribeToQueueChanges(listener: () => void): () => void {
  window.addEventListener(PWA_QUEUE_CHANGED_EVENT, listener);
  return () => window.removeEventListener(PWA_QUEUE_CHANGED_EVENT, listener);
}

export async function clearPwaData(): Promise<void> {
  const db = await browserDb();
  await Promise.all([
    db.clear('snapshots'),
    db.clear('pendingMutations'),
    clearCaches(),
  ]);
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
