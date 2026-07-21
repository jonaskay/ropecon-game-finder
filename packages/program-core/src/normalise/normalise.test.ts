/**
 * Normaliser test suite (handoff Step 3). No network, no real PII.
 *
 * Runs against the curated synthetic fixture (the same baseline the audit is green on),
 * plus a few inline items for cases the fixture's gaming rows don't cover (the `none`
 * signup mode, the pre-convention-week flag on a gaming item).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { projectResponse } from "../konsti/fetch.ts";
import type { KonstiProgramItem, ProjectedItem } from "../konsti/schema.ts";
import { normalise } from "./normalise.ts";

const FIXTURE_PATH = "../../fixtures/konsti-sample.synthetic.json";
const fixtureItems = projectResponse(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")));
const items = normalise(fixtureItems);
const bySlug = Object.fromEntries(items.map((i) => [i.slug, i]));

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

const only = (over: Partial<KonstiProgramItem>, userCount = 0) =>
  normalise([gamingItem(over, userCount)])[0];

describe("gaming filter (primer §5.3)", () => {
  it("keeps only gaming program types, dropping workshop/other", () => {
    expect(items.map((i) => i.slug)).toEqual([
      "pi-001",
      "pi-002",
      "pi-004",
      "pi-005",
      "pi-007",
      "pi-008",
    ]);
    expect(items.every((i) => i.isGaming)).toBe(true);
    // pi-003 (workshop) and pi-006 (other) are the two non-gaming rows in the fixture.
    expect(bySlug["pi-003"]).toBeUndefined();
    expect(bySlug["pi-006"]).toBeUndefined();
  });
});

describe("capacity matrix (primer §3 'Capacity derivation')", () => {
  it("konsti + positive max + at capacity → full", () => {
    expect(bySlug["pi-001"]).toMatchObject({
      capacityStatus: "full",
      maxAttendance: 4,
      joinedCount: 4,
      remainingSeats: 0,
      isFull: true,
    });
  });

  it("konsti + positive max + seats free → available", () => {
    expect(bySlug["pi-007"]).toMatchObject({
      capacityStatus: "available",
      maxAttendance: 8,
      joinedCount: 1,
      remainingSeats: 7,
      isFull: false,
    });
  });

  it("konsti + non-positive max → unknown, but joinedCount stays real", () => {
    expect(bySlug["pi-004"]).toMatchObject({
      capacityStatus: "unknown",
      maxAttendance: null,
      joinedCount: 2,
      remainingSeats: null,
      isFull: null,
    });
  });

  it("physical → unknown with no seat numbers", () => {
    expect(bySlug["pi-002"]).toMatchObject({
      capacityStatus: "unknown",
      maxAttendance: null,
      joinedCount: null,
      remainingSeats: null,
      isFull: null,
    });
  });

  it("none → not-applicable with no seat numbers", () => {
    expect(only({ signupType: "notRequired", maxAttendance: 10 }, 3)).toMatchObject({
      capacityStatus: "not-applicable",
      maxAttendance: null,
      joinedCount: null,
      remainingSeats: null,
      isFull: null,
    });
  });

  it("a full lottery is not presented as more than its joined count", () => {
    // pi-001 is a lottery: capacity reflects joined vs max; strategy stays visible.
    expect(bySlug["pi-001"].signupStrategy).toBe("lottery");
    expect(bySlug["pi-001"].capacityStatus).toBe("full");
  });
});

describe("signup mode / url (primer §3 'Signup model')", () => {
  it("konsti derives a Konsti item URL and requires signup", () => {
    expect(bySlug["pi-001"]).toMatchObject({
      signupMode: "konsti",
      requiresSignup: true,
      signupUrl: "https://ropekonsti.fi/program/item/pi-001",
      physicalSignupLocation: null,
    });
  });

  it("physical maps a configured location and has no URL", () => {
    const pi002 = bySlug["pi-002"];
    expect(pi002.signupMode).toBe("physical");
    expect(pi002.requiresSignup).toBe(true);
    expect(pi002.signupUrl).toBeNull();
    expect(pi002.physicalSignupLocation?.id).toBe("ropelarp");
  });

  it("none has no URL, no location, and does not require signup", () => {
    expect(only({ signupType: "notRequired" })).toMatchObject({
      signupMode: "none",
      requiresSignup: false,
      signupUrl: null,
      physicalSignupLocation: null,
    });
  });
});

describe("scalar derivations (primer §3 'Derived session fields')", () => {
  it("derives cancellation from state", () => {
    expect(bySlug["pi-002"].isCancelled).toBe(true);
    expect(bySlug["pi-001"].isCancelled).toBe(false);
  });

  it("flags the pre-convention week tag on a gaming item", () => {
    expect(only({ tags: ["preConventionWeek"] }).isPreConventionWeek).toBe(true);
    expect(bySlug["pi-001"].isPreConventionWeek).toBe(false);
  });

  it("carries slug, duration, times, day (Europe/Helsinki) and revolving-door", () => {
    expect(bySlug["pi-005"]).toMatchObject({
      slug: "pi-005",
      durationMinutes: 240,
      start: "2026-07-24T13:00:00Z",
      end: "2026-07-24T17:00:00Z",
      day: "2026-07-24",
      isRevolvingDoor: false,
    });
    // A UTC instant late in the Helsinki day still lands on the correct local day.
    expect(bySlug["pi-004"].day).toBe("2026-07-26");
    expect(bySlug["pi-002"].isRevolvingDoor).toBe(true);
  });

  it("preserves raw categoricals beside derived fields", () => {
    expect(bySlug["pi-001"]).toMatchObject({
      state: "accepted",
      programType: "tabletopRPG",
      signupType: "konsti",
      signupStrategy: "lottery",
    });
  });
});

describe("privacy (primer §3 'Privacy boundary')", () => {
  it("serialized normalised output carries no PII keys", () => {
    const blob = JSON.stringify(items);
    expect(blob).not.toContain("username");
    expect(blob).not.toContain("signupMessage");
  });
});
