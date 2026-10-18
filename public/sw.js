// KyzenShield compatibility stub — v5 (inert)
// The CDN Referer SW approach was abandoned: Chrome rejects cross-origin
// referrer spoofing and no-cors media responses are opaque to the SW.
// CDN playback is fully direct via sacdn3.watch22.shop (no referer needed).
// This SW is intentionally inert and unregisters itself so it can never
// intercept or break media requests.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister();
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  })());
});
