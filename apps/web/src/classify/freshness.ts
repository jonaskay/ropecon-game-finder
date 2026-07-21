/**
 * Step 9 — snapshot freshness classification (primer §5 step 9 / §"Freshness warning").
 *
 * The header already shows a static "program as of HH:MM" stamp built from `generatedAt`.
 * This adds the *staleness* half: how old the baked snapshot is relative to "now", so the
 * page can warn near the action-oriented signup/capacity UI that availability or
 * cancellation may have moved on since the snapshot was taken.
 *
 * Age depends on the viewer's clock (and the `?now=` override), so like the time-window
 * classifier this is a *runtime* concern. Kept pure and DOM-free — epoch milliseconds in —
 * so it is unit-tested here AND reused verbatim by the client `<script>` in `index.astro`,
 * driven off the same resolved `nowMs` (so a `?now=` far past the stamp shows stale).
 */

/** A snapshot older than this is flagged stale near the action UI (primer §5 step 9: 15 min). */
export const STALE_THRESHOLD_MS = 15 * 60 * 1000;

export interface Freshness {
  ageMs: number; // clamped at 0 — a snapshot from the future reads as fresh, never negative
  ageMinutes: number; // whole minutes, for display
  isStale: boolean; // strictly older than STALE_THRESHOLD_MS
}

/**
 * Classify how stale the baked snapshot is at `nowMs`. `generatedAtMs` is the envelope's
 * `generatedAt` (a successful atomic Konsti projection, primer §"Freshness and failure").
 * A snapshot stamped after "now" (clock skew / a `?now=` in the past) clamps to age 0
 * rather than reporting a negative age.
 */
export function classifyFreshness(generatedAtMs: number, nowMs: number): Freshness {
  const ageMs = Math.max(0, nowMs - generatedAtMs);
  return {
    ageMs,
    ageMinutes: Math.floor(ageMs / 60_000),
    isStale: ageMs > STALE_THRESHOLD_MS,
  };
}
