import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { projectResponse } from "../konsti/fetch.ts";
import { parseKompassiSchedule, type KompassiSchedule } from "../kompassi/schema.ts";
import { mergeProgramSources } from "./merge.ts";

const kompassiFixture = JSON.parse(
  readFileSync("../../fixtures/kompassi-sample.synthetic.json", "utf8"),
);
const konstiFixture = JSON.parse(
  readFileSync("../../fixtures/konsti-sample.synthetic.json", "utf8"),
);

const schedule = parseKompassiSchedule(kompassiFixture);
const projected = projectResponse(konstiFixture);
const codes = (findings: { code: string }[]) => findings.map(finding => finding.code);

function cloneSchedule(): KompassiSchedule {
  return structuredClone(schedule);
}

describe("mergeProgramSources", () => {
  it("uses Kompassi gaming as the left-hand inventory and exact slug/ID matches", () => {
    const result = mergeProgramSources(schedule, projected);

    expect(result.items.map(item => item.scheduleItem.slug)).toEqual([
      "pi-001",
      "pi-002",
      "kompassi-only-walk-in",
      "kompassi-only-konsti",
      "minimum-documented-item",
    ]);
    expect(result.items.filter(item => item.konsti !== null)).toHaveLength(2);
    expect(result.report).toMatchObject({
      kompassiItems: 5,
      kompassiGamingItems: 5,
      konstiItems: 8,
      matchedItems: 2,
      unmatchedKompassiItems: 3,
      konstiOrphans: 6,
      registrations: {
        matched: { konsti: 1, ropelarp: 1 },
        unmatched: { "not-required": 1, konsti: 1, missing: 1 },
      },
      conflicts: {
        title: 0,
        startTime: 0,
        location: 0,
        cancellation: 0,
        signupType: 0,
      },
    });
    expect(result.hasHardFailure).toBe(false);
    expect(codes(result.findings)).toEqual(["MISSING_REGISTRATION", "KONSTI_ORPHANS"]);
  });

  it("does not publish Konsti orphans as a second inventory", () => {
    const result = mergeProgramSources(schedule, projected);
    expect(result.report.konstiOrphans).toBe(6);
    expect(result.items).toHaveLength(5);
    expect(result.items.some(item => item.scheduleItem.slug === "pi-004")).toBe(false);
  });

  it("includes gaming-sibling types like tournaments and excludes non-gaming types", () => {
    const changed = cloneSchedule();
    const tournament = structuredClone(changed.scheduleItems[0]!);
    tournament.slug = "catan-tournament";
    tournament.program.slug = "catan-tournament";
    tournament.cachedDimensions.type = ["tournament"];
    const workshop = structuredClone(changed.scheduleItems[0]!);
    workshop.slug = "beginners-workshop";
    workshop.program.slug = "beginners-workshop";
    workshop.cachedDimensions.type = ["workshop"];
    changed.scheduleItems.push(tournament, workshop);

    const result = mergeProgramSources(changed, projected);
    const slugs = result.items.map(item => item.scheduleItem.slug);
    expect(slugs).toContain("catan-tournament");
    expect(slugs).not.toContain("beginners-workshop");
    expect(result.report.kompassiGamingItems).toBe(6);
    expect(result.hasHardFailure).toBe(false);
  });

  it("reports aggregate material conflicts while retaining the match", () => {
    const conflicting = structuredClone(projected);
    const item = conflicting.find(entry => entry.programItem.programItemId === "pi-001")!;
    item.programItem.title = "Wrong title";
    item.programItem.startTime = "2026-07-24T13:00:00Z";
    item.programItem.location = "Wrong room";
    item.programItem.state = "cancelled";
    item.programItem.signupType = "ropelarp";

    const result = mergeProgramSources(schedule, conflicting);
    expect(result.report.conflicts).toEqual({
      title: 1,
      startTime: 1,
      location: 1,
      cancellation: 1,
      signupType: 1,
    });
    expect(result.findings.filter(finding => finding.code === "MERGE_FIELD_CONFLICT"))
      .toHaveLength(5);
    expect(result.hasHardFailure).toBe(false);
  });

  it("hard-fails duplicate identities in either source", () => {
    const duplicateSchedule = cloneSchedule();
    duplicateSchedule.scheduleItems.push(structuredClone(duplicateSchedule.scheduleItems[0]!));
    const kompassiResult = mergeProgramSources(duplicateSchedule, projected);
    expect(codes(kompassiResult.findings)).toContain("DUPLICATE_KOMPASSI_SLUG");
    expect(kompassiResult.hasHardFailure).toBe(true);

    const duplicateKonsti = [...projected, structuredClone(projected[0]!)];
    const konstiResult = mergeProgramSources(schedule, duplicateKonsti);
    expect(codes(konstiResult.findings)).toContain("DUPLICATE_KONSTI_ID");
    expect(konstiResult.hasHardFailure).toBe(true);
  });

  it("hard-fails an implausible zero-match reconciliation", () => {
    const orphanOnly = projected.map((item, index) => ({
      ...structuredClone(item),
      programItem: {
        ...structuredClone(item.programItem),
        programItemId: `orphan-${index}`,
      },
    }));
    const result = mergeProgramSources(schedule, orphanOnly);

    expect(result.report.matchedItems).toBe(0);
    expect(codes(result.findings)).toContain("ZERO_MATCHES");
    expect(result.hasHardFailure).toBe(true);
  });

  it("audits invalid times and unknown or contradictory registration values", () => {
    const changed = cloneSchedule();
    changed.scheduleItems[0]!.endTime = changed.scheduleItems[0]!.startTime;
    changed.scheduleItems[0]!.cachedDimensions.registration = ["konsti", "ropelarp"];
    changed.scheduleItems[1]!.cachedDimensions.registration = ["gamepoint"];
    changed.scheduleItems[1]!.cachedDimensions["future-dimension"] = ["value"];

    const result = mergeProgramSources(changed, projected);
    expect(codes(result.findings)).toEqual(expect.arrayContaining([
      "INVALID_KOMPASSI_TIME",
      "UNKNOWN_KOMPASSI_DIMENSION",
      "UNKNOWN_REGISTRATION_VALUE",
      "CONTRADICTORY_REGISTRATION",
    ]));
    expect(result.hasHardFailure).toBe(true);
  });

  it("contains no participant arrays or PII fields", () => {
    const serialized = JSON.stringify(mergeProgramSources(schedule, projected));
    expect(serialized).not.toContain("username");
    expect(serialized).not.toContain("signupMessage");
    expect(serialized).not.toContain('"users"');
  });
});
