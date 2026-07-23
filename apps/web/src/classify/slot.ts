/**
 * "My time slot" picker model (primer §6 "'My time slot' picker", issue-05).
 *
 * The picker sets `[from, to]`, but `to` is expressed RELATIVE to `from` (a `+Nh` quick
 * option) rather than as a second absolute datetime — the way a tired, one-handed guest
 * actually plans at a con ("I've got a couple of hours"). This module owns the pure,
 * DOM-free resolution of the picker's state so it is unit-testable AND reusable verbatim
 * in the browser (`src/pages/index.astro` imports it into its client `<script>`).
 *
 * The day dropdown lists the Europe/Helsinki CALENDAR days present in the data
 * (`item.day`), matching how the normaliser buckets every item everywhere else. There is
 * no separate "Friday 25:00" — a session at 00:30 is a Saturday-bucketed item — so the
 * ~04:00 con-day boundary (primer §6) is honoured NOT by relabelling days but by the
 * relative window: a `+Nh` window that starts in the evening extends past midnight, and
 * the overlap test (`item.start < to && item.end > from`) keeps a 23:30→00:30 session in
 * range. Defaults likewise anchor on `now`, so a guest awake at 01:00 sees the small hours
 * of the night they are actually attending, not the next morning.
 *
 * All instants are epoch milliseconds. Wall-clock ↔ instant conversion always goes
 * through the Helsinki-aware helpers in program-core — never a hand-rolled offset.
 */

import { helsinkiDay, helsinkiTime, helsinkiWallClockToMs } from "@ropecon/program-core";

/** The `+Nh` quick options offered beneath `from`, in hours. */
export const QUICK_HOURS = [1, 2, 3, 4, 5] as const;
export type QuickHours = (typeof QUICK_HOURS)[number];
/** A chosen `to`: either a `+Nh` offset from `from`, or an explicit custom datetime. */
export type QuickOption = QuickHours | "custom";

/**
 * Default active quick option. Sessions are mostly 2–4h, so a 1h window shows little
 * that is actually startable; +3h is the sweet spot (primer §6 "Defaults").
 */
export const DEFAULT_QUICK: QuickHours = 3;

const QUARTER_MS = 15 * 60_000;
const HOUR_MS = 60 * 60_000;

/** The slice of a `ProgramItem` the picker needs; a full `ProgramItem` satisfies it. */
export interface SlotItem {
  day: string; // Europe/Helsinki calendar day (YYYY-MM-DD)
  start: string; // UTC ISO-8601
  end: string; // UTC ISO-8601
}

/** The picker's raw state. `toDay`/`toTime` matter only when `quick === "custom"`. */
export interface SlotSelection {
  fromDay: string; // YYYY-MM-DD
  fromTime: string; // HH:MM (24h)
  quick: QuickOption;
  toDay: string; // YYYY-MM-DD
  toTime: string; // HH:MM (24h)
}

export interface ResolvedSlot {
  fromMs: number;
  toMs: number;
  active: boolean; // a usable, non-inverted window resolved
  corrected: boolean; // a custom `to` was inverted and clamped forward
  toDay: string; // the (possibly corrected) `to` day, to echo back into the UI
  toTime: string; // the (possibly corrected) `to` time
}

/** Instant → the Helsinki calendar day + wall-clock time that render it. */
function wallClockParts(ms: number): { day: string; time: string } {
  const iso = new Date(ms).toISOString();
  return { day: helsinkiDay(iso) ?? "", time: helsinkiTime(iso) ?? "" };
}

/** Floor an instant to the quarter hour (whole-hour offset ⇒ wall-clock minute == UTC minute). */
const floorQuarter = (ms: number) => Math.floor(ms / QUARTER_MS) * QUARTER_MS;

/** Distinct Europe/Helsinki calendar days present in the data, ascending. */
export function conDays(items: SlotItem[]): string[] {
  return [...new Set(items.map((i) => i.day).filter(Boolean))].sort();
}

/** Earliest session start on `day` as an instant, or null if the day has none. */
function earliestStartMs(items: SlotItem[], day: string): number | null {
  const starts = items
    .filter((i) => i.day === day)
    .map((i) => Date.parse(i.start))
    .filter((n) => !Number.isNaN(n));
  return starts.length ? Math.min(...starts) : null;
}

/** Does `day` still have a session that hasn't finished at `nowMs`? */
function hasUnfinished(items: SlotItem[], day: string, nowMs: number): boolean {
  return items.some((i) => i.day === day && Date.parse(i.end) > nowMs);
}

/**
 * The day the picker should default to (primer §6): the current calendar con day when it
 * still has an unfinished session, otherwise the next con day that does. Before the con it
 * resolves to the first day; once the con is over it falls back to the last. The dropdown's
 * selected option is always this value, kept in step with `resolveDefaultSelection`.
 */
