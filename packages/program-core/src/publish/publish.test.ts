/**
 * Publication gate test suite (handoff Step 4). No network, no real PII.
 *
 * Runs against the curated synthetic fixture (the same baseline the audit is green on),
 * plus inline items for the hard-failure branch. `generatedAt` is always supplied by the
 * test (the core reads no clock), so every assertion is deterministic.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { projectResponse } from "../konsti/fetch.ts";
import type { KonstiProgramItem, ProjectedItem } from "../konsti/schema.ts";
import { scanForPii } from "../audit/checks.ts";
import { normalise } from "../normalise/normalise.ts";
import { toProgramData } from "./program-data.ts";
import { buildProgram } from "./publish.ts";

const FIXTURE_PATH = "../../fixtures/konsti-sample.synthetic.json";
const fixtureItems = projectResponse(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")));
const STAMP = "2026-07-21T09:30:00.000Z";

function gamingItem(overrides: Partial<KonstiProgramItem> = {}, userCount = 0): ProjectedItem {
  const programItem: KonstiProgramItem = {
    programItemId: "inline-1",
    parentId: "inline-1",
    title: "Inline Test",
    description: "",
    location: "",
    startTime: "2026-07-24T12:00:00Z",
    mins: 60,
    tags: [],
    ageGroups: [],
    genres: [],
    styles: [],
    languages: [],
    endTime: "2026-07-24T13:00:00Z",
    people: "",
    minAttendance: 0,
    maxAttendance: 10,
    gameSystem: "",
    popularity: "",
    shortDescription: "",
    revolvingDoor: false,
    programType: "tabletopRPG",
    contentWarnings: "",
    otherAuthor: "",
    accessibilityValues: [],
    otherAccessibilityInformation: "",
    entryFee: "",
    signupType: "konsti",
    state: "accepted",
    signupStrategy: "direct",
    ...overrides,
  };
  return { programItem, userCount };
}

describe("toProgramData envelope (primer §5.3)", () => {
  const data = toProgramData(fixtureItems, STAMP);

  it("stamps the supplied generatedAt and marks the source konsti", () => {
    expect(data.source).toBe("konsti");
    expect(data.generatedAt).toBe(STAMP);
  });

  it("items equal the pure normaliser output (gaming-only)", () => {
    expect(data.items).toEqual(normalise(fixtureItems));
    expect(data.items.every((i) => i.isGaming)).toBe(true);
  });
});

describe("buildProgram gate (handoff Step 4; run.ts contract)", () => {
  it("publishes on clean data: ok, envelope present, source konsti", () => {
    const { ok, programData, hasHardFailure } = buildProgram(fixtureItems, STAMP);
    expect(ok).toBe(true);
    expect(hasHardFailure).toBe(false);
    expect(programData).not.toBeNull();
    expect(programData!.source).toBe("konsti");
    expect(programData!.generatedAt).toBe(STAMP);
    expect(programData!.items).toEqual(normalise(fixtureItems));
  });

  it("a hard failure yields no write and preserves last-good (no envelope)", () => {
    // A non-UTC startTime is a NON_UTC_TIMESTAMP hard finding — must not publish.
    const items = [gamingItem({ startTime: "2026-07-24T12:00:00" })];
    const { ok, programData, hasHardFailure, findings } = buildProgram(items, STAMP);
    expect(ok).toBe(false);
    expect(hasHardFailure).toBe(true);
    expect(programData).toBeNull();
    expect(findings.some((f) => f.severity === "hard")).toBe(true);
  });

  it("a warning never blocks the write", () => {
    // An unknown genre is only a NEW_TIER2_VALUE warn; the item still publishes.
    const items = [gamingItem({ genres: ["totally-new-genre"] })];
    const { ok, findings } = buildProgram(items, STAMP);
    expect(ok).toBe(true);
    expect(findings.some((f) => f.severity === "warn")).toBe(true);
    expect(findings.every((f) => f.severity !== "hard")).toBe(true);
  });
});

describe("privacy (primer §3 'Privacy boundary')", () => {
  it("serialized ProgramData passes scanForPii", () => {
    const { programData } = buildProgram(fixtureItems, STAMP);
    expect(scanForPii(JSON.stringify(programData), "program.json")).toEqual([]);
  });
});
