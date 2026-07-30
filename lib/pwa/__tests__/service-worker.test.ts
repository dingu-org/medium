import { NetworkFirst, NetworkOnly } from 'serwist';
import type { RouteMatchCallback, RuntimeCaching } from 'serwist';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * app/sw.ts runs `new Serwist({...})` and registers its own listeners at
 * module load, all against the global service-worker `self`. Stub just enough
 * of it — a real `addEventListener` (captured, so this test can invoke the
 * handlers it registers) plus the no-op surface Serwist's constructor touches
 * (message/activate listeners for skipWaiting, clientsClaim, navigationPreload,
 * cleanupOutdatedCaches) — to import the real module and exercise its actual
 * routing/relay logic, instead of grepping the source text for substrings.
 */
function fakeRequest(overrides: { method?: string; mode?: string } = {}): Request {
  return {
    method: overrides.method ?? 'GET',
    mode: overrides.mode ?? 'same-origin',
    headers: new Headers(),
  } as unknown as Request;
}

function matchArgs(url: string, request: Request, sameOrigin = true) {
  // The matcher never touches `event`; `never` is assignable to the
  // `ExtendableEvent` field without pulling in `lib.webworker` types here.
  return { event: undefined as never, request, sameOrigin, url: new URL(url) };
}

/** Every entry in app/sw.ts's runtimeCaching sets a function, never a string/RegExp. */
function matcherOf(entry: RuntimeCaching): RouteMatchCallback {
  return entry.matcher as RouteMatchCallback;
}

/**
 * The stub has to exist before *any* import is evaluated, hence `vi.hoisted`
 * rather than `beforeAll`: serwist captures its dev `logger` at module-eval
 * time and pins it to `null` when `self` is undefined right then. Vitest hoists
 * the `serwist` import above every hook, so installing the scope later leaves a
 * null `logger` that `new Serwist({...})` dereferences.
 */
const swScope = vi.hoisted(() => {
  const listeners = new Map<string, Array<(event: never) => void>>();
  const clientsMatchAll = vi.fn().mockResolvedValue([]);

  vi.stubGlobal('self', {
    addEventListener: (type: string, listener: (event: never) => void) => {
      const existing = listeners.get(type) ?? [];
      existing.push(listener);
      listeners.set(type, existing);
    },
    skipWaiting: () => undefined,
    clients: { matchAll: clientsMatchAll },
    location: { origin: 'https://app.example.test' },
    // app/sw.ts passes `navigationPreload: true`. Without
    // `registration.navigationPreload` serwist decides the browser does not
    // support preloading and takes its unsupported-branch, so the config the
    // app actually ships would go unexercised.
    registration: {
      navigationPreload: {
        enable: vi.fn().mockResolvedValue(undefined),
        setHeaderValue: vi.fn().mockResolvedValue(undefined),
      },
    },
  });

  return { listeners, clientsMatchAll };
});

const clientsMatchAll = swScope.clientsMatchAll;

let runtimeCaching: RuntimeCaching[];
let neverCachePrefixes: string[];
let pushSubscriptionChangeHandlers: Array<
  (event: { waitUntil: (p: Promise<unknown>) => void }) => void
>;

beforeAll(async () => {
  const sw = await import('@/app/sw');
  runtimeCaching = sw.runtimeCaching;
  neverCachePrefixes = sw.NEVER_CACHE_PREFIXES;
  pushSubscriptionChangeHandlers =
    (swScope.listeners.get('pushsubscriptionchange') as typeof pushSubscriptionChangeHandlers) ??
    [];
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('PWA service worker routing', () => {
  it('routes every never-cache prefix to NetworkOnly, and nothing else', () => {
    const entry = runtimeCaching.find((candidate) => candidate.handler instanceof NetworkOnly);
    if (!entry) throw new Error('no NetworkOnly route registered');

    for (const prefix of neverCachePrefixes) {
      expect(
        matcherOf(entry)(
          matchArgs(`https://app.example.test${prefix}/anything`, fakeRequest()),
        ),
      ).toBe(true);
    }

    // A dashboard path must still be cacheable...
    expect(
      matcherOf(entry)(matchArgs('https://app.example.test/today', fakeRequest())),
    ).toBeFalsy();
    // ...only GET is ever excluded, so a POST to the same prefix isn't matched
    // here (it never hits the cache either way, but this route must not claim it)...
    expect(
      matcherOf(entry)(
        matchArgs(
          'https://app.example.test/api/pwa/mutations/appointment',
          fakeRequest({ method: 'POST' }),
        ),
      ),
    ).toBeFalsy();
    // ...and a cross-origin request to the same path must not match.
    expect(
      matcherOf(entry)(
        matchArgs(
          'https://evil.example.test/api/pwa/mutations/appointment',
          fakeRequest(),
          false,
        ),
      ),
    ).toBeFalsy();
  });

  it('routes dashboard navigations through NetworkFirst, not other same-path requests', () => {
    const entry = runtimeCaching.find(
      (candidate): candidate is RuntimeCaching & { handler: NetworkFirst } =>
        candidate.handler instanceof NetworkFirst &&
        candidate.handler.cacheName === 'medium-dashboard-pages',
    );
    if (!entry) throw new Error('no dashboard-pages NetworkFirst route registered');

    expect(
      matcherOf(entry)(
        matchArgs('https://app.example.test/today', fakeRequest({ mode: 'navigate' })),
      ),
    ).toBe(true);
    expect(
      matcherOf(entry)(
        matchArgs(
          'https://app.example.test/settings/notifications',
          fakeRequest({ mode: 'navigate' }),
        ),
      ),
    ).toBe(true);
    // Same path, but not a navigation (e.g. a same-origin fetch/XHR) — must not
    // be claimed by the navigation-only NetworkFirst route.
    expect(
      matcherOf(entry)(
        matchArgs('https://app.example.test/today', fakeRequest({ mode: 'same-origin' })),
      ),
    ).toBe(false);
    // A real navigation, but outside the dashboard (e.g. sign-in) — not matched.
    expect(
      matcherOf(entry)(
        matchArgs('https://app.example.test/sign-in', fakeRequest({ mode: 'navigate' })),
      ),
    ).toBe(false);
  });

  // A browser-initiated endpoint rotation is invisible to the app otherwise: the
  // server prunes the row on the next 404/410 dispatch and push dies silently.
  it('relays a browser-initiated push subscription rotation to open clients', async () => {
    expect(pushSubscriptionChangeHandlers).toHaveLength(1);

    const postMessage = vi.fn();
    clientsMatchAll.mockResolvedValueOnce([{ postMessage }]);

    let waited: Promise<unknown> | undefined;
    pushSubscriptionChangeHandlers[0]({
      waitUntil: (p) => {
        waited = p;
      },
    });
    await waited;

    expect(clientsMatchAll).toHaveBeenCalledWith({
      type: 'window',
      includeUncontrolled: true,
    });
    expect(postMessage).toHaveBeenCalledWith({ type: 'MEDIUM_PWA_RECONCILE_PUSH' });
  });
});
