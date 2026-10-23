import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getVapidPublicKeyMock, savePushSubscriptionMock } = vi.hoisted(() => ({
  getVapidPublicKeyMock: vi.fn(),
  savePushSubscriptionMock: vi.fn(),
}));

vi.mock('@/app/(dashboard)/settings/push-actions', () => ({
  getVapidPublicKey: getVapidPublicKeyMock,
  isEndpointOwned: vi.fn(),
  removePushSubscription: vi.fn(),
  savePushSubscription: savePushSubscriptionMock,
}));

import { enableNotifications } from '../push-client';

const VAPID_KEY = Buffer.from('vapid-public-key').toString('base64url');

type Opts = {
  permission?: string;
  registered?: boolean;
  /** When set, `serviceWorker.ready` never settles. */
  neverReady?: boolean;
  supported?: boolean;
};

function setup({
  permission = 'granted',
  registered = true,
  neverReady = false,
  supported = true,
}: Opts = {}) {
  const calls: string[] = [];
  const subscription = {
    endpoint: 'https://push.example.com/x',
    toJSON: () => ({ endpoint: 'https://push.example.com/x' }),
  };
  const subscribe = vi.fn().mockImplementation(async () => subscription);
  const registration = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe,
    },
  };
  let current: typeof registration | undefined = registered
    ? registration
    : undefined;
  const requestPermission = vi.fn().mockImplementation(async () => {
    calls.push('requestPermission');
    return permission;
  });
  const getRegistration = vi.fn().mockImplementation(async () => {
    calls.push('getRegistration');
    return current;
  });
  const register = vi.fn().mockImplementation(async () => {
    calls.push('register');
    current = registration;
    return registration;
  });
  vi.stubGlobal(
    'window',
    supported ? { PushManager: class {}, Notification: class {} } : {},
  );
  vi.stubGlobal('Notification', { permission, requestPermission });
  vi.stubGlobal('navigator', {
    userAgent: 'test-agent',
    serviceWorker: {
      getRegistration,
      register,
      ready: neverReady
        ? new Promise(() => undefined)
        : Promise.resolve(registration),
    },
  });
  return { calls, requestPermission, getRegistration, register, subscribe };
}

beforeEach(() => {
  getVapidPublicKeyMock.mockResolvedValue(VAPID_KEY);
  savePushSubscriptionMock.mockResolvedValue(undefined);
  vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('enableNotifications', () => {
  it('asks for permission before touching the service worker', async () => {
    const s = setup({ registered: false });
    await enableNotifications();
    expect(s.calls[0]).toBe('requestPermission');
    expect(s.calls.indexOf('requestPermission')).toBeLessThan(
      s.calls.findIndex((c) => c !== 'requestPermission'),
    );
  });

  it('calls requestPermission synchronously, before any await', () => {
    const s = setup();
    const pending = enableNotifications();
    expect(s.requestPermission).toHaveBeenCalledTimes(1);
    return pending;
  });

  it('returns denied without registering anything', async () => {
    const s = setup({ permission: 'denied', registered: false });
    await expect(enableNotifications()).resolves.toBe('denied');
    expect(s.register).not.toHaveBeenCalled();
    expect(s.getRegistration).not.toHaveBeenCalled();
  });

  it('subscribes and saves when granted with an existing registration', async () => {
    const s = setup();
    await expect(enableNotifications()).resolves.toBe('granted');
    expect(s.register).not.toHaveBeenCalled();
    expect(s.subscribe).toHaveBeenCalledTimes(1);
    expect(savePushSubscriptionMock).toHaveBeenCalledTimes(1);
  });

  it('does not register in dev and still reports granted', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const s = setup({ registered: false });
    await expect(enableNotifications()).resolves.toBe('granted');
    expect(s.register).not.toHaveBeenCalled();
    expect(s.subscribe).not.toHaveBeenCalled();
  });

  it('registers the worker in production, waits for ready, then subscribes', async () => {
    const s = setup({ registered: false });
    await expect(enableNotifications()).resolves.toBe('granted');
    expect(s.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    expect(s.subscribe).toHaveBeenCalledTimes(1);
    expect(savePushSubscriptionMock).toHaveBeenCalledTimes(1);
  });

  it('gives up waiting for a worker that never activates and reports granted', async () => {
    vi.useFakeTimers();
    const s = setup({ registered: false, neverReady: true });
    const pending = enableNotifications();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBe('granted');
    expect(s.register).toHaveBeenCalledTimes(1);
  });

  it('is unsupported without asking when the browser has no push stack', async () => {
    const s = setup({ supported: false });
    await expect(enableNotifications()).resolves.toBe('unsupported');
    expect(s.requestPermission).not.toHaveBeenCalled();
  });
});
