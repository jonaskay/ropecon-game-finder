import { describe, expect, it, vi } from "vitest";

import type { ProgramData } from "../normalise/types.ts";
import { LIVE_PROGRAM_URL, loadProgramData } from "./load.ts";

const program: ProgramData = {
  generatedAt: "2026-07-21T12:00:00Z",
  source: "konsti",
  items: [],
};

describe("loadProgramData", () => {
  it("reads public/program.json in development without fetching", async () => {
    const readLocal = vi.fn(async () => JSON.stringify(program));
    const fetchProgram = vi.fn();

    await expect(
      loadProgramData({
        development: true,
        localPath: "/project/public/program.json",
        readLocal: readLocal as never,
        fetchProgram,
      }),
    ).resolves.toEqual(program);
    expect(readLocal).toHaveBeenCalledWith("/project/public/program.json", "utf8");
    expect(fetchProgram).not.toHaveBeenCalled();
  });

  it("fetches the live storage object in production without reading the fallback", async () => {
    const fetchProgram = vi.fn(async () =>
      new Response(JSON.stringify(program), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const readLocal = vi.fn();

    await expect(
      loadProgramData({
        development: false,
        localPath: "/project/public/program.json",
        fetchProgram,
        readLocal: readLocal as never,
      }),
    ).resolves.toEqual(program);
    expect(fetchProgram).toHaveBeenCalledWith(LIVE_PROGRAM_URL);
    expect(readLocal).not.toHaveBeenCalled();
  });

  it("fails production rendering loudly when the live object is unavailable", async () => {
    const fetchProgram = vi.fn(async () => new Response(null, { status: 503 }));

    await expect(
      loadProgramData({
        development: false,
        localPath: "/project/public/program.json",
        fetchProgram,
      }),
    ).rejects.toThrow("Live program request failed: 503");
  });
});
