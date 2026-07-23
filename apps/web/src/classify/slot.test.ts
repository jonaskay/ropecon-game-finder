/**
 * "My time slot" picker model tests (primer §6, issue-05).
 *
 * No network, no fixture: inline synthetic con days anchored to fixed instants so the
 * default resolution, `+Nh` window maths, custom clamping, and past-midnight range are
 * exercised directly. Times are UTC; +3h gives the Helsinki summer (EEST) wall clock.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUICK,
  QUICK_HOURS,
  conDays,
  defaultFromTime,
  resolveDefaultDay,
  resolveDefaultSelection,
  resolveSlot,
  selectionFromWindow,
  type SlotItem,
} from "./slot.ts";

// A three-day con (Fri–Sun): each day a morning and evening session; Friday also has a
// late session running past midnight (start 23:30 Fri, end 01:30 Sat — bucketed Friday).
const items: SlotItem[] = [
  { day: "2026-07-24", start: "2026-07-24T07:00:00Z", end: "2026-07-24T09:00:00Z" }, // Fri 10:00–12:00
  { day: "2026-07-24", start: "2026-07-24T15:00:00Z", end: "2026-07-24T18:00:00Z" }, // Fri 18:00–21:00
  { day: "2026-07-24", start: "2026-07-24T20:30:00Z", end: "2026-07-24T22:30:00Z" }, // Fri 23:30–Sat 01:30
  { day: "2026-07-25", start: "2026-07-25T07:00:00Z", end: "2026-07-25T09:00:00Z" }, // Sat 10:00–12:00
  { day: "2026-07-26", start: "2026-07-26T07:00:00Z", end: "2026-07-26T09:00:00Z" }, // Sun 10:00–12:00
];

describe("conDays", () => {
  it("lists the distinct calendar days ascending", () => {
    expect(conDays(items)).toEqual(["2026-07-24", "2026-07-25", "2026-07-26"]);
  });
});

describe("resolveDefaultDay", () => {
  it("uses today when it still has an unfinished session", () => {
    // Fri 09:00 Helsinki: Friday sessions are still ahead.
    expect(resolveDefaultDay(items, Date.parse("2026-07-24T06:00:00Z"))).toBe("2026-07-24");
  });

  it("advances to the next day once today is spent", () => {
    // Sat 03:00 Helsinki: everything Friday has ended, Saturday is still ahead.
    expect(resolveDefaultDay(items, Date.parse("2026-07-25T00:00:00Z"))).toBe("2026-07-25");
  });

  it("uses the first con day when opened before the con", () => {
    expect(resolveDefaultDay(items, Date.parse("2026-07-20T09:00:00Z"))).toBe("2026-07-24");
  });

  it("stays on the calendar day of the small hours", () => {
    // Sat 01:00 Helsinki (= Fri 22:00 UTC): the calendar day is Saturday, and Saturday
    // still has an unfinished session — so the dropdown lands on Saturday and the window
    // reaches back to the late Friday session by overlap, not by relabelling the day.
    expect(resolveDefaultDay(items, Date.parse("2026-07-24T22:00:00Z"))).toBe("2026-07-25");
  });

  it("falls back to the last day once the con is over", () => {
    expect(resolveDefaultDay(items, Date.parse("2026-07-28T09:00:00Z"))).toBe("2026-07-26");
  });

  it("returns null with no data", () => {
    expect(resolveDefaultDay([], Date.parse("2026-07-24T12:00:00Z"))).toBeNull();
  });
});

describe("defaultFromTime", () => {
  it("rounds now down to the quarter hour on today", () => {
    // Fri 13:07 Helsinki → 13:00.
    expect(defaultFromTime(items, "2026-07-24", Date.parse("2026-07-24T10:07:00Z"))).toBe("13:00");
  });

  it("uses the day's earliest session on a future day", () => {
    // Saturday's earliest is 10:00 Helsinki.
    expect(defaultFromTime(items, "2026-07-25", Date.parse("2026-07-24T10:00:00Z"))).toBe("10:00");
  });

  it("falls back to noon for a day with no sessions", () => {
    expect(defaultFromTime(items, "2026-07-30", Date.parse("2026-07-24T10:00:00Z"))).toBe("12:00");
  });
});

describe("resolveDefaultSelection", () => {
  it("defaults to today, now-rounded, +3h", () => {
    const sel = resolveDefaultSelection(items, Date.parse("2026-07-24T10:07:00Z"));
    expect(sel).toMatchObject({ fromDay: "2026-07-24", fromTime: "13:00", quick: DEFAULT_QUICK });
  });

  it("produces a coherent day+time in the small hours", () => {
    // Sat 01:07 Helsinki: day and time must describe the same instant — Saturday 01:00.
    const sel = resolveDefaultSelection(items, Date.parse("2026-07-24T22:07:00Z"));
    expect(sel).toMatchObject({ fromDay: "2026-07-25", fromTime: "01:00", quick: DEFAULT_QUICK });
  });

  it("anchors on the day's first session for a future default day", () => {
    // Before the con: default day is Friday, time = Friday's first session (10:00).
    const sel = resolveDefaultSelection(items, Date.parse("2026-07-20T09:00:00Z"));
    expect(sel).toMatchObject({ fromDay: "2026-07-24", fromTime: "10:00" });
  });

  it("stays usable with no data", () => {
    const sel = resolveDefaultSelection([], Date.parse("2026-07-24T10:07:00Z"));
    expect(sel).toMatchObject({ fromDay: "2026-07-24", fromTime: "13:00", quick: DEFAULT_QUICK });
  });
});

describe("resolveSlot", () => {
  const base = { fromDay: "2026-07-24", fromTime: "13:00", toDay: "2026-07-24", toTime: "13:00" };

  it("sets to = from + N hours for a quick option", () => {
    const r = resolveSlot({ ...base, quick: 3 });
    expect(r.active).toBe(true);
    expect(r.toMs - r.fromMs).toBe(3 * 60 * 60_000);
    expect(r.toDay).toBe("2026-07-24");
    expect(r.toTime).toBe("16:00");
  });

  it("carries a +Nh window past midnight into the next day (≈04:00 boundary)", () => {
    const r = resolveSlot({ ...base, fromTime: "23:00", quick: 3 });
    expect(r.toDay).toBe("2026-07-25");
    expect(r.toTime).toBe("02:00");
  });

  it("honours a valid custom window", () => {
    const r = resolveSlot({ ...base, quick: "custom", toDay: "2026-07-24", toTime: "18:30" });
    expect(r).toMatchObject({ active: true, corrected: false, toTime: "18:30" });
  });

  it("clamps an inverted custom window forward instead of breaking", () => {
    const r = resolveSlot({ ...base, fromTime: "18:00", quick: "custom", toDay: "2026-07-24", toTime: "15:00" });
    expect(r).toMatchObject({ active: true, corrected: true, toTime: "19:00" });
    expect(r.toMs - r.fromMs).toBe(60 * 60_000);
  });

  it("is inactive when from is unparseable", () => {
    expect(resolveSlot({ ...base, fromTime: "99:99", quick: 3 }).active).toBe(false);
  });

  it("is inactive when a custom to is unparseable", () => {
    expect(resolveSlot({ ...base, quick: "custom", toDay: "2026-07-24", toTime: "bad" }).active).toBe(false);
  });
});

describe("selectionFromWindow", () => {
  it("maps an exact +Nh gap back to the quick option", () => {
    const from = Date.parse("2026-07-24T10:00:00Z"); // Fri 13:00
    const sel = selectionFromWindow(from, from + 2 * 60 * 60_000);
    expect(sel).toMatchObject({ fromDay: "2026-07-24", fromTime: "13:00", quick: 2 });
  });

  it("falls back to custom for a non-whole-hour gap", () => {
    const from = Date.parse("2026-07-24T10:00:00Z");
    const sel = selectionFromWindow(from, from + 90 * 60_000);
    expect(sel).toMatchObject({ quick: "custom", toTime: "14:30" });
  });

  it("only offers the advertised quick options", () => {
    expect(QUICK_HOURS).toEqual([1, 2, 3, 4, 5]);
  });
});
