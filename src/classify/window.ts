/**
 * Step 6 — time-window overlap + joinable-soon classification (primer §6).
 * Step 7 — `?now=` override resolution is folded in here (`resolveNow`).
 *
 * Pure and DOM-free so it is unit-testable AND reusable verbatim in the browser:
 * `src/pages/index.astro` imports these into its client `<script>` and drives them
 * off the already-prerendered DOM (no client-side fetch — the client contract holds).
 *
 * All instants are epoch milliseconds. Parse UTC/offset ISO strings with `Date.parse`;
 * never compare the ISO strings lexically or hand-roll offsets (primer §6, constraints).
 */

import type { CapacityStatus, SignupMode } from "../normalise/types.ts";

/** "starting within one hour" — the joinable-soon window length (primer §6). */
export const JOINABLE_WINDOW_MS = 60 * 60 * 1000;

/** The slice of a `ProgramItem` the classifier needs; a full `ProgramItem` satisfies it. */
export interface TimeWindowInput {
  start: string; // UTC ISO-8601
  end: string; // UTC ISO-8601
  isCancelled: boolean;
  isRevolvingDoor: boolean;
  signupMode: SignupMode;
  capacityStatus: CapacityStatus;
}

/** How an item relates to a requested `[fromMs, toMs)` window (primer §6). */
export type Overlap =
  | "startable" // official start is inside the window
  | "join-in-progress" // started before the window, still running, revolving-door
  | "in-progress-no-join" // started before the window, still running, not revolving-door
  | "none"; // does not overlap the window

/**
 * Overlap test + classification. Overlap is the primer's strict test
 * `start < to && end > from`; a candidate is then `startable` when its start falls
 * inside the window, otherwise it began earlier and is split by `isRevolvingDoor`.
 */
export function classifyOverlap(item: TimeWindowInput, fromMs: number, toMs: number): Overlap {
  const startMs = Date.parse(item.start);
  const endMs = Date.parse(item.end);
  if (!(startMs < toMs && endMs > fromMs)) return "none";
  if (startMs >= fromMs) return "startable";
  return item.isRevolvingDoor ? "join-in-progress" : "in-progress-no-join";
}

/** Why an overlapping item is nonetheless kept out of the actionable joinable-soon view. */
export type ExclusionReason = "no-overlap" | "in-progress-no-join" | "cancelled" | "konsti-full";

export interface JoinableResult {
  included: boolean; // shown in the default joinable-soon view
  overlap: Overlap;
  reason: ExclusionReason | null; // null iff included
}

/**
 * Apply the actionable exclusions to an arbitrary `[fromMs, toMs)` window.
 */
export function classifyInWindow(
  item: TimeWindowInput,
  fromMs: number,
  toMs: number,
): JoinableResult {
  const overlap = classifyOverlap(item, fromMs, toMs);
  if (overlap === "none") return { included: false, overlap, reason: "no-overlap" };
  if (overlap === "in-progress-no-join")
    return { included: false, overlap, reason: "in-progress-no-join" };
  if (item.isCancelled) return { included: false, overlap, reason: "cancelled" };
  if (item.signupMode === "konsti" && item.capacityStatus === "full")
    return { included: false, overlap, reason: "konsti-full" };
  return { included: true, overlap, reason: null };
}

/**
 * Joinable-soon default (primer §6): within `[now, now + 1h]`, include sessions that are
 * startable or joinable-in-progress, EXCEPT cancelled ones and online-Konsti sessions
 * known full. Physical-signup and unknown-capacity sessions stay visible (a guest may
 * still get a place at the desk / the count just isn't live). Already-started
 * non-revolving items are hidden by default.
 */
export function classifyJoinableSoon(item: TimeWindowInput, nowMs: number): JoinableResult {
  return classifyInWindow(item, nowMs, nowMs + JOINABLE_WINDOW_MS);
}

/**
 * "Open now (walk-ins)" default (primer §5.4/§5 step 8): ongoing games a guest can just
 * walk into — no signup requirement, not cancelled, and currently running (started, not
 * yet ended). Revolving-door status doesn't matter: with no signup there is no seat to
 * miss, so a walk-in is joinable for as long as it is running.
 */
export function isWalkInNow(item: TimeWindowInput, nowMs: number): boolean {
  if (item.signupMode !== "none" || item.isCancelled) return false;
  const startMs = Date.parse(item.start);
  const endMs = Date.parse(item.end);
  return startMs <= nowMs && nowMs < endMs;
}

export interface ResolvedNow {
  nowMs: number;
  overridden: boolean; // true when a valid `?now=` override was applied
}

/**
 * Resolve the current instant (primer §6/§7): a valid `?now=` override wins, otherwise
 * fall back to the device clock. The fallback is passed IN so this stays pure — the
 * impure `Date.now()` read lives at the browser edge.
 */
export function resolveNow(nowParam: string | null, fallbackMs: number): ResolvedNow {
  if (nowParam) {
    const parsed = Date.parse(nowParam);
    if (!Number.isNaN(parsed)) return { nowMs: parsed, overridden: true };
  }
  return { nowMs: fallbackMs, overridden: false };
}

export interface ResolvedWindow {
  fromMs: number;
  toMs: number;
  active: boolean;
}

/** Resolve a shareable window, clamping its start to now so the past is never joinable. */
export function resolveWindow(
  fromParam: string | null,
  toParam: string | null,
  nowMs: number,
): ResolvedWindow {
  const parsedFrom = fromParam ? Date.parse(fromParam) : Number.NaN;
  const parsedTo = toParam ? Date.parse(toParam) : Number.NaN;
  const fromMs = Math.max(Number.isNaN(parsedFrom) ? nowMs : parsedFrom, nowMs);
  const toMs = Number.isNaN(parsedTo) ? fromMs : parsedTo;
  return { fromMs, toMs, active: toMs > fromMs };
}
