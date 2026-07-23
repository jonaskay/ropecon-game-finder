import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  KompassiStructuralError,
  dimensionValues,
  hasDimensionValue,
  parseKompassiSchedule,
} from "./schema.ts";

const fixture = JSON.parse(
  readFileSync("../../fixtures/kompassi-sample.synthetic.json", "utf8"),
);

function copyFixture(): unknown {
  return structuredClone(fixture);
}

describe("parseKompassiSchedule", () => {
  it("parses the documented response and selects typed links", () => {
    const schedule = parseKompassiSchedule(copyFixture());

    expect(schedule.eventName).toBe("Synthetic Ropecon");
    expect(schedule.timezone).toBe("Europe/Helsinki");
    expect(schedule.scheduleItems).toHaveLength(5);
    expect(schedule.scheduleItems[0]).toMatchObject({
      slug: "pi-001",
      signupUrl: "https://ropekonsti.fi/program/item/pi-001",
      kompassiUrl: "https://v2.kompassi.eu/synthetic/programs/pi-001",
    });
    expect(schedule.scheduleItems[1]?.signupUrl).toBeNull();
    expect(schedule.findings).toEqual([]);
  });

  it("provides helpers for open-ended dimensions", () => {
    const item = parseKompassiSchedule(copyFixture()).scheduleItems[0]!;

    expect(dimensionValues(item, "topic")).toEqual(["rpg"]);
    expect(dimensionValues(item, "future-dimension")).toEqual([]);
    expect(hasDimensionValue(item, "type", "gaming")).toBe(true);
  });

  it.each([
    ["a missing event", (payload: any) => { payload.data.event = null; }],
    ["a missing program", (payload: any) => { payload.data.event.program = null; }],
    ["a non-public schedule", (payload: any) => {
      payload.data.event.program.isSchedulePublic = false;
    }],
    ["null schedule items", (payload: any) => {
      payload.data.event.program.scheduleItems = null;
    }],
  ])("rejects %s", (_label, mutate) => {
    const payload = structuredClone(fixture);
    mutate(payload);
    expect(() => parseKompassiSchedule(payload)).toThrow(KompassiStructuralError);
  });

  it("rejects GraphQL errors even when partial schedule data is present", () => {
    const payload = structuredClone(fixture);
    payload.errors = [{ message: "schedule resolver failed", path: ["event", "program"] }];

    expect(() => parseKompassiSchedule(payload)).toThrow(
      "GraphQL returned 1 error(s) for the schedule query",
    );
  });

  it("blocks an item with a missing or invalid guide link", () => {
    const missing = structuredClone(fixture);
    missing.data.event.program.scheduleItems[0].program.links = [];
    expect(() => parseKompassiSchedule(missing)).toThrow("has no valid GUIDE_V2_LIGHT link");

    const invalid = structuredClone(fixture);
    invalid.data.event.program.scheduleItems[0].program.links = [{ href: "javascript:alert(1)" }];
    expect(() => parseKompassiSchedule(invalid)).toThrow("has no valid GUIDE_V2_LIGHT link");
  });

  it("selects the first valid link and reports duplicates and invalid URLs", () => {
    const payload = structuredClone(fixture);
    const item = payload.data.event.program.scheduleItems[0];
    item.links = [
      { href: "not a URL" },
      { href: "https://first.example/signup" },
      { href: "https://second.example/signup" },
    ];
    item.program.links = [
      { href: "mailto:help@example.com" },
      { href: "https://first.example/details" },
      { href: "https://second.example/details" },
    ];

    const schedule = parseKompassiSchedule(payload);
    expect(schedule.scheduleItems[0]?.signupUrl).toBe("https://first.example/signup");
    expect(schedule.scheduleItems[0]?.kompassiUrl).toBe("https://first.example/details");
    expect(schedule.findings.map(finding => finding.code)).toEqual([
      "invalid_signup_link",
      "duplicate_signup_link",
      "invalid_guide_link",
      "duplicate_guide_link",
    ]);
  });

  it("rejects malformed required schedule fields and dimensions", () => {
    const badTitle = structuredClone(fixture);
    badTitle.data.event.program.scheduleItems[0].title = null;
    expect(() => parseKompassiSchedule(badTitle)).toThrow(".title is not a string");

    const badDimension = structuredClone(fixture);
    badDimension.data.event.program.scheduleItems[0].cachedDimensions.type = "gaming";
    expect(() => parseKompassiSchedule(badDimension)).toThrow(
      ".cachedDimensions.type is not a string array",
    );
  });
});
