// Network first, so updates show up right away; falls back to the last saved copy when offline.
const CACHE = "power-v2";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("power-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // A request that opted out of caching (the progress sync) must reach the
  // network or fail honestly -- a cached 200 would report a successful sync
  // while offline, and the fallback below ignores the query string.
  if (e.request.cache === "no-store" || e.request.cache === "reload") return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
