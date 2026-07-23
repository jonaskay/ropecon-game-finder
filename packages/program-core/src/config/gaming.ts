/**
 * Gaming classification config (primer §3 "Gaming classification").
 *
 * `programType` is the primary inclusion test: an item is shown by the finder only
 * if its `programType` is in GAMING_PROGRAM_TYPES. Every observed `programType` must
 * be covered by EITHER list; an uncovered value produces a `warn` (see audit/checks).
 *
 * MAINTENANCE: Values are filled from `bun run audit:report`. A warning from the live
 * check means: review the value, add it here (gaming vs non-gaming), then add an
 * example item carrying it to the synthetic fixture so the PR `check` goes green.
 *
 * Filled from the live report on 2026-07-21 (Ropecon 2026, 542 items). The six
 * observed programTypes were classified with the product owner:
 *   gaming:     tabletopRPG (426), larp (35), otherGaming (10), tournament (2)
 *   non-gaming: workshop (54), other (15)
 */

export const GAMING_PROGRAM_TYPES: readonly string[] = [
  "tabletopRPG",
  "larp",
  "otherGaming",
  "tournament",
];

export const NON_GAMING_PROGRAM_TYPES: readonly string[] = [
  "workshop",
  "other",
];

export function isGamingProgramType(programType: string): boolean {
  return GAMING_PROGRAM_TYPES.includes(programType);
}

/**
 * Kompassi `type` dimension values the finder treats as gaming. This is a
 * SEPARATE vocabulary from GAMING_PROGRAM_TYPES above: that list classifies
 * Konsti's `programType`, while Kompassi's `type` dimension is coarse. Per
 * docs/kompassi-api.md the observed siblings are `gaming`, `tournament`,
 * `workshop`, `presentation`, `panel`, `performance`, `dancing`, `meet`,
 * `other` — of which only `gaming` and `tournament` are gaming program (finer
 * distinctions like RPG vs boardgame live in the `topic` dimension). A
 * tournament carries `type: tournament` WITHOUT `gaming`, so testing for the
 * literal `"gaming"` alone silently drops every tournament.
 */
export const GAMING_TYPE_DIMENSION_VALUES: readonly string[] = [
  "gaming",
  "tournament",
];

export function isGamingTypeValue(typeValue: string): boolean {
  return GAMING_TYPE_DIMENSION_VALUES.includes(typeValue);
}
