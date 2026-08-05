// VOXYFI service worker — safe, minimal offline support for PWA installability.
// Strategy:
//  - Navigations: network-first, fall back to cache, then to /offline.
//  - Static assets (icons, screenshots, _next/static): cache-first.
//  - API / auth / dynamic data: always network, never cached.
const VERSION = "voxyfi-v3"
const STATIC_CACHE = `${VERSION}-static`
const PAGE_CACHE = `${VERSION}-pages`

const PRECACHE = [
  "/offline",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// Content-hashed build output + fonts are immutable: their URL changes when the
// content changes, so cache-first is safe and fastest.
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /\.woff2?$/.test(url.pathname)
  )
}

// Icons, favicons, and images share a stable URL across releases (e.g. the
// browser always probes the bare /favicon.ico). Cache-first would pin a stale
// logo forever, so these use stale-while-revalidate instead: serve the cached
// copy instantly, but always refetch in the background so the next load is fresh.
function isRevalidatingAsset(url) {
  return (
    url.pathname.startsWith("/screenshots/") ||
    /\.(?:png|svg|ico|webp|jpg|jpeg)$/.test(url.pathname)
  )
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return

  // Never cache API, auth, or Stripe/webhook routes — always go to network.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.pathname.includes("/auth")
  ) {
    return
  }

  // Cache-first for immutable, content-hashed assets.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
            return response
          }),
      ),
    )
    return
  }

  // Stale-while-revalidate for icons/images so updated logos self-heal.
  if (isRevalidatingAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone()
            caches
              .open(STATIC_CACHE)
              .then((cache) => cache.put(request, copy))
            return response
          })
          .catch(() => cached)
        return cached || network
      }),
    )
    return
  }

  // Network-first for page navigations, with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/offline")),
        ),
    )
  }
})
