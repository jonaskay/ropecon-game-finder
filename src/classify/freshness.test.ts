/**
 * Snapshot freshness tests (handoff Step 9 / primer §5 step 9).
 *
 * Pure epoch-ms in; no network, no fixture. Anchored to a fixed `generatedAt` so the
 * 15-minute staleness boundary is exercised exactly (inclusive edge stays fresh).
 */

import { describe, expect, it } from "vitest";

import { classifyFreshness, STALE_THRESHOLD_MS } from "./freshness.ts";

const GENERATED = Date.parse("2026-07-24T12:00:00Z");
const min = (n: number) => GENERATED + n * 60_000;

describe("classifyFreshness", () => {
  it("is fresh for a just-taken snapshot", () => {
    const f = classifyFreshness(GENERATED, GENERATED);
    expect(f.isStale).toBe(false);
    expect(f.ageMs).toBe(0);
    expect(f.ageMinutes).toBe(0);
  });

  it("reports whole-minute age below the threshold", () => {
    const f = classifyFreshness(GENERATED, min(10));
    expect(f.isStale).toBe(false);
    expect(f.ageMinutes).toBe(10);
  });

  it("is still fresh exactly at the 15-minute boundary", () => {
    const f = classifyFreshness(GENERATED, GENERATED + STALE_THRESHOLD_MS);
    expect(f.isStale).toBe(false);
    expect(f.ageMinutes).toBe(15);
  });

  it("is stale just past the boundary", () => {
    const f = classifyFreshness(GENERATED, GENERATED + STALE_THRESHOLD_MS + 1);
    expect(f.isStale).toBe(true);
  });

  it("is stale well past the threshold and rounds age down", () => {
    const f = classifyFreshness(GENERATED, min(42) + 30_000);
    expect(f.isStale).toBe(true);
    expect(f.ageMinutes).toBe(42);
  });

  it("clamps a future-stamped snapshot to age 0 rather than reporting negative", () => {
    const f = classifyFreshness(min(30), GENERATED);
    expect(f.ageMs).toBe(0);
    expect(f.ageMinutes).toBe(0);
    expect(f.isStale).toBe(false);
  });
});
