import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getVapidPublicKeyMock,
  isEndpointOwnedMock,
  removePushSubscriptionMock,
  savePushSubscriptionMock,
} = vi.hoisted(() => ({
  getVapidPublicKeyMock: vi.fn(),
  isEndpointOwnedMock: vi.fn(),
  removePushSubscriptionMock: vi.fn(),
  savePushSubscriptionMock: vi.fn(),
}));

vi.mock('@/app/(dashboard)/settings/push-actions', () => ({
  getVapidPublicKey: getVapidPublicKeyMock,
  isEndpointOwned: isEndpointOwnedMock,
  removePushSubscription: removePushSubscriptionMock,
  savePushSubscription: savePushSubscriptionMock,
}));

const VAPID_KEY = Buffer.from('vapid-public-key').toString('base64url');

function makeSubscription(endpoint: string) {
  return {
    endpoint,
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({
      endpoint,
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    }),
  };
}

function installPushStubs({
  permission = 'granted',
  subscription = null as ReturnType<typeof makeSubscription> | null,
  freshEndpoint = 'https://push.example.com/fresh',
}: {
  permission?: string;
  subscription?: ReturnType<typeof makeSubscription> | null;
  freshEndpoint?: string;
} = {}) {
  const fresh = makeSubscription(freshEndpoint);
  const subscribe = vi.fn().mockResolvedValue(fresh);
  const getSubscription = vi.fn().mockResolvedValue(subscription);

  // isPushSupported() probes `navigator`/`window` keys, so both stubs need the
  // Push Notification surface present.
  vi.stubGlobal('window', { PushManager: class {}, Notification: class {} });
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn().mockResolvedValue(permission),
  });
  vi.stubGlobal('navigator', {
    userAgent: 'test-agent',
    serviceWorker: {
      ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }),
    },
  });
  vi.stubGlobal('localStorage', makeLocalStorage());

  return { fresh, subscribe, getSubscription };
}

/** The opt-out marker lives in localStorage, absent under the node env. */
function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

