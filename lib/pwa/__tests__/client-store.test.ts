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
import { t } from '@/lib/i18n';

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
    ).rejects.toThrow(t.pwa.queueFull);
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

  it('does not queue online server responses from direct sends', async () => {
    installBrowserStubs({ online: true });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Server failed.' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { queueMessageSend } = await import('@/lib/pwa/mutation-client');
    const { listPendingMutations } = await import('@/lib/pwa/client-store');

    const result = await queueMessageSend({
      clientMutationId: 'message-online-failure',
      conversationId: 'conversation-1',
      body: 'See you tomorrow',
    });

    expect(result).toEqual({
      status: 'failed',
      clientMutationId: 'message-online-failure',
      error: 'Server failed.',
    });
    expect(await listPendingMutations()).toEqual([]);
  });

  it('queues persist_pending sends for background replay under the same id', async () => {
    // The WhatsApp send already succeeded; the server only failed to finish the
    // local write (HTTP 503 + code). Enqueuing under the same id lets replay
    // recover it (server skips Graph) instead of dead-ending as a failure.
    installBrowserStubs({ online: true });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Mesazhi u dërgua, po ruhet.',
          code: 'persist_pending',
        }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { queueMessageSend } = await import('@/lib/pwa/mutation-client');
    const { listPendingMutations } = await import('@/lib/pwa/client-store');

    const result = await queueMessageSend({
      clientMutationId: 'message-persist-pending',
      conversationId: 'conversation-1',
      body: 'See you tomorrow',
    });

    expect(result).toEqual({
      status: 'queued',
      clientMutationId: 'message-persist-pending',
      reason: 'retryable',
    });
    expect(await listPendingMutations()).toMatchObject([
      {
        id: 'message-persist-pending',
        status: 'pending',
        lastError: 'Mesazhi u dërgua, po ruhet.',
        body: { clientMutationId: 'message-persist-pending' },
      },
    ]);
  });

  // The browser's own "Failed to fetch" is English and lands verbatim in the
  // failed-changes banner, so the queue stores our Albanian copy instead.
  it('queues thrown online requests as retryable instead of offline', async () => {
    installBrowserStubs({ online: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    const { queueMessageSend } = await import('@/lib/pwa/mutation-client');
    const { listPendingMutations } = await import('@/lib/pwa/client-store');

    const result = await queueMessageSend({
      clientMutationId: 'message-retryable',
      conversationId: 'conversation-1',
      body: 'See you tomorrow',
    });

    expect(result).toEqual({
      status: 'queued',
      clientMutationId: 'message-retryable',
      reason: 'retryable',
    });
    expect(await listPendingMutations()).toMatchObject([
      {
        id: 'message-retryable',
        status: 'pending',
        lastError: t.pwa.networkUnavailable,
      },
    ]);
  });

  it('queues offline message sends without persisting request headers or cookies', async () => {
    installBrowserStubs({ online: false });
    const { queueMessageSend } = await import('@/lib/pwa/mutation-client');
    const { listPendingMutations } = await import('@/lib/pwa/client-store');

    const result = await queueMessageSend({
      clientMutationId: 'message-1',
      conversationId: 'conversation-1',
      body: 'See you tomorrow',
    });

    expect(result).toEqual({
      status: 'queued',
      clientMutationId: 'message-1',
      reason: 'offline',
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
