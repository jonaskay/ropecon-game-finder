const CACHE = "ropecon-program-v2";

const valid = value => value && value.schemaVersion === 2 &&
  value.source === "kompassi+konsti" &&
  Number.isFinite(Date.parse(value.generatedAt)) &&
  value.sources && value.sources.kompassi && value.sources.konsti &&
  Number.isFinite(Date.parse(value.sources.kompassi.fetchedAt)) &&
  Number.isFinite(Date.parse(value.sources.konsti.fetchedAt)) &&
  Array.isArray(value.items) &&
  value.items.every(item => item && typeof item.kompassiUrl === "string");

// Take over immediately on upgrade instead of waiting for every tab to close.
// Without this, a schema change to this worker (e.g. the v1→v2 envelope) strands
// existing clients on the old worker, which then serves a stale cache the new page
// code rejects — surfacing as a false "Program unavailable".
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith("ropecon-program-") && key !== CACHE)
        .map(key => caches.delete(key)),
    );
  })());
});

self.addEventListener("fetch", event => {
  const dataUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || !dataUrl.pathname.endsWith("program.json")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    try {
      const response = await fetch(event.request, { cache: "no-cache" });
      if (!response.ok) throw new Error("bad response");
      const networkData = await response.clone().json();
      if (!valid(networkData)) throw new Error("invalid program envelope");
      let shouldWrite = true;
      if (cached) {
        try {
          const cachedData = await cached.clone().json();
          shouldWrite = !valid(cachedData) || Date.parse(networkData.generatedAt) > Date.parse(cachedData.generatedAt);
        } catch { /* replace corrupt cache */ }
      }
      if (shouldWrite) await cache.put(event.request, response.clone());
      return shouldWrite || !cached ? response : cached;
    } catch (error) {
      // Only fall back to a cached copy that still passes the current envelope check.
      // A cache written by an older worker can hold a shape this page rejects; serving
      // it would turn a transient network failure into a hard "Program unavailable".
      if (cached) {
        try {
          if (valid(await cached.clone().json())) return cached;
        } catch { /* fall through and evict */ }
        await cache.delete(event.request);
      }
      throw error;
    }
  })());
});
