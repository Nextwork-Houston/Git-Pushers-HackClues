"use strict";

/**
 * Orbit showcase service worker.
 *
 * Bump CACHE_VERSION whenever the shell, the component, or the sprite sheets
 * change. The activate handler deletes every older orbit-pwa-* cache, so a
 * bump is what lets an existing visitor see new artwork or new code.
 */
const CACHE_VERSION = "v1.1.0";
const CACHE_NAME = `orbit-pwa-${CACHE_VERSION}`;
const SHELL_DOCUMENT = "./demo.html";

const APP_SHELL = [
  SHELL_DOCUMENT,
  "./avatar-companion.js",
  "./speech-bridge.js",
  "./icon-192.png",
  "./icon-512.png",
  "./orbit-spritesheet-pink.png",
  "./orbit-actions-emotions-pink.png",
  "./orbit-actions-acrobatics-pink.png",
  "./orbit-actions-entertainment-pink.png",
  "./orbit-actions-love-pink.png"
];

/** Code and markup must refresh; only artwork is safe to serve cache-first. */
function isImmutableAsset(pathname) {
  return /\.(png|jpg|jpeg|webp|avif|woff2?)$/i.test(pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // A single missing file would reject addAll and abort the whole install,
      // leaving the visitor with no offline support at all.
      .then((cache) => Promise.allSettled(APP_SHELL.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("orbit-pwa-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network first, falling back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only a real page is worth keeping. Caching an error response here
          // would pin a 404 as the app shell for every later offline load.
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_DOCUMENT, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_DOCUMENT))
    );
    return;
  }

  // Artwork rarely changes within a version, so it is served from cache.
  if (isImmutableAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else — scripts, styles, JSON — is stale-while-revalidate, so a
  // fix ships on the next load instead of waiting for a version bump.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
