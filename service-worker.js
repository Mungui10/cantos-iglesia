const CACHE_VERSION = "himnario-pwa-v20260820-publicacion-actual-1";
console.info("SAVE SYSTEM DEBUG SERVICE WORKER: 2026-08-20-publicacion-actual-1", CACHE_VERSION);
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/auth-storage.js?v=20260819-1",
  "./assets/autocorrect.js?v=20260816-2",
  "./assets/presentation-repository.js?v=20260817-5",
  "./assets/pptx-integration.js?v=20260817-1",
  "./assets/pptx-renderer-1.2.4.es.js",
  "./assets/main-text-editor.js?v=20260816-lexical10",
  "./apple-touch-icon.png",
  "./icons/himnario-icon-16.png",
  "./icons/himnario-icon-32.png",
  "./icons/himnario-icon-48.png",
  "./icons/himnario-icon-72.png",
  "./icons/himnario-icon-96.png",
  "./icons/himnario-icon-128.png",
  "./icons/himnario-icon-144.png",
  "./icons/himnario-icon-152.png",
  "./icons/himnario-icon-192.png",
  "./icons/himnario-icon-384.png",
  "./icons/himnario-icon-512.png"
];

self.addEventListener("install", event => {
  console.info("SAVE DEBUG SW INSTALL", CACHE_VERSION);
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  console.info("SAVE DEBUG SW ACTIVATE", CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("himnario-pwa-") && key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.status === 200 && response.type === "basic") {
            const cacheCopy = response.clone();
            return caches.open(CACHE_VERSION)
              .then(cache => cache.put("./index.html", cacheCopy))
              .then(() => response, error => {
                console.warn("SW CACHE WRITE failed", { url: request.url, error });
                return response;
              });
          }
          return response;
        })
        .catch(() => caches.match(request).then(response => response || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.status === 200 && response.type === "basic") {
        const cacheCopy = response.clone();
        return caches.open(CACHE_VERSION)
          .then(cache => cache.put(request, cacheCopy))
          .then(() => response, error => {
            console.warn("SW CACHE WRITE failed", { url: request.url, error });
            return response;
          });
      }
      return response;
    }))
  );
});
