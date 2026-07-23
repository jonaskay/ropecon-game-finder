import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("public/service-worker.js", "utf8");

function evaluateServiceWorker() {
  const listeners: Record<string, (event: any) => void> = {};
  const deleteCache = vi.fn(async () => true);
  const context: Record<string, any> = {
    URL,
    self: {
      addEventListener(type: string, listener: (event: any) => void) {
        listeners[type] = listener;
      },
    },
    caches: {
      keys: async () => ["ropecon-program-v1", "ropecon-program-v2", "unrelated-cache"],
      delete: deleteCache,
    },
  };
  runInNewContext(
    `${source}\nglobalThis.__test = { cacheName: CACHE, valid };`,
    context,
  );
  return {
    listeners,
    deleteCache,
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

describe("service worker v2 cache boundary", () => {
  it("uses a new cache and rejects a v1 envelope", () => {
    const { exposed } = evaluateServiceWorker();
    expect(exposed.cacheName).toBe("ropecon-program-v2");
    expect(exposed.valid(v2)).toBe(true);
    expect(exposed.valid({
      generatedAt: "2026-07-23T12:00:00Z",
      source: "konsti",
      items: [],
    })).toBe(false);
  });

  it("deletes the old program cache on activation without touching unrelated caches", async () => {
    const { listeners, deleteCache } = evaluateServiceWorker();
    let completion: Promise<unknown> | undefined;
    listeners.activate!({
      waitUntil(value: Promise<unknown>) {
        completion = value;
      },
    });
    await completion;

    expect(deleteCache).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledWith("ropecon-program-v1");
  });
});
