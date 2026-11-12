/* LingoLoop service worker.
 *
 *  - App shell & pages: network-first, falling back to the last good copy, then /offline.
 *  - Next.js build assets (/_next/static): cache-first (content-hashed, immutable).
 *  - Learning data (GET /api/content, /api/progress, …): network-first with offline fallback.
 *  - Media from Supabase Storage: posters/captions cache-first; videos are downloaded once in the
 *    background after first play and then served from cache (with HTTP Range support), so watched
 *    videos replay offline and never re-download.
 *  - Personal caches are wiped on sign-out ("clear-personal" message).
 */
const VERSION = "v1";
const STATIC = `ll-static-${VERSION}`;
const PAGES = `ll-pages-${VERSION}`;
const API = `ll-api-${VERSION}`;
const MEDIA = `ll-media-${VERSION}`;
const KEEP = [STATIC, PAGES, API, MEDIA];
const MAX_VIDEOS = 30;
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];
const API_CACHEABLE = [/^\/api\/content(\/[^/]+)?$/, /^\/api\/progress$/, /^\/api\/me$/, /^\/api\/conversations(\/[^/]+)?$/, /^\/api\/vocabulary\/review$/];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ll-") && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-personal") {
    event.waitUntil(Promise.all([caches.delete(API), caches.delete(PAGES)]));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.pathname.startsWith("/storage/v1/object/public/media/")) {
    if (/\.mp4$/i.test(url.pathname)) return event.respondWith(video(event, req));
    if (/\.(jpe?g|png|webp|vtt)$/i.test(url.pathname)) return event.respondWith(cacheFirst(req, MEDIA));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) return event.respondWith(cacheFirst(req, STATIC));
  if (url.pathname.startsWith("/api/")) {
    if (API_CACHEABLE.some((re) => re.test(url.pathname))) return event.respondWith(networkFirst(req, API));
    return; // everything else (auth, audio, mutations) goes straight to the network
  }
  if (url.pathname.startsWith("/auth/")) return;
  if (req.mode === "navigate") return event.respondWith(page(req));
  if (req.headers.get("RSC")) return event.respondWith(networkFirst(req, PAGES));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok && !res.redirected) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    if (req.url.includes("/api/")) {
      return new Response(JSON.stringify({ error: "You're offline. This will load when you reconnect." }), { status: 503, headers: { "Content-Type": "application/json" } });
    }
    throw e;
  }
}

async function page(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    // Only keep real pages (not redirects to /login) so offline never shows a stale auth bounce.
    if (res.ok && !res.redirected) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (await caches.match("/offline")) || new Response("Offline", { status: 503 });
  }
}

/** Serve videos from cache (slicing for Range requests); otherwise stream from the network and
 * download the full file once in the background for next time. */
async function video(event, req) {
  const cache = await caches.open(MEDIA);
  const key = req.url;
  const full = await cache.match(key);
  if (full) return rangeResponse(full, req.headers.get("range"));
  event.waitUntil(saveVideo(cache, key));
  try {
    return await fetch(req);
  } catch {
    return new Response(null, { status: 504 });
  }
}

const inflight = new Set();
async function saveVideo(cache, key) {
  if (inflight.has(key)) return;
  inflight.add(key);
  try {
    const res = await fetch(key, { mode: "cors", credentials: "omit" });
    if (!res.ok || res.status !== 200) return;
    await cache.put(key, res);
    const keys = (await cache.keys()).filter((r) => r.url.endsWith(".mp4"));
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_VIDEOS))) await cache.delete(old);
  } catch {
    /* best effort */
  } finally {
    inflight.delete(key);
  }
}

async function rangeResponse(full, range) {
  const type = full.headers.get("Content-Type") || "video/mp4";
  if (!range) return full;
  const buf = await full.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const size = buf.byteLength;
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (m && !m[1] && m[2]) {
    start = size - parseInt(m[2], 10);
    end = size - 1;
  }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" },
  });
}
