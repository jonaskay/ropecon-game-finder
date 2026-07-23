import { describe, expect, it } from "vitest";

import { readEnvironment } from "../src/environment.ts";

describe("readEnvironment", () => {
  it("provides combined-source defaults", () => {
    expect(readEnvironment({ PROGRAM_BUCKET: "bucket" })).toEqual({
      bucket: "bucket",
      object: "program.json",
      konstiUrl: "https://ropekonsti.fi/api/program-items",
      kompassiUrl: "https://kompassi.eu/graphql",
      kompassiEventSlug: "ropecon2026",
      kompassiLocale: "en",
    });
  });

  it("reads configured Kompassi values", () => {
    expect(readEnvironment({
      PROGRAM_BUCKET: "bucket",
      PROGRAM_OBJECT: "snapshot.json",
      KONSTI_URL: "https://example.test/konsti",
      KOMPASSI_URL: "https://example.test/graphql",
      KOMPASSI_EVENT_SLUG: "event-2027",
      KOMPASSI_LOCALE: "fi",
    })).toMatchObject({
      object: "snapshot.json",
      konstiUrl: "https://example.test/konsti",
      kompassiUrl: "https://example.test/graphql",
      kompassiEventSlug: "event-2027",
      kompassiLocale: "fi",
    });
  });

  it("requires the storage bucket", () => {
    expect(() => readEnvironment({})).toThrow("PROGRAM_BUCKET is required");
  });
});
