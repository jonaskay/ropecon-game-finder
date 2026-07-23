/**
 * The one typed model the finder consumes (primer §5.3).
 *
 * `ProgramItem` is the normalised, PII-free session shape. It preserves the raw
 * categoricals (`state`, `programType`, `signupType`, `signupStrategy`) alongside the
 * derived fields so new/unexpected values stay diagnosable downstream (primer §3
 * "Derived session fields"). `ProgramData` is the serialised envelope published as
 * `program.json` (Step 4).
 *
 * `SignupMode` and `PhysicalSignupLocation` are owned by the signup config — re-exported
 * here so consumers get the whole model from one import.
 */

import type { PhysicalSignupLocation, SignupMode } from "../config/signup.ts";

export type { SignupMode, PhysicalSignupLocation };

export type CapacityStatus = "not-applicable" | "available" | "full" | "unknown";
export type SignupProvider = "konsti" | "physical" | "none" | "other";
export type AvailabilitySource = "konsti" | null;

/**
 * Combined-source item contract prepared by milestone 3.
 *
 * It intentionally lives beside the current ProgramItem until the versioned
 * publisher and browser switch together. Kompassi owns every schedule-facing
 * field; nullable/empty enrichment comes only from an exact Konsti match.
 */
export interface ProgramItemV2 {
  slug: string;
  parentId: string;
  title: string;
  shortDescription: string;
  description: string;
  start: string;
  end: string;
  durationMinutes: number;
  location: string;
  people: string;
  otherAuthor: string;

  isCancelled: boolean;
  isGaming: true;
  types: string[];
  topics: string[];
  registrations: string[];
  languages: string[];
  ageGroups: string[];
  tags: string[];
  genres: string[];
  styles: string[];
  gameSystem: string;
  contentWarnings: string;
  accessibilityValues: string[];
  otherAccessibilityInformation: string;
  entryFee: string;

  day: string;
  isPreConventionWeek: boolean;
  isRevolvingDoor: boolean | null;

  kompassiUrl: string;
  signupProvider: SignupProvider;
  signupStrategy: string | null;
  requiresSignup: boolean | null;
  signupUrl: string | null;
  physicalSignupLocation: PhysicalSignupLocation | null;

  availabilitySource: AvailabilitySource;
  capacityStatus: CapacityStatus;
  maxAttendance: number | null;
  joinedCount: number | null;
  remainingSeats: number | null;
  isFull: boolean | null;
}

export interface ProgramItem {
  slug: string; // programItemId (canonical identity)
  parentId: string;
  title: string;
  shortDescription: string;
  description: string;
  start: string; // startTime (UTC ISO-8601, ends in "Z")
  end: string; // endTime (UTC ISO-8601, ends in "Z")
  durationMinutes: number;
  location: string;
  people: string;
  otherAuthor: string;

  state: string;
  isCancelled: boolean;
  programType: string;
  isGaming: boolean;
  tags: string[];
  genres: string[];
  styles: string[];
  languages: string[];
  ageGroups: string[];
  gameSystem: string;
  contentWarnings: string;
  accessibilityValues: string[];
  otherAccessibilityInformation: string;
  entryFee: string;

  day: string; // Europe/Helsinki calendar day (YYYY-MM-DD)
  isPreConventionWeek: boolean;
  isRevolvingDoor: boolean;

  konstiPageUrl: string; // Konsti item page — always present (every session has one)

  signupType: string;
  signupMode: SignupMode;
  signupStrategy: string;
  requiresSignup: boolean;
  signupUrl: string | null; // Konsti item URL when signupMode === "konsti", else null
  physicalSignupLocation: PhysicalSignupLocation | null;

  capacityStatus: CapacityStatus;
  maxAttendance: number | null;
  joinedCount: number | null;
  remainingSeats: number | null;
  isFull: boolean | null;
}

export interface ProgramData {
  generatedAt: string;
  source: "konsti";
  items: ProgramItem[];
}

export interface ProgramDataV2 {
  schemaVersion: 2;
  generatedAt: string;
  source: "kompassi+konsti";
  sources: {
    kompassi: {
      eventSlug: string;
      fetchedAt: string;
    };
    konsti: {
      fetchedAt: string;
    };
  };
  items: ProgramItemV2[];
}
