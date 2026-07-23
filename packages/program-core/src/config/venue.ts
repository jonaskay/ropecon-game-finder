/**
 * Venue-aware map links (issue-01; primer §7 "Map links (venue-aware)", §5 step 8,
 * UX decision #6).
 *
 * Classifies a program feed `location` string as one of:
 *   - "on-site"  → physically at Messukeskus; attach the con-map link
 *   - "off-site" → a known external venue (museum, park, library, etc.); no con-map link
 *   - "unknown"  → does not match any rule; render plain AND emit a diagnostic so a
 *                  human reviews it. We never guess a map link for an unknown venue.
 *
 * Design note (why regex, not a hardcoded string list):
 *   On-site venues are STRUCTURAL — expo halls ("Hall 3c", "Halli 4 Tournaments",
 *   "Hall 5 Miniature Gaming (C5)") and numbered wing rooms ("Room 216"). These grow
 *   over time: new table numbers, new block codes, new rooms. Matching the structural
 *   prefix means "Valo (Pöytä 99)" or "Room 219" keep working with no config change.
 *
 *   The only on-site venues with NO structural signal are the Hall 3 role-playing table
 *   areas — Kajo, Säde, Valo. Nothing about the string "Valo" distinguishes it from an
 *   off-site place name, so those three (and only those) are enumerated in
 *   NAMED_ON_SITE_AREAS. Keep that list short and reviewed.
 *
 *   Off-site venues are arbitrary place names with no shared pattern, so they are a
 *   small explicit allowlist too. Anything matching neither side is "unknown" by
 *   design — that is the signal that a new venue needs review, per the issue's
 *   acceptance criteria.
 *
 * Verified against program.json (2026 feed): 94 on-site / 5 off-site / 0 unknown.
 */

export type VenueStatus = "on-site" | "off-site" | "unknown";

export type Locale = "fi" | "en";

export interface VenueClassification {
  status: VenueStatus;
  /** Which rule decided it — useful in logs/diagnostics. */
  matchedBy: string;
  /** Normalized form the rules were tested against. */
  normalized: string;
}

/* ------------------------------------------------------------------ config -- */

/** Con-map URLs by device/content locale (primer §7). */
export const CON_MAP_URLS: Record<Locale, string> = {
  fi: "https://ropecon.fi/kavijoille/kartta/",
  en: "https://ropecon.fi/en/for-visitors/map/",
};

/**
 * Hall 3 role-playing table areas. On-site but structurally indistinguishable from
 * place names, so they must be listed. Review before adding — this is the one place
 * a genuine name lives.
 */
export const NAMED_ON_SITE_AREAS: readonly string[] = ["Kajo", "Säde", "Valo"];

/**
 * Known external venues. Listed so they render cleanly (no con-map link) WITHOUT
 * tripping the unknown-venue diagnostic. Add new confirmed off-site venues here.
 */
export const KNOWN_OFF_SITE_VENUES: readonly string[] = [
  "Amos Rex",
  "Arndt Pekurinen Park",
  "Pasila Library",
  "Peace Station Cabinet",
  "Game Room in West Pasila",
];

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * On-site structural rules, tested in order against the normalized location.
 *
 *  - hall: "Hall" or Finnish "Halli", a space, then an expo-hall number 1–7,
 *          optionally followed by a sub-letter with no space ("Hall 3c") or more
 *          text ("Hall 5 Miniature Gaming (C5)", "Halli 4 Tournaments (lohko H)").
 *          The (?![0-9]) stops the hall number from being the start of a longer
 *          number, keeping matches inside the real 1–7 range.
 *  - room: "Room" + a number ("Room 211" … any wing room).
 *  - named-area: the enumerated Hall 3 RPG areas, matched as a prefix so any
 *          "(Pöytä N)" / "(Pöydät …)" suffix is irrelevant.
 */
const ON_SITE_RULES: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "hall", re: /^Hall[i]?\s+[1-7](?![0-9])/iu },
  { name: "room", re: /^Room\s+\d+/iu },
  {
    name: "named-area",
    re: new RegExp("^(?:" + NAMED_ON_SITE_AREAS.map(escapeRegExp).join("|") + ")(?=$|[\\s(])", "iu"),
  },
];

const OFF_SITE_LOOKUP: ReadonlySet<string> = new Set(
  KNOWN_OFF_SITE_VENUES.map((v) => normalizeLocation(v).toLowerCase()),
);

/* --------------------------------------------------------------- functions -- */

/** Trim, NFC-normalize (so "Säde" compares reliably), and collapse inner whitespace. */
export function normalizeLocation(location: string): string {
  return location.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Full classification with the reason it was decided. */
export function classifyVenue(location: string | null | undefined): VenueClassification {
  const normalized = location ? normalizeLocation(location) : "";
  if (!normalized) return { status: "unknown", matchedBy: "empty", normalized };

  for (const rule of ON_SITE_RULES) {
    if (rule.re.test(normalized)) return { status: "on-site", matchedBy: rule.name, normalized };
  }
  if (OFF_SITE_LOOKUP.has(normalized.toLowerCase())) {
    return { status: "off-site", matchedBy: "known-off-site", normalized };
  }
  return { status: "unknown", matchedBy: "no-match", normalized };
}

/** Convenience boolean. */
export function isOnSite(location: string | null | undefined): boolean {
  return classifyVenue(location).status === "on-site";
}

/**
 * Resolve the con-map link for a location, or null if none should be shown.
 * Off-site and unknown venues both return null (unknown additionally warrants a
 * diagnostic — see classifyWithDiagnostic / your logging layer).
 */
export function resolveConMapLink(
  location: string | null | undefined,
  locale: Locale = "fi",
): string | null {
  return isOnSite(location) ? CON_MAP_URLS[locale] ?? CON_MAP_URLS.fi : null;
}

/**
 * Optional helper for the pipeline: classify and route unknowns to a diagnostic sink
 * (CI / Cloud Run Job log) instead of silently mislinking them.
 */
export function classifyWithDiagnostic(
  location: string | null | undefined,
  onUnknown: (location: string, normalized: string) => void,
): VenueClassification {
  const result = classifyVenue(location);
  if (result.status === "unknown" && location) onUnknown(location, result.normalized);
  return result;
}
