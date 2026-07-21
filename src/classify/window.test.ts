/**
 * Time-window classification tests (handoff Step 6 / primer §6).
 *
 * No network, no fixture: inline synthetic items anchored to a fixed `now` so the
 * overlap/joinable rules are exercised directly. The committed fixture's gaming rows
 * don't cover a walk-in or a live revolving-door item, so those cases are inline here.
 */

import { describe, expect, it } from "vitest";

import {
  classifyJoinableSoon,
  classifyOverlap,
  JOINABLE_WINDOW_MS,
  resolveNow,
  type TimeWindowInput,
} from "./window.ts";

// Fixed reference instant for every case below.
const NOW = Date.parse("2026-07-24T12:00:00Z");
const at = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString();

function item(overrides: Partial<TimeWindowInput> = {}): TimeWindowInput {
  return {
    start: at(10),
    end: at(70),
    isCancelled: false,
    isRevolvingDoor: false,
    signupMode: "konsti",
    capacityStatus: "available",
    ...overrides,
  };
}

describe("classifyOverlap", () => {
  const from = NOW;
  const to = NOW + JOINABLE_WINDOW_MS;

  it("is startable when the start falls inside the window", () => {
    expect(classifyOverlap(item({ start: at(30), end: at(120) }), from, to)).toBe("startable");
  });

  it("treats a start exactly at `from` as inside the window", () => {
    expect(classifyOverlap(item({ start: at(0), end: at(60) }), from, to)).toBe("startable");
  });

  it("excludes a start exactly at `to` (strict upper bound)", () => {
    expect(classifyOverlap(item({ start: at(60), end: at(120) }), from, to)).toBe("none");
  });

  it("excludes an item that ends exactly at `from` (strict lower bound)", () => {
    expect(classifyOverlap(item({ start: at(-60), end: at(0) }), from, to)).toBe("none");
  });

  it("is join-in-progress for a revolving-door session already running", () => {
    expect(
      classifyOverlap(item({ start: at(-30), end: at(90), isRevolvingDoor: true }), from, to),
    ).toBe("join-in-progress");
  });

  it("is in-progress-no-join for a non-revolving session already running", () => {
    expect(
      classifyOverlap(item({ start: at(-30), end: at(90), isRevolvingDoor: false }), from, to),
    ).toBe("in-progress-no-join");
  });

  it("excludes an item wholly in the future beyond the window", () => {
    expect(classifyOverlap(item({ start: at(120), end: at(180) }), from, to)).toBe("none");
  });
});

describe("classifyJoinableSoon", () => {
  it("includes a session starting within the hour", () => {
    const r = classifyJoinableSoon(item({ start: at(30), end: at(120) }), NOW);
    expect(r).toEqual({ included: true, overlap: "startable", reason: null });
  });

  it("includes an ongoing revolving-door session (join mid-session)", () => {
    const r = classifyJoinableSoon(
      item({ start: at(-30), end: at(90), isRevolvingDoor: true }),
      NOW,
    );
    expect(r).toEqual({ included: true, overlap: "join-in-progress", reason: null });
  });

  it("excludes an ongoing non-revolving session (already started, no late join)", () => {
    const r = classifyJoinableSoon(item({ start: at(-30), end: at(90) }), NOW);
    expect(r).toMatchObject({ included: false, reason: "in-progress-no-join" });
  });

  it("excludes a cancelled session even when otherwise startable", () => {
    const r = classifyJoinableSoon(item({ start: at(20), isCancelled: true }), NOW);
    expect(r).toMatchObject({ included: false, reason: "cancelled" });
  });

  it("excludes a full online-Konsti session", () => {
    const r = classifyJoinableSoon(
      item({ start: at(20), signupMode: "konsti", capacityStatus: "full" }),
      NOW,
    );
    expect(r).toMatchObject({ included: false, reason: "konsti-full" });
  });

  it("keeps a physical-signup session with unknown capacity visible", () => {
    const r = classifyJoinableSoon(
      item({ start: at(20), signupMode: "physical", capacityStatus: "unknown" }),
      NOW,
    );
    expect(r.included).toBe(true);
  });

  it("keeps a walk-in (none) session visible", () => {
    const r = classifyJoinableSoon(
      item({ start: at(20), signupMode: "none", capacityStatus: "not-applicable" }),
      NOW,
    );
    expect(r.included).toBe(true);
  });

  it("does NOT exclude a full session when signup is physical (capacity isn't live)", () => {
    const r = classifyJoinableSoon(
      item({ start: at(20), signupMode: "physical", capacityStatus: "full" }),
      NOW,
    );
    expect(r.included).toBe(true);
  });

  it("excludes a session outside the window", () => {
    const r = classifyJoinableSoon(item({ start: at(120), end: at(180) }), NOW);
    expect(r).toMatchObject({ included: false, reason: "no-overlap" });
  });
});

describe("resolveNow", () => {
  const fallback = NOW;

  it("applies a valid ?now= override", () => {
    const iso = "2026-07-25T09:30:00Z";
    expect(resolveNow(iso, fallback)).toEqual({ nowMs: Date.parse(iso), overridden: true });
  });

  it("falls back to the device clock when ?now= is absent", () => {
    expect(resolveNow(null, fallback)).toEqual({ nowMs: fallback, overridden: false });
  });

  it("falls back to the device clock when ?now= is unparseable", () => {
    expect(resolveNow("not-a-date", fallback)).toEqual({ nowMs: fallback, overridden: false });
  });
});
