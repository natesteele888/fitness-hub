// Network first, so updates show up right away; falls back to the last saved copy when offline.
const CACHE = "power-v11";
// Save the page itself at install. Without this, the first visit caches nothing
// (the page loaded before the worker existed), so opening it offline right after
// installing fails. Each file is added on its own so one miss can't block install.
const SHELL = ["./", "manifest.json", "/apps/icons/fitness-192.png", "/apps/icons/fitness-512.png"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})))));
});
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("power-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // A request that opted out of caching (the progress sync) must reach the
  // network or fail honestly -- a cached 200 would report a successful sync
  // while offline, and the fallback below ignores the query string.
  // Only "no-store": Chrome marks a page reload "reload", and skipping those
  // left a reload with no signal with nothing to answer it.
  if (e.request.cache === "no-store") return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
