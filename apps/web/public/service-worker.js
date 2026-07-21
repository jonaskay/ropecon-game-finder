const CACHE = "ropecon-program-v1";

const valid = value => value && value.source === "konsti" &&
  Number.isFinite(Date.parse(value.generatedAt)) && Array.isArray(value.items);

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
