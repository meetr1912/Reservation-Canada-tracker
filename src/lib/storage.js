// Last-good report cache backed by the Cache Storage API (the report is far
// too large for localStorage). Used as an offline/error fallback so the app
// still shows the latest known availability when the network fetch fails.
const CACHE_NAME = 'pct-report-v1';
const AUX_KEY = 'pct-report-meta-v1';
const CACHE_URL = '/pct-last-good-report.json';

function cacheSupported() {
  return typeof window !== 'undefined' && 'caches' in window;
}

export async function saveCachedReport(raw) {
  if (!cacheSupported()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      new Request(CACHE_URL),
      new Response(JSON.stringify(raw), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    localStorage.setItem(AUX_KEY, String(Date.now()));
  } catch (e) {
    // Quota/permission issues should never break the app.
    console.warn('Could not cache availability report:', e);
  }
}

export async function readCachedReport() {
  if (!cacheSupported()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(new Request(CACHE_URL));
    if (!res) return null;
    const raw = await res.json();
    const savedAt = Number(localStorage.getItem(AUX_KEY)) || null;
    return { raw, savedAt };
  } catch (e) {
    console.warn('Could not read cached availability report:', e);
    return null;
  }
}
