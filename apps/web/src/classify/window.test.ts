/**
 * Time-window classification tests (handoff Step 6 / primer §6).
 *
 * No network, no fixture: inline synthetic items anchored to a fixed `now` so the
 * overlap/joinable rules are exercised directly. The committed fixture's gaming rows
 * don't cover a walk-in or a live revolving-door item, so those cases are inline here.
 */

import { describe, expect, it } from "vitest";

import {
  classifyInWindow,
  classifyJoinableSoon,
  classifyOverlap,
  isWalkInNow,
  JOINABLE_WINDOW_MS,
  resolveNow,
  resolveWindow,
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

  it("is startable when a non-revolving session fits inside the window", () => {
    expect(classifyOverlap(item({ start: at(30), end: at(60) }), from, to)).toBe("startable");
  });

  it("includes a non-revolving session that fits the window exactly", () => {
    expect(classifyOverlap(item({ start: at(0), end: at(60) }), from, to)).toBe("startable");
  });

  it("excludes a non-revolving session that overruns `to`", () => {
    expect(classifyOverlap(item({ start: at(30), end: at(61) }), from, to)).toBe("none");
  });

  it("includes a revolving-door session that overruns `to`", () => {
    expect(
      classifyOverlap(
        item({ start: at(30), end: at(120), isRevolvingDoor: true }),
        from,
        to,
      ),
    ).toBe("startable");
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

describe("classifyInWindow", () => {
  it("includes a non-revolving session fully contained in the window", () => {
    expect(
      classifyInWindow(item({ start: at(10), end: at(60) }), NOW, NOW + 60 * 60_000),
    ).toEqual({ included: true, overlap: "startable", reason: null });
  });

  it("excludes a non-revolving session that ends after the window", () => {
    expect(
      classifyInWindow(item({ start: at(10), end: at(61) }), NOW, NOW + 60 * 60_000),
    ).toEqual({ included: false, overlap: "none", reason: "no-overlap" });
  });

  it("includes an overlapping revolving-door session that ends after the window", () => {
    expect(
      classifyInWindow(
        item({ start: at(10), end: at(180), isRevolvingDoor: true }),
        NOW,
        NOW + 60 * 60_000,
      ),
    ).toEqual({ included: true, overlap: "startable", reason: null });
  });

  it("keeps a revolving session running at the future window start", () => {
    expect(
      classifyInWindow(
        item({ start: at(10), end: at(180), isRevolvingDoor: true }),
        NOW + 60 * 60_000,
        NOW + 120 * 60_000,
      ),
    ).toEqual({ included: true, overlap: "join-in-progress", reason: null });
  });

  it("excludes a non-revolving session already in progress at `from`", () => {
    expect(
      classifyInWindow(item({ start: at(-30), end: at(30) }), NOW, NOW + 60 * 60_000),
    ).toEqual({
      included: false,
      overlap: "in-progress-no-join",
      reason: "in-progress-no-join",
    });
  });

  it("applies cancelled and full-Konsti exclusions to otherwise fitting sessions", () => {
    expect(
      classifyInWindow(
        item({ end: at(50), isCancelled: true }),
        NOW,
        NOW + 60 * 60_000,
      ).reason,
    ).toBe("cancelled");
    expect(
      classifyInWindow(
        item({ end: at(50), capacityStatus: "full" }),
        NOW,
        NOW + 60 * 60_000,
      ).reason,
    ).toBe("konsti-full");
  });

  it("uses strict window boundaries", () => {
    expect(classifyInWindow(item({ start: at(60) }), NOW, NOW + 60 * 60_000).included).toBe(
      false,
    );
    expect(
      classifyInWindow(item({ start: at(-60), end: at(0) }), NOW, NOW + 60 * 60_000).included,
    ).toBe(false);
  });
});

describe("isWalkInNow", () => {
  const walkIn = (overrides: Partial<TimeWindowInput> = {}) =>
    item({ signupMode: "none", capacityStatus: "not-applicable", ...overrides });

  it("includes a no-signup game currently running", () => {
    expect(isWalkInNow(walkIn({ start: at(-30), end: at(90) }), NOW)).toBe(true);
  });

  it("includes a walk-in that starts exactly now", () => {
    expect(isWalkInNow(walkIn({ start: at(0), end: at(60) }), NOW)).toBe(true);
  });

  it("excludes a walk-in that has not started yet", () => {
    expect(isWalkInNow(walkIn({ start: at(10), end: at(70) }), NOW)).toBe(false);
  });

  it("excludes a walk-in that has already ended", () => {
    expect(isWalkInNow(walkIn({ start: at(-120), end: at(-10) }), NOW)).toBe(false);
  });

  it("excludes an ongoing session that requires signup", () => {
    expect(isWalkInNow(item({ start: at(-30), end: at(90), signupMode: "konsti" }), NOW)).toBe(
      false,
    );
    expect(
      isWalkInNow(item({ start: at(-30), end: at(90), signupMode: "physical" }), NOW),
    ).toBe(false);
  });

  it("excludes a cancelled walk-in", () => {
    expect(isWalkInNow(walkIn({ start: at(-30), end: at(90), isCancelled: true }), NOW)).toBe(
      false,
    );
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

describe("resolveWindow", () => {
  it("resolves a valid window and clamps a past start to now", () => {
    expect(resolveWindow(at(-30), at(60), NOW)).toEqual({
      fromMs: NOW,
      toMs: NOW + 60 * 60_000,
      active: true,
    });
  });

  it("uses now when from is missing or invalid", () => {
    expect(resolveWindow(null, at(60), NOW)).toEqual({
      fromMs: NOW,
      toMs: NOW + 60 * 60_000,
      active: true,
    });
    expect(resolveWindow("bad", at(60), NOW).fromMs).toBe(NOW);
  });

  it("is inactive for missing or invalid parameters", () => {
    expect(resolveWindow(null, null, NOW).active).toBe(false);
    expect(resolveWindow(at(10), "bad", NOW).active).toBe(false);
  });

  it("is inactive when to is at or before the clamped from", () => {
    expect(resolveWindow(at(-60), at(-1), NOW).active).toBe(false);
    expect(resolveWindow(at(30), at(30), NOW).active).toBe(false);
  });
});
