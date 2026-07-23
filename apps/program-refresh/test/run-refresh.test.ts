import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  parseKompassiSchedule,
  projectResponse,
  type KompassiSchedule,
  type ProgramDataV2,
  type ProjectedItem,
} from "@ropecon/program-core";
import {
  runRefresh,
  type RefreshDependencies,
} from "../src/run-refresh.ts";
import { GenerationCollisionError, type ProgramStorage } from "../src/storage.ts";

const kompassi = parseKompassiSchedule(JSON.parse(
  readFileSync("../../fixtures/kompassi-sample.synthetic.json", "utf8"),
));
const konsti = projectResponse(JSON.parse(
  readFileSync("../../fixtures/konsti-sample.synthetic.json", "utf8"),
));
const now = () => new Date("2026-07-23T12:00:00Z");

function store(
  initial: { contents: string; generation: number } | null = null,
): ProgramStorage & { value: typeof initial; writes: number } {
  return {
    value: initial,
    writes: 0,
    async read() {
      return this.value;
    },
    async write(contents, generation) {
      expect(generation).toBe(this.value?.generation ?? 0);
      this.writes++;
      this.value = {
        contents,
        generation: (this.value?.generation ?? 0) + 1,
      };
      return this.value.generation;
    },
  };
}

function dependencies(
  storage: ProgramStorage,
  overrides: Partial<RefreshDependencies> = {},
): RefreshDependencies {
  return {
    fetchKompassi: async () => structuredClone(kompassi),
    fetchKonsti: async () => structuredClone(konsti),
    kompassiEventSlug: "synthetic-event",
    storage,
    logger: { log: vi.fn() },
    now,
    monotonicNow: () => 100,
    executionId: "test-execution",
    ...overrides,
  };
}

function currentEnvelope(generatedAt: string): ProgramDataV2 {
  return {
    schemaVersion: 2,
    generatedAt,
    source: "kompassi+konsti",
    sources: {
      kompassi: {
        eventSlug: "synthetic-event",
        fetchedAt: generatedAt,
      },
      konsti: { fetchedAt: generatedAt },
    },
    items: [],
  };
}

