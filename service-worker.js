const CACHE_VERSION = "himnario-pwa-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("himnario-") && key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", () => {
  return;
});
