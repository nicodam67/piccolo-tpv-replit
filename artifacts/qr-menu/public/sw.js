// Cache version bump: clears stale demo-mode assets when connecting to real Convex.
const CACHE_NAME = "piccolo-v1";
const BASE = "/qr-menu";
const urlsToCache = [`${BASE}/`, `${BASE}/icon/icon-192.png`, `${BASE}/icon/icon-512.png`];

// Install event - cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

// Fetch event - network first, fall back to cache
self.addEventListener("fetch", (event) => {
  // Only handle GET requests - POST/PUT/DELETE cannot be cached
  if (event.request.method !== "GET") {
    return;
  }

  // Never intercept cross-origin requests (Convex, Hercules, Google Fonts…)
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never intercept auth paths
  if (url.pathname.startsWith("/auth")) {
    return;
  }

  // Never intercept Vite HMR or dev-server internal paths
  if (url.pathname.includes("/@vite") || url.pathname.includes("/@fs") || url.pathname.includes("/__vite")) {
    return;
  }

  // Handle navigation requests: network first, fall back to app shell
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(`${BASE}/`) ?? fetch(`${BASE}/`)),
    );
    return;
  }

  // Network-first for all other same-origin GET requests
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful responses; never cache error pages
        if (response.ok) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Handle push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const isAppInFocus = clientList.some((client) => client.focused);
      if (!isAppInFocus) {
        return self.registration.showNotification(data.title, data.options);
      }
    }),
  );
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(`${BASE}/`);
    }),
  );
});