describe("refresh job", () => {
  it("publishes the combined version-2 envelope atomically", async () => {
    const storage = store();

    await expect(runRefresh(dependencies(storage))).resolves.toMatchObject({
      written: true,
      generation: 1,
    });

    expect(storage.writes).toBe(1);
    const data = JSON.parse(storage.value!.contents) as ProgramDataV2;
    expect(data).toMatchObject({
      schemaVersion: 2,
      source: "kompassi+konsti",
      generatedAt: "2026-07-23T12:00:00.000Z",
      sources: {
        kompassi: {
          eventSlug: "synthetic-event",
          fetchedAt: "2026-07-23T12:00:00.000Z",
        },
        konsti: { fetchedAt: "2026-07-23T12:00:00.000Z" },
      },
    });
    expect(data.items).toHaveLength(5);
    expect(data.items.some(item => item.slug === "kompassi-only-konsti")).toBe(true);
  });

  it("starts both source requests before awaiting either", async () => {
    const storage = store();
    let resolveKompassi!: (value: KompassiSchedule) => void;
    let resolveKonsti!: (value: ProjectedItem[]) => void;
    const fetchKompassi = vi.fn(() => new Promise<KompassiSchedule>(
      resolve => { resolveKompassi = resolve; },
    ));
    const fetchKonsti = vi.fn(() => new Promise<ProjectedItem[]>(
      resolve => { resolveKonsti = resolve; },
    ));

    const pending = runRefresh(dependencies(storage, { fetchKompassi, fetchKonsti }));
    expect(fetchKompassi).toHaveBeenCalledOnce();
    expect(fetchKonsti).toHaveBeenCalledOnce();
    resolveKompassi(structuredClone(kompassi));
    resolveKonsti(structuredClone(konsti));

    await expect(pending).resolves.toMatchObject({ written: true });
  });

  it.each(["kompassi", "konsti"] as const)(
    "leaves last-good untouched when %s fails",
    async failedSource => {
      const existing = {
        contents: JSON.stringify(currentEnvelope("2026-07-22T12:00:00Z")),
        generation: 7,
      };
      const storage = store(existing);
      const fetchKompassi = vi.fn(async () => {
        if (failedSource === "kompassi") throw new TypeError("private upstream detail");
        return structuredClone(kompassi);
      });
      const fetchKonsti = vi.fn(async () => {
        if (failedSource === "konsti") throw new TypeError("private upstream detail");
        return structuredClone(konsti);
      });

      await expect(runRefresh(dependencies(storage, {
        fetchKompassi,
        fetchKonsti,
      }))).rejects.toThrow("private upstream detail");

      expect(fetchKompassi).toHaveBeenCalledOnce();
      expect(fetchKonsti).toHaveBeenCalledOnce();
      expect(storage.writes).toBe(0);
      expect(storage.value).toEqual(existing);
    },
  );

  it("does not write after a hard reconciliation failure", async () => {
    const storage = store();
    const duplicate = structuredClone(kompassi);
    duplicate.scheduleItems.push(structuredClone(duplicate.scheduleItems[0]!));

    await expect(runRefresh(dependencies(storage, {
      fetchKompassi: async () => duplicate,
    }))).rejects.toThrow("failed structural, reconciliation, or privacy checks");
    expect(storage.writes).toBe(0);
  });

  it("treats an equal or newer execution as harmless", async () => {
    const storage = store({
      contents: JSON.stringify(currentEnvelope("2026-07-23T12:00:00Z")),
      generation: 9,
    });

    await expect(runRefresh(dependencies(storage))).resolves.toEqual({
      written: false,
      generation: 9,
    });
    expect(storage.writes).toBe(0);
  });

  it("rereads and accepts a winner after a generation collision", async () => {
    let reads = 0;
    const current = JSON.stringify(currentEnvelope("2026-07-23T13:00:00Z"));
    const storage: ProgramStorage = {
      async read() {
        reads++;
        return reads === 1 ? null : { contents: current, generation: 2 };
      },
      async write() {
        throw new GenerationCollisionError();
      },
    };

    await expect(runRefresh(dependencies(storage))).resolves.toEqual({
      written: false,
      generation: 2,
    });
  });

  it("logs safe reconciliation counters and finding codes", async () => {
    const storage = store();
    const logger = { log: vi.fn() };
    await runRefresh(dependencies(storage, { logger }));

    expect(logger.log).toHaveBeenCalledWith(
      "info",
      "reconciliation_complete",
      expect.objectContaining({
        kompassiCount: 5,
        gamingCount: 5,
        konstiCount: 8,
        matchedCount: 2,
        unmatchedCount: 3,
        orphanCount: 6,
      }),
    );
    expect(logger.log).toHaveBeenCalledWith(
      "warn",
      "audit_finding",
      expect.objectContaining({ code: "KONSTI_ORPHANS" }),
    );
  });

  it("never logs source content, locations, titles, or participant data", async () => {
    const storage = store();
    const logger = { log: vi.fn() };
    await runRefresh(dependencies(storage, { logger }));

    const serializedLogs = JSON.stringify(logger.log.mock.calls);
    expect(serializedLogs).not.toContain("Dragons of the North");
    expect(serializedLogs).not.toContain("Hall A");
    expect(serializedLogs).not.toContain("username");
    expect(serializedLogs).not.toContain("signupMessage");
    expect(logger.log).toHaveBeenCalledWith(
      "warn",
      "unknown_venue_count",
      expect.objectContaining({ count: expect.any(Number) }),
    );
  });

  it("serializes no Konsti participant fields", async () => {
    const storage = store();
    await runRefresh(dependencies(storage));

    expect(storage.value!.contents).not.toContain("username");
    expect(storage.value!.contents).not.toContain("signupMessage");
    expect(storage.value!.contents).not.toContain('"users"');
  });
});
