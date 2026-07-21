import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runRefresh } from "../src/run-refresh.ts";
import { GenerationCollisionError, type ProgramStorage } from "../src/storage.ts";

const payload = JSON.parse(readFileSync("../../fixtures/konsti-sample.synthetic.json", "utf8"));
const now = () => new Date("2026-07-21T12:00:00Z");
const logger = { log: vi.fn() };

function store(initial: { contents: string; generation: number } | null = null): ProgramStorage & { value: typeof initial; writes: number } {
  return {
    value: initial, writes: 0,
    async read() { return this.value; },
    async write(contents, generation) {
      expect(generation).toBe(this.value?.generation ?? 0);
      this.writes++;
      this.value = { contents, generation: (this.value?.generation ?? 0) + 1 };
      return this.value.generation;
    },
  };
}

describe("refresh job", () => {
  it("creates an initial object and replaces an older object", async () => {
    const storage = store();
    await expect(runRefresh({ fetchPayload: async () => payload, storage, logger, now, executionId: "one" })).resolves.toMatchObject({ written: true });
    expect(storage.writes).toBe(1);
    const older = JSON.parse(storage.value!.contents); older.generatedAt = "2026-07-20T12:00:00Z";
    storage.value = { contents: JSON.stringify(older), generation: 4 };
    await runRefresh({ fetchPayload: async () => payload, storage, logger, now, executionId: "two" });
    expect(storage.writes).toBe(2);
  });

  it("does not write after structural failure", async () => {
    const storage = store();
    await expect(runRefresh({ fetchPayload: async () => ({ programItems: [{}] }), storage, logger, now, executionId: "bad" })).rejects.toThrow();
    expect(storage.writes).toBe(0);
  });

  it("treats duplicate/newer execution as harmless", async () => {
    const storage = store({ contents: JSON.stringify({ generatedAt: "2026-07-21T12:00:00Z", source: "konsti", items: [] }), generation: 9 });
    await expect(runRefresh({ fetchPayload: async () => payload, storage, logger, now, executionId: "dupe" })).resolves.toEqual({ written: false, generation: 9 });
    expect(storage.writes).toBe(0);
  });

  it("rereads and accepts a winner after a generation collision", async () => {
    let reads = 0;
    const current = JSON.stringify({ generatedAt: "2026-07-21T13:00:00Z", source: "konsti", items: [] });
    const storage: ProgramStorage = {
      async read() { reads++; return reads === 1 ? null : { contents: current, generation: 2 }; },
      async write() { throw new GenerationCollisionError(); },
    };
    await expect(runRefresh({ fetchPayload: async () => payload, storage, logger, now, executionId: "race" })).resolves.toEqual({ written: false, generation: 2 });
  });

  it("propagates fetch failures without writing", async () => {
    const storage = store();
    await expect(runRefresh({ fetchPayload: async () => { throw new Error("timeout"); }, storage, logger, now, executionId: "fail" })).rejects.toThrow("timeout");
    expect(storage.writes).toBe(0);
  });
});
