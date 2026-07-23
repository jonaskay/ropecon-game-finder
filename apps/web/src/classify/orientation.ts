/**
 * Orienting empty state for the joinable-soon default (primer §6 "Empty joinable-soon
 * state", UX decision #2).
 *
 * The default view is legitimately empty during pre-convention week and early in each
 * day. Rather than a bare "no results", we orient the guest: when does the main
 * convention run, what's on later today, and where's the next thing to do. This module
 * derives that model from the data alone — con-day span and dates are NEVER hardcoded.
 *
 * Pure and DOM-free so it is unit-testable AND reusable verbatim in the browser
 * (`src/pages/index.astro` imports it into the client `<script>`). Instants are epoch
 * milliseconds; the con day is the Europe/Helsinki calendar day (`helsinkiDay`), matching
 * how the normaliser buckets every item.
 */

import { helsinkiDay } from "@ropecon/program-core";

/** The slice of a `ProgramItem` the orientation needs; a full `ProgramItem` satisfies it. */
export interface OrientationItem {
  day: string; // Europe/Helsinki calendar day (YYYY-MM-DD)
  start: string; // UTC ISO-8601
  isPreConventionWeek: boolean;
  isCancelled: boolean;
}

/** A calendar day with an upcoming-session count, used for the "next active day" affordance. */
export interface DaySummary {
  day: string; // YYYY-MM-DD (Europe/Helsinki)
  count: number; // upcoming, non-cancelled sessions on that day
  firstStartMs: number; // earliest upcoming start on that day
}

export interface OrientationModel {
  /** Resolved Europe/Helsinki calendar day of `now`, or null if `now` is unparseable. */
  today: string | null;
  /** Main-convention span (items where `isPreConventionWeek === false`), or null. */
  mainConSpan: { firstDay: string; lastDay: string } | null;
  /** Distinct pre-convention-week days present in the data, ascending. */
  preConDays: string[];
  /** True when `now` precedes the first main-convention day (pre-convention week). */
  isPreConvention: boolean;
  /** Upcoming, non-cancelled sessions on today's con day. */
  laterToday: { count: number; nextStartMs: number | null };
  /** Earliest calendar day strictly after today that still has an upcoming session. */
  nextActiveDay: DaySummary | null;
}

const distinctDays = (items: OrientationItem[]): string[] =>
  [...new Set(items.map((i) => i.day).filter(Boolean))].sort();

/**
 * Build the orientation model for a resolved `now`. Everything is derived from the data
 * span: the main-con span from non-pre-con items, "later today" and "next active day"
 * from the sessions still ahead of `now`.
 */
export function buildOrientation(items: OrientationItem[], nowMs: number): OrientationModel {
  const today = helsinkiDay(new Date(nowMs).toISOString());

  const mainDays = distinctDays(items.filter((i) => !i.isPreConventionWeek));
  const mainConSpan = mainDays.length
    ? { firstDay: mainDays[0]!, lastDay: mainDays[mainDays.length - 1]! }
    : null;
  const preConDays = distinctDays(items.filter((i) => i.isPreConventionWeek));

  const isPreConvention =
    mainConSpan != null && today != null && today < mainConSpan.firstDay;

  // Sessions still ahead of now (their doors haven't opened) and not cancelled.
  const upcoming = items.filter((i) => !i.isCancelled && Date.parse(i.start) > nowMs);

  const laterTodayStarts = upcoming
    .filter((i) => i.day === today)
    .map((i) => Date.parse(i.start));
  const laterToday = {
    count: laterTodayStarts.length,
    nextStartMs: laterTodayStarts.length ? Math.min(...laterTodayStarts) : null,
  };

  // The next calendar day (strictly after today) that still has something to do.
  const nextDay = distinctDays(upcoming.filter((i) => today == null || i.day > today))[0] ?? null;
  const nextDayStarts = nextDay
    ? upcoming.filter((i) => i.day === nextDay).map((i) => Date.parse(i.start))
    : [];
  const nextActiveDay = nextDay
    ? { day: nextDay, count: nextDayStarts.length, firstStartMs: Math.min(...nextDayStarts) }
    : null;

  return { today, mainConSpan, preConDays, isPreConvention, laterToday, nextActiveDay };
}
