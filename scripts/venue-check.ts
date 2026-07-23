/**
 * Venue-aware map-link check (issue-01, §7). Run with bun:
 *
 *   bun scripts/venue-check.ts path/to/program.json
 *   bun run venue:check -- path/to/program.json
 *
 * Impure edge tool for ops/CI: reads a published program.json, classifies every
 * distinct `location`, prints the on-site / off-site / unknown split, and exits
 * non-zero if ANY location is `unknown`. Unknown venues must be reviewed and added to
 * the on-site rules or the off-site allowlist in packages/program-core/src/config/venue.ts
 * — never guessed onto the hall map.
 *
 * The classifier itself is unit-tested against the reviewed corpus
 * (fixtures/venue-observed-locations.json). This harness is for asserting the split
 * against an arbitrary / live feed the committed corpus does not cover.
 */

import { readFileSync } from "node:fs";
import { classifyVenue, resolveConMapLink, type VenueStatus } from "@ropecon/program-core";

const path = process.argv[2];
if (!path) {
  console.error("usage: bun scripts/venue-check.ts path/to/program.json");
  process.exit(2);
}

const data = JSON.parse(readFileSync(path, "utf8")) as { items?: { location?: string }[] };
const locations = [...new Set((data.items ?? []).map((i) => i.location).filter((l): l is string => !!l))];

const counts: Record<VenueStatus, number> = { "on-site": 0, "off-site": 0, unknown: 0 };
const unknowns: string[] = [];
for (const location of locations) {
  const { status } = classifyVenue(location);
  counts[status] += 1;
  if (status === "unknown") unknowns.push(location);
}

console.log(`distinct locations: ${locations.length}`, counts);

// Spot-check a few real + synthetic-future values so the harness output is legible.
for (const t of ["Valo (Pöytä 99)", "Room 219", "Hall 3z (Pöytä 1)", "Amos Rex"]) {
  const r = classifyVenue(t);
  console.log(`  ${t}  ->  ${r.status} [${r.matchedBy}]  map(en)=${resolveConMapLink(t, "en")}`);
}

if (unknowns.length > 0) {
  console.error(`\nvenue:check FAILED — ${unknowns.length} unknown venue(s):`);
  for (const u of unknowns) console.error(`  - ${u}`);
  console.error(
    "\nReview each and either extend the on-site rules or add it to KNOWN_OFF_SITE_VENUES " +
      "in packages/program-core/src/config/venue.ts. Never guess an unknown venue onto the hall map.",
  );
  process.exit(1);
}

console.error("\nvenue:check OK — every location classified on-site or off-site.");
