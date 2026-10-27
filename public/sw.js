const CACHE_NAME = "apex-shell-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/apex-icon-192.png",
  "./icons/apex-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);

      // Vite fingerprints the production entry JS and CSS, so discover those
      // URLs from the built HTML and cache them for an installed app launch.
      const htmlResponse = await cache.match("./index.html");
      const html = await htmlResponse.text();
      const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map((match) => new URL(match[1], self.location.href))
        .filter((url) => url.origin === self.location.origin && /\/assets\//.test(url.pathname))
        .map((url) => url.href);
      await cache.addAll([...new Set(assetUrls)]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => (key.startsWith("apex-jee-shell-") || key.startsWith("apex-shell-")) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("./index.html")));
    return;
  }

  if (url.pathname.includes("/assets/")) {
    event.respondWith(fetch(request).then((response) => {
      if (!response.ok) return response;
      return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())).then(() => response);
    }).catch(() => caches.match(request).then((cached) => cached || Response.error())));
  }
});
