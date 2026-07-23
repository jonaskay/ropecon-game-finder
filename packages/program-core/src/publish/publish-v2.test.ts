import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { projectResponse } from "../konsti/fetch.ts";
import { parseKompassiSchedule } from "../kompassi/schema.ts";
import { mergeProgramSources } from "../merge/merge.ts";
import { normaliseMerged } from "../normalise/normalise-merged.ts";
import { buildCombinedProgram } from "./publish-v2.ts";
import { toProgramDataV2, type ProgramDataV2Metadata } from "./program-data-v2.ts";
import { validateProgramDataV2 } from "./validate-program-data-v2.ts";

const schedule = parseKompassiSchedule(JSON.parse(
  readFileSync("../../fixtures/kompassi-sample.synthetic.json", "utf8"),
));
const projected = projectResponse(JSON.parse(
  readFileSync("../../fixtures/konsti-sample.synthetic.json", "utf8"),
));
const metadata: ProgramDataV2Metadata = {
  generatedAt: "2026-07-23T12:00:00.000Z",
  kompassi: {
    eventSlug: "synthetic-event",
    fetchedAt: "2026-07-23T11:59:58.000Z",
  },
  konsti: {
    fetchedAt: "2026-07-23T11:59:59.000Z",
  },
};

describe("toProgramDataV2", () => {
  it("builds the versioned combined-source envelope", () => {
    const merged = mergeProgramSources(schedule, projected);
    const data = toProgramDataV2(merged.items, metadata);

    expect(data).toMatchObject({
      schemaVersion: 2,
      generatedAt: metadata.generatedAt,
      source: "kompassi+konsti",
      sources: {
        kompassi: metadata.kompassi,
        konsti: metadata.konsti,
      },
    });
    expect(data.items).toEqual(normaliseMerged(merged.items));
    expect(data.items).toHaveLength(5);
    expect(validateProgramDataV2(data)).toBe(data);
  });
});

describe("buildCombinedProgram", () => {
  it("publishes clean matched and unmatched data with reconciliation diagnostics", () => {
    const outcome = buildCombinedProgram(schedule, projected, metadata);

    expect(outcome.ok).toBe(true);
    expect(outcome.hasHardFailure).toBe(false);
    expect(outcome.programData?.items).toHaveLength(5);
    expect(outcome.reconciliation).toMatchObject({
      kompassiGamingItems: 5,
      matchedItems: 2,
      unmatchedKompassiItems: 3,
      konstiOrphans: 6,
    });
    expect(outcome.findings.map(finding => finding.code)).toEqual([
      "MISSING_REGISTRATION",
      "KONSTI_ORPHANS",
    ]);
  });

  it("blocks a hard merge finding and returns no envelope", () => {
    const duplicate = structuredClone(schedule);
    duplicate.scheduleItems.push(structuredClone(duplicate.scheduleItems[0]!));
    const outcome = buildCombinedProgram(duplicate, projected, metadata);

    expect(outcome.ok).toBe(false);
    expect(outcome.hasHardFailure).toBe(true);
    expect(outcome.programData).toBeNull();
    expect(outcome.findings.some(finding => finding.code === "DUPLICATE_KOMPASSI_SLUG"))
      .toBe(true);
  });

  it("retains the existing Konsti structural audit as a hard gate", () => {
    const malformed = structuredClone(projected);
    delete (malformed[0]!.programItem as unknown as Record<string, unknown>).programType;
    const outcome = buildCombinedProgram(schedule, malformed, metadata);

    expect(outcome.ok).toBe(false);
    expect(outcome.programData).toBeNull();
    expect(outcome.findings.some(finding => finding.code === "SCHEMA_VIOLATION")).toBe(true);
  });

  it("runs the final serialized PII scan as a hard gate", () => {
    const unsafe = structuredClone(schedule);
    unsafe.scheduleItems[0]!.title = "Synthetic username marker";
    const outcome = buildCombinedProgram(unsafe, projected, metadata);

    expect(outcome.ok).toBe(false);
    expect(outcome.programData).toBeNull();
    expect(outcome.findings.some(finding => finding.code === "PRIVACY_LEAK")).toBe(true);
  });

  it("never serializes projected-away participant fields", () => {
    const outcome = buildCombinedProgram(schedule, projected, metadata);
    const serialized = JSON.stringify(outcome.programData);

    expect(serialized).not.toContain("username");
    expect(serialized).not.toContain("signupMessage");
    expect(serialized).not.toContain('"users"');
  });
});
