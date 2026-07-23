import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { projectResponse } from "../konsti/fetch.ts";
import { parseKompassiSchedule } from "../kompassi/schema.ts";
import { mergeProgramSources } from "../merge/merge.ts";
import { toProgramDataV2 } from "./program-data-v2.ts";
import { validateProgramDataV2 } from "./validate-program-data-v2.ts";

const data = toProgramDataV2(
  mergeProgramSources(
    parseKompassiSchedule(JSON.parse(
      readFileSync("../../fixtures/kompassi-sample.synthetic.json", "utf8"),
    )),
    projectResponse(JSON.parse(
      readFileSync("../../fixtures/konsti-sample.synthetic.json", "utf8"),
    )),
  ).items,
  {
    generatedAt: "2026-07-23T12:00:00.000Z",
    kompassi: {
      eventSlug: "synthetic-event",
      fetchedAt: "2026-07-23T11:59:58.000Z",
    },
    konsti: { fetchedAt: "2026-07-23T11:59:59.000Z" },
  },
);

describe("validateProgramDataV2", () => {
  it("accepts a generated version-2 envelope", () => {
    expect(validateProgramDataV2(structuredClone(data))).toEqual(data);
  });

  it.each([
    ["schema version", (value: any) => { value.schemaVersion = 1; }],
    ["source", (value: any) => { value.source = "konsti"; }],
    ["source timestamp", (value: any) => { value.sources.kompassi.fetchedAt = "invalid"; }],
    ["required Kompassi URL", (value: any) => { value.items[0].kompassiUrl = "javascript:x"; }],
    ["signup provider", (value: any) => { value.items[0].signupProvider = "guess"; }],
    ["availability source", (value: any) => { value.items[0].availabilitySource = "guess"; }],
  ])("rejects an invalid %s", (_label, mutate) => {
    const value = structuredClone(data);
    mutate(value);
    expect(() => validateProgramDataV2(value)).toThrow(
      "invalid version-2 envelope",
    );
  });
});
