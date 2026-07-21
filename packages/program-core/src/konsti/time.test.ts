import { describe, expect, it } from "vitest";

import { helsinkiDay, helsinkiWallClockToMs } from "./time.ts";

describe("Helsinki time helpers", () => {
  it("converts a summer wall clock using EEST", () => {
    expect(helsinkiWallClockToMs("2026-07-25T17:00")).toBe(Date.parse("2026-07-25T14:00:00Z"));
  });

  it("converts a winter wall clock using EET", () => {
    expect(helsinkiWallClockToMs("2026-01-25T17:00")).toBe(Date.parse("2026-01-25T15:00:00Z"));
  });

  it("rejects malformed, impossible, and DST-gap wall clocks", () => {
    expect(Number.isNaN(helsinkiWallClockToMs("not-a-date"))).toBe(true);
    expect(Number.isNaN(helsinkiWallClockToMs("2026-02-30T12:00"))).toBe(true);
    expect(Number.isNaN(helsinkiWallClockToMs("2026-03-29T03:30"))).toBe(true);
  });

  it("retains the existing forward day conversion", () => {
    expect(helsinkiDay("2026-07-24T22:30:00Z")).toBe("2026-07-25");
  });
});
