/* Service worker for the Parks Canada Camping Tracker.
 * Strategy:
 *   - app shell (navigations): network-first, fall back to cached index.html
 *   - hashed static assets: cache-first (safe: content-hashed filenames)
 *   - availability_report.json: stale-while-revalidate, so the last good
 *     snapshot is available instantly and offline.
 * The app also caches the report in the Cache Storage API itself, so the
 * offline fallback works even before this worker takes control.
 */
const PREFIX = '/Reservation-Canada-tracker';
const SHELL_CACHE = 'pct-shell-v1';
const DATA_CACHE = 'pct-data-v1';
const SHELL_URLS = [
  `${PREFIX}/`,
  `${PREFIX}/index.html`,
  `${PREFIX}/manifest.json`,
  `${PREFIX}/icon-192.png`,
  `${PREFIX}/icon-512.png`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function cachePut(cacheName, request, response) {
  if (!response || !response.ok || response.redirected) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
}

// Serve cached data immediately, refresh in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      cachePut(DATA_CACHE, request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/availability_report.json')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(SHELL_CACHE, request, response.clone());
          return response;
        })
        .catch(() => caches.match(`${PREFIX}/index.html`)),
    );
    return;
  }

  if (url.pathname.startsWith(`${PREFIX}/static/`)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        cachePut(SHELL_CACHE, request, response.clone());
        return response;
      })),
    );
  }
});
