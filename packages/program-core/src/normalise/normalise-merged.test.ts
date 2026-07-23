import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { projectResponse } from "../konsti/fetch.ts";
import { parseKompassiSchedule } from "../kompassi/schema.ts";
import { mergeProgramSources } from "../merge/merge.ts";
import { normaliseMerged } from "./normalise-merged.ts";

const schedule = parseKompassiSchedule(JSON.parse(
  readFileSync("../../fixtures/kompassi-sample.synthetic.json", "utf8"),
));
const projected = projectResponse(JSON.parse(
  readFileSync("../../fixtures/konsti-sample.synthetic.json", "utf8"),
));
const merged = mergeProgramSources(schedule, projected).items;
const items = normaliseMerged(merged);
const bySlug = Object.fromEntries(items.map(item => [item.slug, item]));

describe("normaliseMerged", () => {
  it("uses Kompassi identity, parent, schedule, location, dimensions, and links", () => {
    expect(bySlug["pi-001"]).toMatchObject({
      slug: "pi-001",
      parentId: "pi-001",
      title: "Dragons of the North",
      start: "2026-07-24T15:00:00+03:00",
      end: "2026-07-24T19:00:00+03:00",
      durationMinutes: 240,
      location: "Hall A",
      isCancelled: false,
      types: ["gaming"],
      topics: ["rpg"],
      registrations: ["konsti"],
      languages: ["fi"],
      kompassiUrl: "https://v2.kompassi.eu/synthetic/programs/pi-001",
    });
  });

  it("enriches an exact Konsti signup match and derives known capacity", () => {
    expect(bySlug["pi-001"]).toMatchObject({
      signupProvider: "konsti",
      requiresSignup: true,
      signupUrl: "https://ropekonsti.fi/program/item/pi-001",
      signupStrategy: "lottery",
      availabilitySource: "konsti",
      capacityStatus: "full",
      maxAttendance: 4,
      joinedCount: 4,
      remainingSeats: 0,
      isFull: true,
      gameSystem: "Dungeons & Dragons 5th Edition",
    });
  });

  it("keeps physical signup capacity unknown and cancellation authoritative", () => {
    expect(bySlug["pi-002"]).toMatchObject({
      isCancelled: true,
      signupProvider: "physical",
      requiresSignup: true,
      signupUrl: null,
      availabilitySource: null,
      capacityStatus: "unknown",
      maxAttendance: null,
      joinedCount: null,
      remainingSeats: null,
      isFull: null,
    });
    expect(bySlug["pi-002"].physicalSignupLocation?.id).toBe("ropelarp");
  });

  it("publishes a Kompassi-only walk-in without synthesizing capacity", () => {
    expect(bySlug["kompassi-only-walk-in"]).toMatchObject({
      signupProvider: "none",
      requiresSignup: false,
      availabilitySource: null,
      capacityStatus: "not-applicable",
      joinedCount: null,
      maxAttendance: null,
      description: "",
      people: "",
      gameSystem: "",
    });
  });

  it("publishes an unmatched Konsti-registration item with unknown availability", () => {
    expect(bySlug["kompassi-only-konsti"]).toMatchObject({
      signupProvider: "konsti",
      requiresSignup: true,
      signupUrl: null,
      signupStrategy: null,
      availabilitySource: null,
      capacityStatus: "unknown",
      joinedCount: null,
      maxAttendance: null,
      isFull: null,
    });
  });

  it("leaves missing registration semantics explicit and enrichment safely empty", () => {
    expect(bySlug["minimum-documented-item"]).toMatchObject({
      registrations: [],
      signupProvider: "other",
      requiresSignup: null,
      availabilitySource: null,
      capacityStatus: "unknown",
      shortDescription: "",
      description: "",
      tags: [],
      genres: [],
      styles: [],
      languages: [],
      ageGroups: [],
      isRevolvingDoor: null,
    });
  });

  it("keeps Kompassi precedence when matched Konsti fields conflict", () => {
    const conflict = structuredClone(merged[0]!);
    conflict.konsti!.programItem.title = "Konsti title";
    conflict.konsti!.programItem.location = "Konsti room";
    conflict.konsti!.programItem.startTime = "2026-07-24T12:00:00Z";
    conflict.konsti!.programItem.state = "cancelled";

    expect(normaliseMerged([conflict])[0]).toMatchObject({
      title: "Dragons of the North",
      location: "Hall A",
      start: "2026-07-24T15:00:00+03:00",
      isCancelled: false,
    });
  });

  it("serializes without Konsti participant data", () => {
    const serialized = JSON.stringify(items);
    expect(serialized).not.toContain("username");
    expect(serialized).not.toContain("signupMessage");
    expect(serialized).not.toContain('"users"');
  });
});
