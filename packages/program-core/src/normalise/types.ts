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
