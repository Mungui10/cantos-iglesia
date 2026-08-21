const CACHE_VERSION = "himnario-pwa-v20260816-lexical-maintext-5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/main-text-editor.js?v=20260816-lexical4",
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
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("himnario-") && key !== CACHE_VERSION).map(key => caches.delete(key))))
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
          if (response.ok) caches.open(CACHE_VERSION).then(cache => cache.put("./index.html", response.clone()));
          return response;
        })
        .catch(() => caches.match(request).then(response => response || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_VERSION).then(cache => cache.put(request, response.clone()));
      return response;
    }))
  );
});
