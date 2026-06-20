import {
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBFactory,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
} from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function installBrowserStubs({ online = true } = {}) {
  const eventTarget = new EventTarget();
  const syncRegister = vi.fn().mockResolvedValue(undefined);
  class TestCustomEvent<T = unknown> extends Event {
    detail: T | undefined;
    constructor(type: string, init?: CustomEventInit<T>) {
      super(type);
      this.detail = init?.detail;
    }
  }

  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBCursor', IDBCursor);
  vi.stubGlobal('IDBCursorWithValue', IDBCursorWithValue);
  vi.stubGlobal('IDBDatabase', IDBDatabase);
  vi.stubGlobal('IDBIndex', IDBIndex);
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('IDBObjectStore', IDBObjectStore);
  vi.stubGlobal('IDBOpenDBRequest', IDBOpenDBRequest);
  vi.stubGlobal('IDBRequest', IDBRequest);
  vi.stubGlobal('IDBTransaction', IDBTransaction);
  vi.stubGlobal('CustomEvent', TestCustomEvent);
  vi.stubGlobal('window', {
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
  });
  vi.stubGlobal('navigator', {
    onLine: online,
    serviceWorker: {
      ready: Promise.resolve({ sync: { register: syncRegister } }),
    },
  });

  return { syncRegister };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('PWA client mutation queue', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('lists queued mutations oldest first', async () => {
    installBrowserStubs();
    const { enqueueMutation, listPendingMutations } = await import(
      '@/lib/pwa/client-store'
    );

    await enqueueMutation({
      id: 'third',
      endpoint: '/api/pwa/mutations/message',
      type: 'message.send',
      body: { clientMutationId: 'third' },
    });
    await tick();
    await enqueueMutation({
      id: 'first',
      endpoint: '/api/pwa/mutations/message',
      type: 'message.send',
      body: { clientMutationId: 'first' },
    });
    await tick();
    await enqueueMutation({
      id: 'second',
      endpoint: '/api/pwa/mutations/message',
      type: 'message.send',
      body: { clientMutationId: 'second' },
    });

    expect((await listPendingMutations()).map((item) => item.id)).toEqual([
      'third',
      'first',
      'second',
    ]);
  });

  it('caps the queue at 100 mutations', async () => {
    installBrowserStubs();
    const { enqueueMutation } = await import('@/lib/pwa/client-store');

    for (let i = 0; i < 100; i += 1) {
      await enqueueMutation({
        id: `queued-${i}`,
        endpoint: '/api/pwa/mutations/message',
        type: 'message.send',
        body: { clientMutationId: `queued-${i}` },
      });
    }

    await expect(
      enqueueMutation({
        id: 'too-many',
        endpoint: '/api/pwa/mutations/message',
        type: 'message.send',
        body: { clientMutationId: 'too-many' },
      }),
    ).rejects.toThrow('Too many pending changes');
  });

  it('replays pending mutations oldest-first and removes successes', async () => {
    installBrowserStubs();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { enqueueMutation, listPendingMutations, replayPendingMutations } =
      await import('@/lib/pwa/client-store');

    await enqueueMutation({
      id: 'one',
      endpoint: '/api/pwa/mutations/message',
      type: 'message.send',
      body: { clientMutationId: 'one' },
    });
    await tick();
    await enqueueMutation({
      id: 'two',
      endpoint: '/api/pwa/mutations/appointment',
      type: 'appointment.cancel',
      body: { clientMutationId: 'two' },
    });
    await tick();
    await enqueueMutation({
      id: 'three',
      endpoint: '/api/pwa/mutations/message',
      type: 'message.send',
      body: { clientMutationId: 'three' },
    });

    await replayPendingMutations();

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/pwa/mutations/message',
      '/api/pwa/mutations/appointment',
      '/api/pwa/mutations/message',
    ]);
    expect(await listPendingMutations()).toEqual([]);
  });

  it('marks 4xx replay responses as final failures', async () => {
    installBrowserStubs();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Appointment already changed.' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { enqueueMutation, listPendingMutations, replayPendingMutations } =
      await import('@/lib/pwa/client-store');

    await enqueueMutation({
      id: 'conflict',
      endpoint: '/api/pwa/mutations/appointment',
      type: 'appointment.reschedule',
      body: { clientMutationId: 'conflict' },
    });

    await replayPendingMutations();

    expect(await listPendingMutations()).toMatchObject([
      {
        id: 'conflict',
        status: 'failed',
        retryCount: 1,
        lastError: 'Appointment already changed.',
      },
    ]);
  });

  it('queues offline message sends without persisting request headers or cookies', async () => {
    installBrowserStubs({ online: false });
    const { queueMessageSend } = await import('@/lib/pwa/mutation-client');
    const { listPendingMutations } = await import('@/lib/pwa/client-store');

    await queueMessageSend({
      clientMutationId: 'message-1',
      conversationId: 'conversation-1',
      body: 'See you tomorrow',
    });

    const [queued] = await listPendingMutations();
    expect(queued).toMatchObject({
      id: 'message-1',
      endpoint: '/api/pwa/mutations/message',
      type: 'message.send',
      status: 'pending',
      body: {
        clientMutationId: 'message-1',
        conversationId: 'conversation-1',
        body: 'See you tomorrow',
      },
    });
    expect(queued).not.toHaveProperty('headers');
    expect(JSON.stringify(queued).toLowerCase()).not.toContain('cookie');
  });
});