describe('push subscription client', () => {
  beforeEach(() => {
    getVapidPublicKeyMock.mockReset().mockResolvedValue(VAPID_KEY);
    isEndpointOwnedMock.mockReset().mockResolvedValue(true);
    removePushSubscriptionMock.mockReset().mockResolvedValue(undefined);
    savePushSubscriptionMock.mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unsubscribes the browser and deletes the stored row on sign-out', async () => {
    const subscription = makeSubscription('https://push.example.com/abc');
    installPushStubs({ subscription });
    const { unsubscribeFromPush } = await import('@/lib/pwa/push-client');

    await unsubscribeFromPush();

    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(removePushSubscriptionMock).toHaveBeenCalledWith(
      'https://push.example.com/abc',
    );
  });

  it('leaves the server alone when it already owns the live endpoint', async () => {
    const subscription = makeSubscription('https://push.example.com/abc');
    const { subscribe } = installPushStubs({ subscription });
    isEndpointOwnedMock.mockResolvedValue(true);
    const { reconcilePushSubscription } = await import('@/lib/pwa/push-client');

    await reconcilePushSubscription();

    expect(isEndpointOwnedMock).toHaveBeenCalledWith(
      'https://push.example.com/abc',
    );
    expect(savePushSubscriptionMock).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  // W1 regression: a browser-level subscription the server doesn't attribute to
  // the current PT must never be reassigned to them — on a shared device that
  // silently steals another PT's still-live push subscription. Drop it and
  // mint a fresh endpoint instead.
  it('drops and replaces a live endpoint the server does not attribute to this account', async () => {
    const subscription = makeSubscription('https://push.example.com/rotated');
    const { subscribe } = installPushStubs({
      subscription,
      freshEndpoint: 'https://push.example.com/fresh-for-this-account',
    });
    isEndpointOwnedMock.mockResolvedValue(false);
    const { reconcilePushSubscription } = await import('@/lib/pwa/push-client');

    await reconcilePushSubscription();

    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    // Must save the freshly minted endpoint, never the one it just dropped —
    // saving the old one would be exactly the cross-tenant reassignment bug.
    expect(savePushSubscriptionMock).toHaveBeenCalledWith(
      {
        endpoint: 'https://push.example.com/fresh-for-this-account',
        keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
      },
      'test-agent',
    );
    expect(savePushSubscriptionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example.com/rotated' }),
      expect.anything(),
    );
  });

  it('re-subscribes when the browser dropped the subscription', async () => {
    const { subscribe } = installPushStubs({ subscription: null });
    const { reconcilePushSubscription } = await import('@/lib/pwa/push-client');

    await reconcilePushSubscription();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls[0][0]).toMatchObject({ userVisibleOnly: true });
    expect(isEndpointOwnedMock).not.toHaveBeenCalled();
    expect(savePushSubscriptionMock).toHaveBeenCalledWith(
      {
        endpoint: 'https://push.example.com/fresh',
        keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
      },
      'test-agent',
    );
  });

  it('does not re-subscribe after the PT turned the toggle off', async () => {
    const subscription = makeSubscription('https://push.example.com/abc');
    const { subscribe, getSubscription } = installPushStubs({ subscription });
    const { reconcilePushSubscription, unsubscribeFromPush } =
      await import('@/lib/pwa/push-client');

    await unsubscribeFromPush({ optOut: true });
    // Permission stays 'granted' after an unsubscribe, so only the stored
    // opt-out can stop the reconcile from silently re-enabling push.
    getSubscription.mockResolvedValue(null);
    savePushSubscriptionMock.mockClear();

    await reconcilePushSubscription();

    expect(subscribe).not.toHaveBeenCalled();
    expect(savePushSubscriptionMock).not.toHaveBeenCalled();
  });

  it('reconciles again once the PT re-enables push', async () => {
    const subscription = makeSubscription('https://push.example.com/abc');
    const { getSubscription } = installPushStubs({ subscription });
    const { reconcilePushSubscription, subscribeToPush, unsubscribeFromPush } =
      await import('@/lib/pwa/push-client');

    await unsubscribeFromPush({ optOut: true });
    getSubscription.mockResolvedValue(null);
    expect(await subscribeToPush()).toBe('granted');

    getSubscription.mockResolvedValue(subscription);
    isEndpointOwnedMock.mockResolvedValue(false);
    savePushSubscriptionMock.mockClear();

    await reconcilePushSubscription();

    expect(savePushSubscriptionMock).toHaveBeenCalledTimes(1);
  });

  it('keeps reconciling after a sign-out teardown, which is not an opt-out', async () => {
    const subscription = makeSubscription('https://push.example.com/abc');
    const { getSubscription } = installPushStubs({ subscription });
    const { reconcilePushSubscription, unsubscribeFromPush } =
      await import('@/lib/pwa/push-client');

    await unsubscribeFromPush();
    getSubscription.mockResolvedValue(
      makeSubscription('https://push.example.com/rotated'),
    );
    isEndpointOwnedMock.mockResolvedValue(false);
    savePushSubscriptionMock.mockClear();

    await reconcilePushSubscription();

    expect(savePushSubscriptionMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing when notification permission is not granted', async () => {
    const { subscribe, getSubscription } = installPushStubs({
      permission: 'default',
    });
    const { reconcilePushSubscription } = await import('@/lib/pwa/push-client');

    await reconcilePushSubscription();

    expect(getSubscription).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(savePushSubscriptionMock).not.toHaveBeenCalled();
  });

  // W2 regression: the opt-out marker is scoped to the browser, not the signed
  // in PT. clearPwaData() (lib/pwa/client-store.ts) calls this on sign-out so a
  // PT who disabled push and then signs out on a shared device doesn't leave a
  // marker that silently withholds push from whoever signs in next.
  it('clearPushOptOut lets reconcile resume after a stale opt-out', async () => {
    const subscription = makeSubscription('https://push.example.com/abc');
    const { subscribe, getSubscription } = installPushStubs({ subscription });
    const {
      reconcilePushSubscription,
      unsubscribeFromPush,
      clearPushOptOut,
    } = await import('@/lib/pwa/push-client');

    await unsubscribeFromPush({ optOut: true });
    getSubscription.mockResolvedValue(null);
    savePushSubscriptionMock.mockClear();

    // Without clearing, the leftover marker keeps suppressing the next PT.
    await reconcilePushSubscription();
    expect(subscribe).not.toHaveBeenCalled();
    expect(savePushSubscriptionMock).not.toHaveBeenCalled();

    clearPushOptOut();
    await reconcilePushSubscription();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(savePushSubscriptionMock).toHaveBeenCalledTimes(1);
  });
});
