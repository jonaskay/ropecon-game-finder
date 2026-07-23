/**
 * Orientation-model tests (primer §6 "Empty joinable-soon state", UX decision #2).
 *
 * Inline synthetic items spanning a pre-con week + a Fri–Sun main convention, anchored to
 * fixed `?now=` instants so the derived con span, "later today", and "next active day" are
 * exercised directly — mirroring the acceptance criterion of verifying a pre-con morning
 * and a mid-con lull. Days are Europe/Helsinki calendar days (UTC+3 in July).
 */

import { describe, expect, it } from "vitest";

import { buildOrientation, type OrientationItem } from "./orientation.ts";

// A small program: two pre-con days (Thu 23rd), then a Fri–Sun main con (24–26 July 2026).
function program(): OrientationItem[] {
  return [
    { day: "2026-07-23", start: "2026-07-23T11:00:00Z", isPreConventionWeek: true, isCancelled: false },
    { day: "2026-07-23", start: "2026-07-23T12:00:00Z", isPreConventionWeek: true, isCancelled: false },
    { day: "2026-07-24", start: "2026-07-24T09:00:00Z", isPreConventionWeek: false, isCancelled: false },
    { day: "2026-07-24", start: "2026-07-24T14:00:00Z", isPreConventionWeek: false, isCancelled: false },
    { day: "2026-07-25", start: "2026-07-25T10:00:00Z", isPreConventionWeek: false, isCancelled: false },
    { day: "2026-07-26", start: "2026-07-26T10:00:00Z", isPreConventionWeek: false, isCancelled: false },
  ];
}

describe("buildOrientation — con-day span (derived, not hardcoded)", () => {
  it("derives the main-con span from non-pre-con items", () => {
    const m = buildOrientation(program(), Date.parse("2026-07-23T05:45:00Z"));
    expect(m.mainConSpan).toEqual({ firstDay: "2026-07-24", lastDay: "2026-07-26" });
    expect(m.preConDays).toEqual(["2026-07-23"]);
  });

  it("has no main-con span when every item is pre-con", () => {
    const items = program().filter((i) => i.isPreConventionWeek);
    expect(buildOrientation(items, Date.parse("2026-07-23T05:45:00Z")).mainConSpan).toBeNull();
  });
});

describe("buildOrientation — pre-convention morning", () => {
  // The issue's canonical case: ~08:45 the day before the main con opens.
  const now = Date.parse("2026-07-23T08:45:00Z");

  it("resolves today and flags pre-convention week", () => {
    const m = buildOrientation(program(), now);
    expect(m.today).toBe("2026-07-23");
    expect(m.isPreConvention).toBe(true);
  });

  it("summarises the pre-con sessions still on later today", () => {
    const m = buildOrientation(program(), now);
    expect(m.laterToday.count).toBe(2);
    expect(m.laterToday.nextStartMs).toBe(Date.parse("2026-07-23T11:00:00Z"));
  });

  it("points at the first main-con day as the next active day", () => {
    const m = buildOrientation(program(), now);
    expect(m.nextActiveDay).toEqual({
      day: "2026-07-24",
      count: 2,
      firstStartMs: Date.parse("2026-07-24T09:00:00Z"),
    });
  });
});

describe("buildOrientation — mid-con lull", () => {
  // Early Friday morning: the main con is open but nothing is joinable this hour.
  const now = Date.parse("2026-07-24T05:00:00Z");

  it("is no longer pre-convention once the first main-con day arrives", () => {
    const m = buildOrientation(program(), now);
    expect(m.today).toBe("2026-07-24");
    expect(m.isPreConvention).toBe(false);
  });

  it("counts today's still-upcoming sessions", () => {
    const m = buildOrientation(program(), now);
    expect(m.laterToday.count).toBe(2);
    expect(m.laterToday.nextStartMs).toBe(Date.parse("2026-07-24T09:00:00Z"));
  });

  it("advances the next active day to Saturday", () => {
    const m = buildOrientation(program(), now).nextActiveDay;
    expect(m?.day).toBe("2026-07-25");
  });
});

describe("buildOrientation — upcoming filtering", () => {
  it("excludes sessions that have already started from today's count", () => {
    // 13:00: the 11:00 and 12:00 pre-con sessions are in the past.
    const m = buildOrientation(program(), Date.parse("2026-07-23T13:00:00Z"));
    expect(m.laterToday.count).toBe(0);
    expect(m.laterToday.nextStartMs).toBeNull();
    // With today exhausted, the next active day is the first main-con day.
    expect(m.nextActiveDay?.day).toBe("2026-07-24");
  });

  it("excludes cancelled sessions from both today and the next active day", () => {
    const items: OrientationItem[] = [
      { day: "2026-07-24", start: "2026-07-24T09:00:00Z", isPreConventionWeek: false, isCancelled: true },
      { day: "2026-07-25", start: "2026-07-25T10:00:00Z", isPreConventionWeek: false, isCancelled: true },
      { day: "2026-07-25", start: "2026-07-25T11:00:00Z", isPreConventionWeek: false, isCancelled: false },
    ];
    const m = buildOrientation(items, Date.parse("2026-07-24T05:00:00Z"));
    expect(m.laterToday.count).toBe(0);
    expect(m.nextActiveDay).toEqual({
      day: "2026-07-25",
      count: 1,
      firstStartMs: Date.parse("2026-07-25T11:00:00Z"),
    });
  });

  it("has no next active day once the last day's sessions have passed", () => {
    const m = buildOrientation(program(), Date.parse("2026-07-26T23:00:00Z"));
    expect(m.nextActiveDay).toBeNull();
    expect(m.laterToday.count).toBe(0);
  });
});
