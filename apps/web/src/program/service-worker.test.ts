import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("public/service-worker.js", "utf8");

function evaluateServiceWorker(
  overrides: { caches?: Record<string, unknown>; fetch?: typeof fetch } = {},
) {
  const listeners: Record<string, (event: any) => void> = {};
  const deleteCache = vi.fn(async () => true);
  const skipWaiting = vi.fn();
  const claim = vi.fn(async () => {});
  const context: Record<string, any> = {
    URL,
    self: {
      addEventListener(type: string, listener: (event: any) => void) {
        listeners[type] = listener;
      },
      skipWaiting,
      clients: { claim },
    },
    caches: {
      keys: async () => ["ropecon-program-v1", "ropecon-program-v2", "unrelated-cache"],
      delete: deleteCache,
      ...overrides.caches,
    },
    fetch: overrides.fetch,
  };
  runInNewContext(
    `${source}\nglobalThis.__test = { cacheName: CACHE, valid };`,
    context,
  );
  return {
    listeners,
    deleteCache,
    skipWaiting,
    claim,
    exposed: context.__test as {
      cacheName: string;
      valid: (value: unknown) => boolean;
    },
  };
}

const v2 = {
  schemaVersion: 2,
  generatedAt: "2026-07-23T12:00:00Z",
  source: "kompassi+konsti",
  sources: {
    kompassi: {
      eventSlug: "event",
      fetchedAt: "2026-07-23T11:59:58Z",
    },
    konsti: { fetchedAt: "2026-07-23T11:59:59Z" },
  },
  items: [{ kompassiUrl: "https://v2.kompassi.eu/event/programs/one" }],
};

// A stale envelope from an older worker — the shape the current page rejects.
const v1 = {
  generatedAt: "2026-07-23T12:00:00Z",
  source: "konsti",
  items: [],
};

// A minimal Response stand-in whose body survives repeated .clone().json() reads.
function jsonResponse(data: unknown, { ok = true } = {}): any {
  const body = JSON.stringify(data);
  return {
    ok,
    clone: () => jsonResponse(data, { ok }),
    json: async () => JSON.parse(body),
  };
}

// A Cache stand-in backed by a single mutable entry, exposing the mocked methods.
function makeCache(initial?: any) {
  let stored = initial;
  return {
    match: vi.fn(async () => stored),
    put: vi.fn(async (_req: unknown, res: any) => {
      stored = res;
    }),
    delete: vi.fn(async () => {
      const had = stored !== undefined;
      stored = undefined;
      return had;
    }),
    current: () => stored,
  };
}

// Drive the fetch listener for a program.json request and return the responded promise.
function runFetch(
  cache: ReturnType<typeof makeCache>,
  fetchImpl: typeof fetch,
): { responded: Promise<any> } {
  const { listeners } = evaluateServiceWorker({
    caches: { open: async () => cache },
    fetch: fetchImpl,
  });
  const result: { responded: Promise<any> } = { responded: Promise.resolve() };
  listeners.fetch!({
    request: { url: "https://storage.googleapis.com/bucket/program.json", method: "GET" },
    respondWith(value: Promise<any>) {
      result.responded = value;
    },
  });
  return result;
}

describe("service worker v2 cache boundary", () => {
  it("uses a new cache and rejects a v1 envelope", () => {
    const { exposed } = evaluateServiceWorker();
    expect(exposed.cacheName).toBe("ropecon-program-v2");
    expect(exposed.valid(v2)).toBe(true);
    expect(exposed.valid(v1)).toBe(false);
  });

  it("skips waiting on install so an upgrade takes over open tabs", () => {
    const { listeners, skipWaiting } = evaluateServiceWorker();
    listeners.install!({});
    expect(skipWaiting).toHaveBeenCalledOnce();
  });

  it("claims clients and deletes the old program cache on activation without touching unrelated caches", async () => {
    const { listeners, deleteCache, claim } = evaluateServiceWorker();
    let completion: Promise<unknown> | undefined;
    listeners.activate!({
      waitUntil(value: Promise<unknown>) {
        completion = value;
      },
    });
    await completion;

    expect(claim).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledWith("ropecon-program-v1");
  });
});

describe("service worker fetch fallback", () => {
  it("serves a valid cached copy when the network fails", async () => {
    const cache = makeCache(jsonResponse(v2));
    const cached = cache.current();
    const { responded } = runFetch(cache, vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);

    await expect(responded).resolves.toBe(cached);
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it("evicts a schema-invalid cached copy and rethrows instead of serving it", async () => {
    const cache = makeCache(jsonResponse(v1));
    const { responded } = runFetch(cache, vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);

    await expect(responded).rejects.toThrow("offline");
    expect(cache.delete).toHaveBeenCalledOnce();
    expect(cache.current()).toBeUndefined();
  });

  it("writes and returns a newer valid network response", async () => {
    const cache = makeCache(
      jsonResponse({ ...v2, generatedAt: "2026-07-20T00:00:00Z" }),
    );
    const network = jsonResponse({ ...v2, generatedAt: "2026-07-23T12:00:00Z" });
    const { responded } = runFetch(cache, vi.fn(async () => network) as unknown as typeof fetch);

    await expect(responded).resolves.toBe(network);
    expect(cache.put).toHaveBeenCalledOnce();
  });
});
