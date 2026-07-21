/**
 * Audit test suite (plan §8). No network, no real PII.
 *
 * The committed fixture is the CURATED, fully-reviewed baseline — running the audit
 * against it must produce ZERO findings (the PR regression guard, plan §5.2). The
 * warn/hard paths (plan §7's "novel value") are exercised with items constructed
 * inline here, so the committed fixture stays green while every branch is still
 * covered. See PLAN-CONFLICT note in the repo summary.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { projectResponse, projectEntry } from "../konsti/fetch.ts";
import type { KonstiProgramItem, ProjectedItem } from "../konsti/schema.ts";
import { enumerate } from "./enumerate.ts";
import { check, scanForPii, DEFAULT_CONFIG, type AuditConfig } from "./checks.ts";
import { renderReport } from "./report.ts";
import { runAudit } from "./run.ts";

const FIXTURE_PATH = "fixtures/konsti-sample.synthetic.json";
const fixtureRaw = readFileSync(FIXTURE_PATH, "utf8");
const fixtureItems = projectResponse(JSON.parse(fixtureRaw));

const codes = (findings: { code: string }[]) => findings.map((f) => f.code);

function baseItem(overrides: Partial<KonstiProgramItem> = {}, userCount = 0): ProjectedItem {
  const programItem: KonstiProgramItem = {
    programItemId: "test-1",
    parentId: "",
    title: "Test Item",
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

/** Config that matches exactly one inline item, so only the tested check can fire. */
function tightConfig(over: Partial<AuditConfig> = {}): AuditConfig {
  return {
    gamingProgramTypes: ["tabletopRPG"],
    nonGamingProgramTypes: [],
    physicalSignupTypes: {},
    nonPhysicalSignupTypes: ["notRequired", "konsti"],
    knownSignupStrategies: ["direct"],
    knownStates: ["accepted"],
    knownTier2Values: {
      tags: ["preConventionWeek"],
      genres: [],
      styles: [],
      languages: [],
      ageGroups: [],
      accessibilityValues: [],
    },
    preConventionWeekTag: "preConventionWeek",
    ...over,
  };
}

// A single "all-known" item so tightConfig produces no stale/missing-tag noise.
const cleanInline = baseItem({ tags: ["preConventionWeek"] });

describe("privacy (plan §6)", () => {
  it("the raw fixture contains synthetic PII keys (sanity)", () => {
    expect(fixtureRaw).toContain("username");
    expect(fixtureRaw).toContain("signupMessage");
  });

  it("projection drops users[] and keeps a count", () => {
    const entry = { programItem: baseItem().programItem, users: [{ username: "x", signupMessage: "y" }] };
    const projected = projectEntry(entry);
    expect(projected.userCount).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(projected, "users")).toBe(false);
    expect(JSON.stringify(projected)).not.toContain("username");
    expect(JSON.stringify(projected)).not.toContain("signupMessage");
  });

  it("enumeration and report carry no PII even though the fixture has users", () => {
    const enumeration = enumerate(fixtureItems);
    const report = renderReport(enumeration, check(enumeration));
    for (const blob of [JSON.stringify(enumeration), report]) {
      expect(blob).not.toContain("username");
      expect(blob).not.toContain("signupMessage");
    }
  });

  it("scanForPii flags a planted key as hard", () => {
    const findings = scanForPii('{"username":"leaked"}', "test");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("hard");
    expect(findings[0].code).toBe("PRIVACY_LEAK");
  });
});

describe("curated fixture is green (plan §5.2)", () => {
  it("produces zero findings and no hard failure", () => {
    const { findings, hasHardFailure } = runAudit(fixtureItems);
    expect(hasHardFailure).toBe(false);
    expect(findings).toEqual([]);
  });
});

