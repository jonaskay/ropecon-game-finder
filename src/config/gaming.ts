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
