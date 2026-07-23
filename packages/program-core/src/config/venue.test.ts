/**
 * Venue classifier test suite (issue-01). No network, no clock.
 *
 * The committed corpus `fixtures/venue-observed-locations.json` is every distinct
 * `location` value observed in the 2026 program.json, pre-split into on-site / off-site
 * by review. This suite asserts the classifier reproduces that split exactly (94/5/0)
 * and that new table/room/block numbers under a known venue keep classifying without a
 * config change — the whole point of the structural approach.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  CON_MAP_URLS,
  classifyVenue,
  classifyWithDiagnostic,
  resolveConMapLink,
} from "./venue.ts";

const CORPUS: { expectedCounts: Record<string, number>; onSite: string[]; offSite: string[] } =
  JSON.parse(readFileSync("../../fixtures/venue-observed-locations.json", "utf8"));

describe("classifyVenue — observed corpus split", () => {
  it("reproduces the reviewed 94 / 5 / 0 split across all distinct locations", () => {
    const all = [...CORPUS.onSite, ...CORPUS.offSite];
    const counts = { "on-site": 0, "off-site": 0, unknown: 0 };
    const unknowns: string[] = [];
    for (const loc of all) {
      const status = classifyVenue(loc).status;
      counts[status] += 1;
      if (status === "unknown") unknowns.push(loc);
    }

    expect(new Set(all).size).toBe(CORPUS.expectedCounts.distinct);
    expect(unknowns).toEqual([]);
    expect(counts).toEqual({
      "on-site": CORPUS.expectedCounts["on-site"],
      "off-site": CORPUS.expectedCounts["off-site"],
      unknown: CORPUS.expectedCounts.unknown,
    });
  });

  it("classifies every reviewed on-site value as on-site", () => {
    for (const loc of CORPUS.onSite) {
      expect(classifyVenue(loc).status, loc).toBe("on-site");
    }
  });

  it("classifies every reviewed off-site value as off-site", () => {
    for (const loc of CORPUS.offSite) {
      expect(classifyVenue(loc).status, loc).toBe("off-site");
    }
  });
});

describe("resolveConMapLink — link only for on-site, locale respected", () => {
  it("links on-site venues to the locale-correct con map", () => {
    expect(resolveConMapLink("Valo (Pöytä 3)", "fi")).toBe(CON_MAP_URLS.fi);
    expect(resolveConMapLink("Valo (Pöytä 3)", "en")).toBe(CON_MAP_URLS.en);
    expect(resolveConMapLink("Room 216", "en")).toBe(CON_MAP_URLS.en);
    // Default locale is fi.
    expect(resolveConMapLink("Hall 3c (Pöytä 1)")).toBe(CON_MAP_URLS.fi);
  });

  it("returns null (no con-map link) for off-site and unknown venues", () => {
    expect(resolveConMapLink("Amos Rex", "en")).toBeNull();
    expect(resolveConMapLink("Some New Bar", "en")).toBeNull();
    expect(resolveConMapLink("", "en")).toBeNull();
    expect(resolveConMapLink(null, "en")).toBeNull();
  });
});

describe("structural robustness — new numbers under a known venue stay on-site", () => {
  // Synthetic future values: none of these appear in the corpus, all must resolve
  // structurally without a config edit (acceptance criterion).
  it.each([
    ["Room 219", "room"],
    ["Valo (Pöytä 99)", "named-area"],
    ["Kajo (Pöytä 42)", "named-area"],
    ["Säde (Pöydät 12-14)", "named-area"],
    ["Hall 3z (Pöytä 1)", "hall"],
    ["Hall 5 Miniature Gaming (D9)", "hall"],
    ["Halli 4 Tournaments (lohko Z)", "hall"],
  ])("%s stays on-site", (loc, matchedBy) => {
    const r = classifyVenue(loc);
    expect(r.status).toBe("on-site");
    expect(r.matchedBy).toBe(matchedBy);
  });

  it("case- and whitespace-insensitive for named areas", () => {
    expect(classifyVenue("säde (pöytä 6)").status).toBe("on-site");
    expect(classifyVenue("  Valo   (Pöytä 3)  ").status).toBe("on-site");
  });
});

describe("unknown venues are surfaced, never guessed onto the map", () => {
  it("halls outside the Messukeskus 1–7 range are unknown, not silently linked", () => {
    expect(classifyVenue("Hall 8").status).toBe("unknown");
    expect(classifyVenue("Hall 70").status).toBe("unknown");
  });

  it("an unrecognised place name is unknown", () => {
    expect(classifyVenue("Some New Bar").status).toBe("unknown");
    expect(classifyVenue("Central Station").matchedBy).toBe("no-match");
  });

  it("classifyWithDiagnostic invokes the sink exactly for unknown venues", () => {
    const onUnknown = vi.fn();
    classifyWithDiagnostic("Valo (Pöytä 3)", onUnknown); // on-site
    classifyWithDiagnostic("Amos Rex", onUnknown); // off-site
    classifyWithDiagnostic("Some New Bar", onUnknown); // unknown
    classifyWithDiagnostic("", onUnknown); // empty → no sink (nothing to review)

    expect(onUnknown).toHaveBeenCalledTimes(1);
    expect(onUnknown).toHaveBeenCalledWith("Some New Bar", "Some New Bar");
  });
});