describe("enumeration correctness (plan §8)", () => {
  const e = enumerate(fixtureItems);

  it("counts distinct scalar values", () => {
    const pt = Object.fromEntries(e.programType.map((v) => [v.value, v.count]));
    expect(pt).toEqual({
      tabletopRPG: 2,
      larp: 1,
      workshop: 1,
      otherGaming: 1,
      other: 1,
      tournament: 1,
    });
  });

  it("flattens array categoricals into distinct elements", () => {
    const tags = Object.fromEntries(e.tags.map((v) => [v.value, v.count]));
    expect(tags).toEqual({ beginnerFriendly: 2, theme: 4, lgbt: 1, preConventionWeek: 1, usesGenAi: 1 });
  });

  it("attaches example titles", () => {
    const larp = e.programType.find((v) => v.value === "larp");
    expect(larp?.examples[0]).toContain("Masquerade");
  });

  it("computes distinct days in Europe/Helsinki", () => {
    const days = Object.fromEntries(e.days.map((v) => [v.value, v.count]));
    expect(days).toEqual({ "2026-07-24": 2, "2026-07-25": 3, "2026-07-26": 1, "2026-07-20": 1 });
  });

  it("records programItemId uniqueness and parentId grouping facts (self-parenting is normal)", () => {
    expect(e.structural.distinctProgramItemIds).toBe(7);
    expect(e.structural.duplicateProgramItemIds).toEqual([]);
    expect(e.structural.parentGroups).toEqual({
      emptyParentIdCount: 0,
      selfParentCount: 5,
      groupCount: 6,
      singletonGroupCount: 5,
      largestGroupSize: 2,
    });
  });

  it("computes capacity facts (diagnostics only)", () => {
    expect(e.structural.capacity).toEqual({
      konstiItemCount: 4,
      nonPositiveMaxAttendance: 1,
      overbooked: 1,
    });
  });

  it("detects the preConventionWeek tag", () => {
    expect(e.structural.preConventionWeekPresent).toBe(true);
  });
});

describe("Tier-1 checks (plan §2, §4)", () => {
  it("warns on an unreviewed programType, and not on a known one", () => {
    const novel = check(enumerate([baseItem({ programType: "boardGame" })]), tightConfig());
    const f = novel.find((x) => x.code === "UNREVIEWED_PROGRAM_TYPE");
    expect(f?.severity).toBe("warn");
    expect(f?.message).toContain("src/config/gaming.ts");

    const known = check(enumerate([cleanInline]), tightConfig());
    expect(codes(known)).not.toContain("UNREVIEWED_PROGRAM_TYPE");
  });

  it("warns on an unmapped physical signupType, and not on a mapped one", () => {
    const unmapped = check(enumerate([baseItem({ signupType: "infoDesk" })]), tightConfig());
    const f = unmapped.find((x) => x.code === "UNMAPPED_SIGNUP_TYPE");
    expect(f?.severity).toBe("warn");
    expect(f?.message).toContain("src/config/signup.ts");

    const mapped = check(
      enumerate([baseItem({ signupType: "gameDesk" })]),
      tightConfig({ physicalSignupTypes: { gameDesk: { id: "gameDesk", labelFi: "", labelEn: "" } } }),
    );
    expect(codes(mapped)).not.toContain("UNMAPPED_SIGNUP_TYPE");
  });

  it("warns on a new signupStrategy", () => {
    const f = check(enumerate([baseItem({ signupStrategy: "waitlist" })]), tightConfig());
    expect(f.find((x) => x.code === "NEW_SIGNUP_STRATEGY")?.severity).toBe("warn");
  });

  it("warns on a new state", () => {
    const f = check(enumerate([baseItem({ state: "pending" })]), tightConfig());
    expect(f.find((x) => x.code === "NEW_STATE")?.severity).toBe("warn");
  });

  it("warns when a configured value is no longer observed (stale)", () => {
    const f = check(enumerate([cleanInline]), tightConfig({ knownStates: ["accepted", "cancelled"] }));
    const stale = f.find((x) => x.code === "STALE_STATE");
    expect(stale?.severity).toBe("warn");
    expect(stale?.detail).toMatchObject({ value: "cancelled" });
  });
});

