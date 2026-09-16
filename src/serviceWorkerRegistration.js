// Registers the offline service worker in production builds only, so local
// development never serves stale assets. Mirrors the essentials of CRA's
// generated registration helper without pulling in workbox.
export function register() {
  if (process.env.NODE_ENV !== 'production') return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    const swUrl = `${process.env.PUBLIC_URL}/sw.js`;
    navigator.serviceWorker.register(swUrl).catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

export function unregister() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch((error) => console.warn(error.message));
}
