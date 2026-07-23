import { describe, expect, it } from "vitest";
import type { ProgramItemV2 } from "@ropecon/program-core";
import { groupByGameSystem, renderGameSystems } from "./game-systems.ts";

const item = (
  slug: string,
  gameSystem: string,
  start = "2026-07-24T12:00:00Z",
): ProgramItemV2 => ({
  slug,
  parentId: "shared-parent",
  title: `Game ${slug}`,
  shortDescription: "",
  description: "",
  start,
  end: "2026-07-24T14:00:00Z",
  durationMinutes: 60,
  location: "Hall",
  people: "",
  otherAuthor: "",
  isCancelled: false,
  isGaming: true,
  types: ["gaming"],
  topics: ["rpg"],
  registrations: ["not-required"],
  tags: [],
  genres: [],
  styles: [],
  languages: [],
  ageGroups: [],
  gameSystem,
  contentWarnings: "",
  accessibilityValues: [],
  otherAccessibilityInformation: "",
  entryFee: "",
  day: "2026-07-24",
  isPreConventionWeek: false,
  isRevolvingDoor: false,
  kompassiUrl: `https://v2.kompassi.eu/event/programs/${slug}`,
  signupProvider: "none",
  signupStrategy: null,
  requiresSignup: false,
  signupUrl: null,
  physicalSignupLocation: null,
  availabilitySource: null,
  capacityStatus: "not-applicable",
  maxAttendance: null,
  joinedCount: null,
  remainingSeats: null,
  isFull: null,
});

describe("game systems view", () => {
  it("groups trimmed names, suppresses blanks, counts repetitions, and sorts sessions", () => {
    const groups = groupByGameSystem(
      [
        item("late", "  RuneQuest  ", "2026-07-24T15:00:00Z"),
        item("blank", " \n\t"),
        item("invisible", "\u200b"),
        item("early", "RuneQuest", "2026-07-24T10:00:00Z"),
      ],
      "en",
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe("RuneQuest");
    expect(groups[0]?.items.map(({ slug }) => slug)).toEqual(["early", "late"]);
  });

  it("uses locale-aware alphabetical system ordering", () => {
    const groups = groupByGameSystem(
      [item("z", "Zulu"), item("a-ring", "Åland"), item("a", "Alpha")],
      "sv",
    );
    expect(groups.map(({ name }) => name)).toEqual(["Alpha", "Zulu", "Åland"]);
  });

  it("renders independent native accordions collapsed by default with accessible summaries", () => {
    const html = renderGameSystems([
      { name: "D&D <5e>", items: [item("one", "D&D <5e>"), item("two", "D&D <5e>")] },
      { name: "Fate", items: [item("three", "Fate")] },
    ]);

    expect(html.match(/<details class="system">/g)).toHaveLength(2);
    expect(html).not.toMatch(/<details class="system"[^>]*\sopen/);
    expect(html).toContain("<summary>");
    expect(html).toContain("2 sessions");
    expect(html).toContain("1 session");
    expect(html).toContain("D&amp;D &lt;5e&gt;");
  });
});
