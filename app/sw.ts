/// <reference lib="webworker" />

import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
} from 'serwist';
import type { PrecacheEntry, RuntimeCaching } from 'serwist';

declare const self: ServiceWorkerGlobalScope &
  typeof globalThis & {
    __SW_MANIFEST: (PrecacheEntry | string)[];
  };

const DASHBOARD_NAVIGATION_PREFIXES = [
  '/today',
  '/calendar',
  '/chat',
  '/clients',
  '/settings',
];
const NEVER_CACHE_PREFIXES = [
  '/api/webhooks',
  '/api/inngest',
  '/api/auth',
  '/api/pwa/mutations',
];
const BACKGROUND_SYNC_TAG = 'medium-pwa-mutations';

const okOnly = () => new CacheableResponsePlugin({ statuses: [200] });
const okOrOpaque = () => new CacheableResponsePlugin({ statuses: [0, 200] });

const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ request, sameOrigin, url }) =>
      request.method === 'GET' &&
      sameOrigin &&
      NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ request, sameOrigin, url }) =>
      request.mode === 'navigate' &&
      sameOrigin &&
      isDashboardNavigation(url),
    handler: new NetworkFirst({
      cacheName: 'medium-dashboard-pages',
      networkTimeoutSeconds: 3,
      plugins: [
        okOnly(),
        new ExpirationPlugin({
          maxEntries: 24,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        }),
      ],
    }),
  },
  {
    matcher: ({ request, sameOrigin, url }) =>
      request.method === 'GET' &&
      sameOrigin &&
      isDashboardNavigation(url) &&
      (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')),
    handler: new NetworkFirst({
      cacheName: 'medium-dashboard-rsc',
      networkTimeoutSeconds: 3,
      plugins: [
        okOnly(),
        new ExpirationPlugin({
          maxEntries: 48,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        }),
      ],
    }),
  },
  {
    matcher: ({ request, sameOrigin, url }) =>
      request.method === 'GET' &&
      sameOrigin &&
      (url.pathname.startsWith('/_next/static/') ||
        url.pathname.startsWith('/icons/') ||
        url.pathname === '/manifest.json' ||
        url.pathname === '/apple-touch-icon.png'),
    handler: new CacheFirst({
      cacheName: 'medium-static-assets',
      plugins: [
        okOrOpaque(),
        new ExpirationPlugin({
          maxEntries: 160,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        }),
      ],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
  },
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

self.addEventListener('sync', (event: Event) => {
  const syncEvent = event as ExtendableEvent & { tag?: string };
  if (syncEvent.tag !== BACKGROUND_SYNC_TAG) return;
  syncEvent.waitUntil(requestClientReplay());
});

async function requestClientReplay() {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  for (const client of clients) {
    client.postMessage({ type: 'MEDIUM_PWA_REPLAY_MUTATIONS' });
  }
}

function isDashboardNavigation(url: URL): boolean {
  return DASHBOARD_NAVIGATION_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
}

type PushPayload = { title: string; body: string; url: string; tag: string };

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | null;
  event.waitUntil(focusOrOpenWindow(data?.url ?? '/today'));
});

// Focus an already-open tab on the target path (navigating it if the query
// differs, e.g. a new appointmentId), otherwise open a fresh window.
async function focusOrOpenWindow(url: string): Promise<void> {
  const target = new URL(url, self.location.origin);
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  for (const client of windows) {
    if (!('focus' in client)) continue;
    const windowClient = client as WindowClient;
    if (new URL(windowClient.url).pathname === target.pathname) {
      await windowClient.focus();
      if (windowClient.url !== target.href) {
        await windowClient.navigate(target.href).catch(() => undefined);
      }
      return;
    }
  }
  await self.clients.openWindow(target.href);
}

serwist.addEventListeners();
