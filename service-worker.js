const CACHE_VERSION = "himnario-pwa-v20260727-103415-icon";
const STATIC_ASSETS = [
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
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