describe("Tier-2 warn-on-new (plan §2)", () => {
  it("warns on a new array element", () => {
    const f = check(enumerate([baseItem({ tags: ["preConventionWeek", "outdoors"] })]), tightConfig());
    const nv = f.find((x) => x.code === "NEW_TIER2_VALUE");
    expect(nv?.severity).toBe("warn");
    expect(nv?.detail).toMatchObject({ field: "tags", value: "outdoors" });
  });

  it("does NOT gate gameSystem (free text, report only)", () => {
    const f = check(enumerate([baseItem({ gameSystem: "Some Brand New System 9000" })]), tightConfig());
    expect(codes(f)).not.toContain("NEW_GAME_SYSTEM");
  });

  it("warns when the preConventionWeek tag is absent", () => {
    const f = check(enumerate([baseItem({ tags: [] })]), tightConfig());
    expect(f.find((x) => x.code === "MISSING_PRE_CONVENTION_WEEK_TAG")?.severity).toBe("warn");
  });
});

describe("Tier-3 structural / integrity is hard (plan §4)", () => {
  it("missing required field → hard", () => {
    const item = baseItem({ tags: ["preConventionWeek"] });
    delete (item.programItem as Record<string, unknown>).programType;
    const { findings, hasHardFailure } = runAudit([item], tightConfig());
    const f = findings.find((x) => x.code === "SCHEMA_VIOLATION");
    expect(f?.severity).toBe("hard");
    expect(hasHardFailure).toBe(true);
  });

  it("null required field → hard, and is noted in nullFields", () => {
    const item = baseItem({ tags: ["preConventionWeek"] });
    (item.programItem as Record<string, unknown>).title = null;
    const e = enumerate([item]);
    expect(e.structural.nullFields).toContain("title");
    expect(check(e, tightConfig()).find((x) => x.code === "SCHEMA_VIOLATION")?.severity).toBe("hard");
  });

  it("unknown top-level key → hard", () => {
    const item = baseItem({ tags: ["preConventionWeek"] });
    (item.programItem as Record<string, unknown>).surpriseField = "x";
    const e = enumerate([item]);
    expect(e.structural.unknownTopLevelKeys).toContain("surpriseField");
    expect(check(e, tightConfig()).find((x) => x.code === "UNKNOWN_TOP_LEVEL_KEY")?.severity).toBe("hard");
  });

  it("non-UTC timestamp → hard", () => {
    const item = baseItem({ tags: ["preConventionWeek"], startTime: "2026-07-24T15:00:00+03:00" });
    const f = check(enumerate([item]), tightConfig()).find((x) => x.code === "NON_UTC_TIMESTAMP");
    expect(f?.severity).toBe("hard");
  });

  it("duplicate programItemId → hard", () => {
    const items = [
      baseItem({ programItemId: "dup", tags: ["preConventionWeek"] }),
      baseItem({ programItemId: "dup" }),
    ];
    const f = check(enumerate(items), tightConfig()).find((x) => x.code === "DUPLICATE_PROGRAM_ITEM_ID");
    expect(f?.severity).toBe("hard");
  });

  it("parentId === programItemId is NOT a finding (normal standalone marker)", () => {
    const item = baseItem({ programItemId: "self", parentId: "self", tags: ["preConventionWeek"] });
    const e = enumerate([item]);
    expect(e.structural.parentGroups.selfParentCount).toBe(1);
    expect(codes(check(e, tightConfig()))).not.toContain("PARENT_ID_EQUALS_SELF");
  });
});

describe("severity split (plan §4, §8)", () => {
  it("a novel categorical is warn (fail-safe), a structural problem is hard", () => {
    const warnOnly = runAudit([baseItem({ programType: "boardGame", tags: ["preConventionWeek"] })], tightConfig());
    expect(warnOnly.hasHardFailure).toBe(false);
    expect(warnOnly.findings.every((f) => f.severity === "warn")).toBe(true);

    const item = baseItem({ tags: ["preConventionWeek"] });
    delete (item.programItem as Record<string, unknown>).startTime;
    expect(runAudit([item], tightConfig()).hasHardFailure).toBe(true);
  });
});
