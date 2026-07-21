/**
 * Taxonomy config: known `signupStrategy` / `state` values (Tier 1) and the
 * warn-on-new snapshot for the Tier-2 categoricals (primer §3, plan §2).
 *
 * MAINTENANCE: Values are filled from `bun run audit:report`. A warning from the live
 * check means: review the value, add it in the appropriate list below, then add a
 * fixture example so the PR `check` goes green.
 *
 * Filled from the live report on 2026-07-21 (Ropecon 2026, 542 items). `gameSystem` is
 * deliberately NOT gated: it is free text (217 distinct values with many near-
 * duplicates for 542 items), so it is enumerated in the report only, not warned on.
 * `preConventionWeek` is load-bearing: `isPreConventionWeek` depends on that exact tag
 * string, so it must remain in KNOWN_TIER2_VALUES.tags.
 */

/** signupStrategy values we handle explicitly. A new one must not be silently treated as `direct`. */
export const KNOWN_SIGNUP_STRATEGIES: readonly string[] = [
  "lottery", // live-confirmed (450)
  "direct", // live-confirmed (92)
];

/** The state that means "cancelled" (drives `isCancelled`). */
export const CANCELLATION_STATE = "cancelled";

/** state values we handle explicitly. A new state must surface rather than be ignored. */
export const KNOWN_STATES: readonly string[] = [
  "accepted", // live-confirmed (539)
  "cancelled", // live-confirmed (3)
];

/** The exact tag `isPreConventionWeek` depends on; asserted present by the audit. */
export const PRE_CONVENTION_WEEK_TAG = "preConventionWeek";

/**
 * Tier-2 known-values snapshot. Each list is the set of distinct ELEMENTS reviewed so
 * far for that categorical. A distinct element not in its list produces a `warn`.
 * Filled from the 2026-07-21 live report. `genres` was empty in live data.
 * `gameSystem` is intentionally absent (free text — report only, no warn-on-new).
 */
export const KNOWN_TIER2_VALUES = {
  tags: ["beginnerFriendly", "theme", "lgbt", PRE_CONVENTION_WEEK_TAG, "usesGenAi"] as readonly string[],
  genres: [] as readonly string[], // none observed in live data
  styles: [
    "rulesLight",
    "storyDriven",
    "characterDriven",
    "light",
    "serious",
    "combatHeavy",
    "rulesHeavy",
  ] as readonly string[],
  languages: ["finnish", "english", "languageFree", "swedish"] as readonly string[],
  ageGroups: [
    "adultsAndYouth",
    "adults",
    "everyone",
    "onlyAdults",
    "kids",
    "youngAdults",
    "families",
    "teens",
    "smallKids",
  ] as readonly string[],
  accessibilityValues: [
    "noRecordingsOrSpokenText",
    "longProgram",
    "noMovement",
    "notAmplified",
    "physicalContact",
    "fingers",
    "longTexts",
    "noTextOfRecording",
    "loudSounds",
    "darkLighting",
    "lotsOfMovement",
    "quickReactions",
    "colorBlindness",
    "irritatingChemicals",
    "noSubtitles",
    "flashingLights",
    "strongOdours",
  ] as readonly string[],
} as const;

/** The array-typed Tier-2 categoricals (enumerate distinct elements, not distinct arrays). */
export const TIER2_ARRAY_FIELDS = [
  "tags",
  "genres",
  "styles",
  "languages",
  "ageGroups",
  "accessibilityValues",
] as const;
export type Tier2ArrayField = (typeof TIER2_ARRAY_FIELDS)[number];
