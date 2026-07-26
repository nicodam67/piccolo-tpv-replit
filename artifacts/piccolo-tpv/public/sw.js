/**
 * Piccolo TPV — Service Worker
 * Strategy:
 *  - Static assets (JS, CSS, fonts, images): Cache-First
 *  - API calls: Network-First with no offline fallback (show error)
 *  - Navigations: Network-First, cached shell only as degraded fallback
 *  - Updates: waiting until an operator explicitly approves activation
 */

const APP_VERSION = '0.9.0-rc.1';
const CACHE_NAME = `piccolo-tpv-${APP_VERSION}`;
const SHELL_URLS = [
  '/',
  '/waiter.webmanifest',
  '/kds.webmanifest',
  '/fichaje.webmanifest',
  '/version.json',
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_URLS).catch(() => {
        // Shell URLs may not exist yet during first install; that's OK
      });
    })
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  event.waitUntil(self.clients.claim().then(async () => {
    const clients = await self.clients.matchAll();
    clients.forEach((client) => client.postMessage({ type: 'SW_VERSION', version: APP_VERSION }));
  }));
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // API calls: Network-First, no cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'offline', message: 'Sin conexión con el servidor' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put('/', response.clone()));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match('/');
        return cached ?? new Response(
          '<h1>Piccolo sin conexión</h1><p>Reconecta la red para continuar. No se guardan pedidos offline.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
      }),
    );
    return;
  }

  // Static assets: Cache-First
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|svg|png|jpg|jpeg|ico|webp)$/) ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached ?? new Response('', { status: 404 }));
      })
    );
    return;
  }

  // Other same-origin GETs: Network-First with cache fallback.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached ?? networkFetch;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'SW_VERSION', version: APP_VERSION });
  }
});

// ─── Background Sync ──────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'piccolo-offline-sync') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'TRIGGER_SYNC' }));
      })
    );
  }
});
