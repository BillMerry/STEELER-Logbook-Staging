// Bump this whenever assets change, to avoid stale PWA caches.
// Keep in sync with APP_VERSION in app.js for release diagnostics.
const CACHE_NAME = "steeler-logbook-v1.1.0-rc6";

const ASSETS = [
  "./",
  "./index.html",
  "./STEELER-safety-emergency-details.html",
  "./styles.css",
  "./app.js",
  "./js/core-utils.js",
  "./js/time-utils.js",
  "./js/geo-utils.js",
  "./js/ports-core.js",
  "./js/static-config.js",
  "./js/tides.js",
  "./js/sun-moon.js",
  "./js/dpp-calculations.js",
  "./js/dpp-ui.js",
  "./js/safety-emergency.js",
  "./js/ec-sms.js",
  "./js/weather-abbreviations.js",
  "./js/weather-parsers.js",
  "./js/marine-route.js",
  "./js/weather-fetch.js",
  "./js/export-print.js",
  "./js/live-data.js",
  "./manifest.json",
  "./favicon.ico",
  "./icons/steeler-192.png",
  "./icons/steeler-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Allow a deterministic cache-bypass reset: /?reset=1
  if (isSameOrigin && url.searchParams.get("reset") === "1") {
    event.respondWith(fetch(req));
    return;
  }

  // For navigation & core assets, prefer network to avoid stale JS after an update.
  const isCore =
    isSameOrigin && (
      url.pathname.endsWith("/") ||
      url.pathname.endsWith("/index.html") ||
      url.pathname.endsWith("/app.js") ||
      url.pathname.includes("/js/") ||
      /^\/app\.v.*\.js$/.test(url.pathname) ||
      url.pathname.endsWith("/styles.css") ||
      url.pathname.endsWith("/manifest.json")
    );

  if (isCore) {
    event.respondWith(
      fetch(req)
        .then((fresh) => {
          const copy = fresh.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return fresh;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // For everything else, cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        fetch(req).catch(() => {});
        return cached;
      }
      return fetch(req).catch(() => {
        if (req.mode === "navigate") return caches.match("./index.html");
        return new Response("Offline", { status: 503, statusText: "Offline" });
      });
    })
  );
});
