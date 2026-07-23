import { describe, expect, it, vi } from "vitest";
import type { ProgramDataV2, ProgramItemV2 } from "@ropecon/program-core";
import { isNewer, loadProgramData, validateProgramData, type ProgramCache } from "./load.ts";

const item: ProgramItemV2 = {
  slug: "one", parentId: "one", title: "Game", shortDescription: "", description: "",
  start: "2026-07-24T12:00:00Z", end: "2026-07-24T13:00:00Z", durationMinutes: 60,
  location: "Hall", people: "", otherAuthor: "", isCancelled: false,
  isGaming: true, types: ["gaming"], topics: ["rpg"], registrations: ["not-required"],
  tags: [], genres: [], styles: [], languages: [],
  ageGroups: [], gameSystem: "", contentWarnings: "", accessibilityValues: [],
  otherAccessibilityInformation: "", entryFee: "", day: "2026-07-24",
  isPreConventionWeek: false, isRevolvingDoor: false,
  kompassiUrl: "https://v2.kompassi.eu/event/programs/one",
  signupProvider: "none", signupStrategy: null, requiresSignup: false,
  signupUrl: null, physicalSignupLocation: null, capacityStatus: "not-applicable" as const,
  availabilitySource: null,
  maxAttendance: null, joinedCount: null, remainingSeats: null, isFull: null,
};
const data = (generatedAt = "2026-07-21T12:00:00Z"): ProgramDataV2 => ({
  schemaVersion: 2,
  generatedAt,
  source: "kompassi+konsti",
  sources: {
    kompassi: { eventSlug: "event", fetchedAt: generatedAt },
    konsti: { fetchedAt: generatedAt },
  },
  items: [item],
});

function memoryCache(initial: unknown = null): ProgramCache & { value: unknown } {
  return { value: initial, async read() { return this.value; }, async write(value) { this.value = value; } };
}

describe("published program boundary", () => {
  it("validates the complete envelope and rejects invalid responses", () => {
    expect(validateProgramData(data())).toEqual(data());
    expect(() => validateProgramData({ source: "konsti", items: [] })).toThrow(
      "invalid version-2 envelope",
    );
  });

  it("rejects the old v1 envelope and ignores it as a browser cache entry", async () => {
    const v1 = {
      generatedAt: "2026-07-21T13:00:00Z",
      source: "konsti",
      items: [],
    };
    expect(() => validateProgramData(v1)).toThrow("version-2 envelope");

    const cache = memoryCache(v1);
    const result = await loadProgramData({
      url: "https://storage.example/program",
      cache,
      fetchProgram: async () => Response.json(data()),
    });
    expect(result.status).toBe("ready-network");
    expect(cache.value).toEqual(data());
  });

  it("fetches the exact external URL and caches valid data", async () => {
    const cache = memoryCache();
    const fetchProgram = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(data()));
    const result = await loadProgramData({ url: "https://storage.example/program", cache, fetchProgram });
    expect(fetchProgram.mock.calls[0]?.[0]).toBe("https://storage.example/program");
    expect(result.status).toBe("ready-network");
    expect(cache.value).toEqual(data());
  });

  it("rejects invalid network data and uses a valid cache offline", async () => {
    const cached = data("2026-07-21T11:00:00Z");
    const result = await loadProgramData({
      url: "https://storage.example/program", cache: memoryCache(cached),
      fetchProgram: async () => Response.json({ nope: true }), nowMs: Date.parse("2026-07-21T12:00:01Z"),
    });
    expect(result).toMatchObject({ status: "ready-cache", data: cached, stale: true });
  });

  it("never replaces a newer cached snapshot", async () => {
    const cache = memoryCache(data("2026-07-21T13:00:00Z"));
    const result = await loadProgramData({ url: "https://storage.example/program", cache,
      fetchProgram: async () => Response.json(data("2026-07-21T12:00:00Z")) });
    expect(result.status === "ready-network" && result.data.generatedAt).toBe("2026-07-21T13:00:00Z");
    expect(isNewer(data("2026-07-21T13:00:00Z"), data())).toBe(true);
  });

  it("returns first-run guidance state when cache and network are unavailable", async () => {
    const result = await loadProgramData({ url: "https://storage.example/program", cache: memoryCache(),
      fetchProgram: async () => { throw new Error("offline"); } });
    expect(result).toEqual({ status: "unavailable-first-run", error: "offline" });
  });
});
