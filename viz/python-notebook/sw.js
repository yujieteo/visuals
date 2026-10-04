// Service worker of the Python Notebook website version. Its scope is this folder only.
//
// It never downloads anything itself and never updates by itself. The page's Prepare offline (src/offline.js)
// fills one cache, "pynb-<build>", with the page and every runtime file, checks each one, and only then
// points the "pynb-pointer" cache at it. This worker answers every GET in its scope from the cache that the
// pointer names, and passes everything else, and every request with cache "no-store" (which Prepare offline
// uses to read the site), to the network unchanged.
"use strict";
const POINTER = "pynb-pointer";
/** @type {Promise<{cache: string, build: string} | null> | null} */
let current = null;

const pointer = () => {
  current = current || caches.open(POINTER)
    .then((cache) => cache.match(new URL("pointer", self.registration.scope)))
    .then((response) => (response ? response.json() : null))
    .catch(() => null);
  return current;
};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "pynb-pointer") current = null;
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.cache === "no-store" || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const ready = await pointer();
    if (ready) {
      const cache = await caches.open(ready.cache);
      const hit = await cache.match(request, { ignoreSearch: true });
      if (hit) return hit;
    }
    return fetch(request);
  })());
});
