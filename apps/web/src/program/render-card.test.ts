import { describe, expect, it } from "vitest";
import type { ProgramItemV2 } from "@ropecon/program-core";

import { classifyJoinableSoon } from "../classify/window.ts";
import { renderProgramItem } from "./render-card.ts";

const NOW = Date.parse("2026-07-24T12:00:00Z");

function item(overrides: Partial<ProgramItemV2> = {}): ProgramItemV2 {
  return {
    slug: "kompassi-only",
    parentId: "parent",
    title: "Kompassi-only Game",
    shortDescription: "",
    description: "",
    start: "2026-07-24T12:20:00Z",
    end: "2026-07-24T13:20:00Z",
    durationMinutes: 60,
    location: "Hall",
    people: "",
    otherAuthor: "",
    isCancelled: false,
    isGaming: true,
    types: ["gaming"],
    topics: ["rpg"],
    registrations: ["konsti"],
    languages: ["en"],
    ageGroups: [],
    tags: [],
    genres: [],
    styles: [],
    gameSystem: "",
    contentWarnings: "",
    accessibilityValues: [],
    otherAccessibilityInformation: "",
    entryFee: "",
    day: "2026-07-24",
    isPreConventionWeek: false,
    isRevolvingDoor: null,
    kompassiUrl: "https://v2.kompassi.eu/event/programs/kompassi-only",
    signupProvider: "konsti",
    signupStrategy: null,
    requiresSignup: true,
    signupUrl: null,
    physicalSignupLocation: null,
    availabilitySource: null,
    capacityStatus: "unknown",
    maxAttendance: null,
    joinedCount: null,
    remainingSeats: null,
    isFull: null,
    ...overrides,
  };
}

describe("version-2 program card", () => {
  it("always renders a visible Kompassi details link", () => {
    const html = renderProgramItem(item());
    expect(html).toContain('href="https://v2.kompassi.eu/event/programs/kompassi-only"');
    expect(html).toContain("View in Kompassi");
  });

  it("explains required signup without presenting a missing link as an action", () => {
    const html = renderProgramItem(item());
    expect(html).toContain("Live signup information is unavailable");
    expect(html).not.toContain("Sign up in Konsti");
    expect(html).toContain("Live seat count unavailable");
  });

  it("labels a real Konsti URL as Sign up in Konsti while retaining details", () => {
    const html = renderProgramItem(item({
      signupUrl: "https://ropekonsti.fi/program/item/kompassi-only",
      signupStrategy: "direct",
      availabilitySource: "konsti",
      capacityStatus: "available",
      maxAttendance: 5,
      joinedCount: 2,
      remainingSeats: 3,
      isFull: false,
    }));
    expect(html).toContain("Sign up in Konsti");
    expect(html).toContain("View in Kompassi");
    expect(html).toContain("3 of 5 seats left");
  });

  it("does not call a non-Konsti URL a Konsti signup", () => {
    const html = renderProgramItem(item({
      signupUrl: "https://signup.example/session",
    }));
    expect(html).toContain("Open signup information");
    expect(html).not.toContain("Sign up in Konsti");
  });

  it("shows FULL only for capacity sourced from Konsti", () => {
    const known = renderProgramItem(item({
      availabilitySource: "konsti",
      capacityStatus: "full",
      maxAttendance: 4,
      joinedCount: 4,
      remainingSeats: 0,
      isFull: true,
    }));
    expect(known).toContain("full-badge");
    expect(known).toContain("No seats left");

    const unproven = renderProgramItem(item({
      availabilitySource: null,
      capacityStatus: "full",
      isFull: true,
    }));
    expect(unproven).not.toContain("full-badge");
    expect(unproven).toContain("Live seat count unavailable");
  });

  it("omits blank optional enrichment sections", () => {
    const html = renderProgramItem(item());
    expect(html).not.toContain("<dt>System</dt>");
    expect(html).not.toContain('class="short"');
    expect(html).not.toContain('class="content-warning"');
  });

  it("keeps a Kompassi-only unknown-capacity session visible and rendered", () => {
    const kompassiOnly = item();
    const result = classifyJoinableSoon(kompassiOnly, NOW);
    const html = renderProgramItem(kompassiOnly);

    expect(result.included).toBe(true);
    expect(html).toContain("Kompassi-only Game");
    expect(html).toContain("Live seat count unavailable");
  });
});
