const CACHE = "ropecon-program-v2";

const valid = value => value && value.schemaVersion === 2 &&
  value.source === "kompassi+konsti" &&
  Number.isFinite(Date.parse(value.generatedAt)) &&
  value.sources && value.sources.kompassi && value.sources.konsti &&
  Number.isFinite(Date.parse(value.sources.kompassi.fetchedAt)) &&
  Number.isFinite(Date.parse(value.sources.konsti.fetchedAt)) &&
  Array.isArray(value.items) &&
  value.items.every(item => item && typeof item.kompassiUrl === "string");

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
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
      if (cached) return cached;
      throw error;
    }
  })());
});