export function resolveDefaultDay(items: SlotItem[], nowMs: number): string | null {
  const days = conDays(items);
  if (!days.length) return null;
  const today = helsinkiDay(new Date(nowMs).toISOString());
  if (today && days.includes(today) && hasUnfinished(items, today, nowMs)) return today;
  const ahead = today ? days.find((d) => d > today && hasUnfinished(items, d, nowMs)) : undefined;
  return ahead ?? days.find((d) => hasUnfinished(items, d, nowMs)) ?? days[days.length - 1]!;
}

/**
 * A sensible `from` time for a given day (primer §6): `now` rounded down to the quarter
 * hour when the day is today (so a session about to start isn't excluded), otherwise that
 * day's earliest session so the window opens over the day's program.
 */
export function defaultFromTime(items: SlotItem[], day: string, nowMs: number): string {
  if (day === helsinkiDay(new Date(nowMs).toISOString())) {
    return wallClockParts(floorQuarter(nowMs)).time || "12:00";
  }
  const earliest = earliestStartMs(items, day);
  return earliest != null ? wallClockParts(earliest).time || "12:00" : "12:00";
}

/**
 * The initial, fully-resolved picker selection for a resolved `now` — the default day, a
 * `from` time consistent with it, and the default `+3h` quick option. When `now` falls
 * within the con it anchors on `now` (so the small hours resolve to the night being
 * attended); before the con it anchors on the first session; deriving the day and time
 * from a single anchor instant keeps them coherent.
 */
export function resolveDefaultSelection(items: SlotItem[], nowMs: number): SlotSelection {
  const day = resolveDefaultDay(items, nowMs);
  if (!day) return withQuickDefaults(wallClockParts(floorQuarter(nowMs)));
  const isToday = day === helsinkiDay(new Date(nowMs).toISOString());
  const anchor = isToday ? floorQuarter(nowMs) : (earliestStartMs(items, day) ?? nowMs);
  const parts = wallClockParts(anchor);
  return withQuickDefaults({ day: parts.day || day, time: parts.time || "12:00" });
}

function withQuickDefaults(parts: { day: string; time: string }): SlotSelection {
  return { fromDay: parts.day, fromTime: parts.time, quick: DEFAULT_QUICK, toDay: parts.day, toTime: parts.time };
}

/**
 * Resolve a selection to a concrete `[fromMs, toMs)` window. A `+Nh` option sets
 * `to = from + N hours`; a custom `to` earlier than `from` is clamped forward to a minimal
 * 1h window (an inverted window is never rendered — primer §6), and the corrected values
 * are returned so the UI can reflect them. `active` is false only when `from` (or a custom
 * `to`) fails to parse.
 */
export function resolveSlot(sel: SlotSelection): ResolvedSlot {
  const fromMs = helsinkiWallClockToMs(`${sel.fromDay}T${sel.fromTime}`);
  if (Number.isNaN(fromMs)) {
    return { fromMs, toMs: Number.NaN, active: false, corrected: false, toDay: sel.toDay, toTime: sel.toTime };
  }

  if (sel.quick !== "custom") {
    const toMs = fromMs + sel.quick * HOUR_MS;
    const { day, time } = wallClockParts(toMs);
    return { fromMs, toMs, active: true, corrected: false, toDay: day, toTime: time };
  }

  const customTo = helsinkiWallClockToMs(`${sel.toDay}T${sel.toTime}`);
  if (Number.isNaN(customTo)) {
    return { fromMs, toMs: customTo, active: false, corrected: false, toDay: sel.toDay, toTime: sel.toTime };
  }
  if (customTo <= fromMs) {
    const toMs = fromMs + HOUR_MS;
    const { day, time } = wallClockParts(toMs);
    return { fromMs, toMs, active: true, corrected: true, toDay: day, toTime: time };
  }
  return { fromMs, toMs: customTo, active: true, corrected: false, toDay: sel.toDay, toTime: sel.toTime };
}

/**
 * Reconstruct a picker selection from a shared `?from`/`?to` window so an incoming link
 * seeds the redesigned controls. An exact whole-hour gap maps back to the matching `+Nh`
 * option; anything else becomes a custom window.
 */
export function selectionFromWindow(fromMs: number, toMs: number): SlotSelection {
  const from = wallClockParts(fromMs);
  const to = wallClockParts(toMs);
  const gapHours = (toMs - fromMs) / HOUR_MS;
  const quick: QuickOption = QUICK_HOURS.find((h) => h === gapHours) ?? "custom";
  return { fromDay: from.day, fromTime: from.time, quick, toDay: to.day, toTime: to.time };
}
