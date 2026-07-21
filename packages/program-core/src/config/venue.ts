/**
 * Venue / convention-map config (primer §"UX decisions" #5, §5 step 8).
 *
 * Guest-facing session locations (`ProgramItem.location`, free-text hall names like
 * "Hall A") link to Ropecon's official convention map so the guest can judge travel
 * time. Konsti carries no per-location deep-link, so every location points at the one
 * official map; the location name stays the visible label.
 *
 * TODO(product): replace with the real interactive convention-map URL(s) before the
 * convention (device-language variants if bilingual copy is adopted — see the Step 8
 * bilingual decision). The placeholder below points at the public Ropecon site so the
 * link is never dead, but it is NOT the deep venue map yet.
 */

/** Ropecon's official convention map, English. Placeholder — see TODO(product) above. */
export const CONVENTION_MAP_URL_EN = "https://ropecon.fi/en/";

/** Resolve the convention-map URL for a location in the given language (EN-only for now). */
export function conventionMapUrl(_location: string): string {
  return CONVENTION_MAP_URL_EN;
}
