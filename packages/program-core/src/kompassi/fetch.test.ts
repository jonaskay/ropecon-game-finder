import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { fetchKompassiSchedule } from "./fetch.ts";
import { KOMPASSI_SCHEDULE_QUERY } from "./query.ts";

const fixture = JSON.parse(
  readFileSync("../../fixtures/kompassi-sample.synthetic.json", "utf8"),
);

describe("fetchKompassiSchedule", () => {
  it("posts the query with configured variables and parses the response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const schedule = await fetchKompassiSchedule({
      url: "https://example.test/graphql",
      eventSlug: "synthetic-event",
      locale: "en",
      fetchImpl,
    });

    expect(schedule.scheduleItems).toHaveLength(5);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://example.test/graphql");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      query: KOMPASSI_SCHEDULE_QUERY,
      variables: { eventSlug: "synthetic-event", locale: "en" },
    });
  });

  it("rejects non-successful HTTP responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("unavailable", { status: 503, statusText: "Service Unavailable" }),
    );

    await expect(fetchKompassiSchedule({
      eventSlug: "synthetic-event",
      locale: "en",
      fetchImpl,
    })).rejects.toThrow("Kompassi fetch failed: 503 Service Unavailable");
  });
});
