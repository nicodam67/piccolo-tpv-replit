/**
 * Service Worker — piccolo-v3 (passthrough / cache-bust)
 *
 * This version intentionally clears ALL previous caches and does NOT
 * intercept fetch events. It exists only to evict stale cached JS modules
 * that were left by piccolo-v1/v2. Once older browsers have refreshed and
 * installed this SW, add real caching logic here for PWA offline support.
 */

const CACHE_NAME = 'piccolo-v3';

self.addEventListener('install', (event) => {
  // Activate immediately — do not wait for existing tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Delete every cache regardless of name.
    caches.keys()
      .then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// No fetch handler → every request falls through to the network unchanged.
