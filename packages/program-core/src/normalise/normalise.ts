/**
 * Pure normaliser: `ProjectedItem[] → ProgramItem[]`, gaming only (primer §5.3, Step 3).
 *
 * It is PURE and side-effect-free — no fetching, no clock, no I/O. It only ever sees
 * `ProjectedItem` (users already projected to `userCount` in fetch.ts), so no PII can
 * enter here. Items whose `programType` is not on the gaming allowlist are dropped;
 * everything that survives is mapped to the single typed `ProgramItem` model.
 *
 * Derivations follow primer §3 exactly. Raw categoricals (`state`, `programType`,
 * `signupType`, `signupStrategy`) are preserved beside the derived fields so a new
 * value stays diagnosable rather than silently reinterpreted.
 */

import type { ProjectedItem } from "../konsti/schema.ts";
import { helsinkiDay } from "../konsti/time.ts";
import { isGamingProgramType } from "../config/gaming.ts";
import { PHYSICAL_SIGNUP_TYPES, signupMode, type SignupMode } from "../config/signup.ts";
import { CANCELLATION_STATE, PRE_CONVENTION_WEEK_TAG } from "../config/taxonomy.ts";
import type { CapacityStatus, ProgramItem } from "./types.ts";

/** Base of the guest-facing Konsti item page for a single program item. */
const KONSTI_ITEM_URL_BASE = "https://ropekonsti.fi/program/item/";

interface CapacityFields {
  capacityStatus: CapacityStatus;
  maxAttendance: number | null;
  joinedCount: number | null;
  remainingSeats: number | null;
  isFull: boolean | null;
}

/**
 * Capacity derivation (primer §3 "Capacity derivation"). Capacity is meaningful ONLY
 * for `signupMode === "konsti"`; every other mode reports no seat numbers.
 *
 *  - `none`     → not-applicable (walk-in; nothing to count).
 *  - `physical` → unknown (seats are managed at a desk, not online).
 *  - `konsti`   → joinedCount is real (`userCount`); require a POSITIVE maxAttendance
 *                 before declaring available/full, else unknown. `lottery` is NOT
 *                 special-cased here: availability describes the current joined count,
 *                 not the odds/outcome of the lottery (the UI explains signupStrategy).
 */
function deriveCapacity(
  mode: SignupMode,
  userCount: number,
  rawMaxAttendance: number,
): CapacityFields {
  if (mode === "none") {
    return {
      capacityStatus: "not-applicable",
      maxAttendance: null,
      joinedCount: null,
      remainingSeats: null,
      isFull: null,
    };
  }
  if (mode === "physical") {
    return {
      capacityStatus: "unknown",
      maxAttendance: null,
      joinedCount: null,
      remainingSeats: null,
      isFull: null,
    };
  }

  // konsti: joinedCount is a real fact even when the max is unusable.
  const joinedCount = userCount;
  if (!(rawMaxAttendance > 0)) {
    // non-positive or structurally invalid (NaN) capacity → unknown.
    return {
      capacityStatus: "unknown",
      maxAttendance: null,
      joinedCount,
      remainingSeats: null,
      isFull: null,
    };
  }
  const isFull = joinedCount >= rawMaxAttendance;
  return {
    capacityStatus: isFull ? "full" : "available",
    maxAttendance: rawMaxAttendance,
    joinedCount,
    remainingSeats: Math.max(rawMaxAttendance - joinedCount, 0),
    isFull,
  };
}

function toProgramItem(item: ProjectedItem): ProgramItem {
  const p = item.programItem;
  const mode = signupMode(p.signupType);
  const capacity = deriveCapacity(mode, item.userCount, p.maxAttendance);
  // Every session has a Konsti item page regardless of signup mode (primer §3
  // "Derived session fields"). It is the informational "full details" link shown on
  // every card; the actionable signupUrl is a subset of it, present only for konsti.
  const konstiPageUrl = KONSTI_ITEM_URL_BASE + p.programItemId;

  return {
    slug: p.programItemId,
    parentId: p.parentId,
    title: p.title,
    shortDescription: p.shortDescription,
    description: p.description,
    start: p.startTime,
    end: p.endTime,
    durationMinutes: p.mins,
    location: p.location,
    people: p.people,
    otherAuthor: p.otherAuthor,

    state: p.state,
    isCancelled: p.state === CANCELLATION_STATE,
    programType: p.programType,
    isGaming: isGamingProgramType(p.programType),
    tags: p.tags,
    genres: p.genres,
    styles: p.styles,
    languages: p.languages,
    ageGroups: p.ageGroups,
    gameSystem: p.gameSystem,
    contentWarnings: p.contentWarnings,
    accessibilityValues: p.accessibilityValues,
    otherAccessibilityInformation: p.otherAccessibilityInformation,
    entryFee: p.entryFee,

    day: helsinkiDay(p.startTime) ?? "",
    isPreConventionWeek: p.tags.includes(PRE_CONVENTION_WEEK_TAG),
    isRevolvingDoor: p.revolvingDoor,

    konstiPageUrl,

    signupType: p.signupType,
    signupMode: mode,
    signupStrategy: p.signupStrategy,
    requiresSignup: mode !== "none",
    signupUrl: mode === "konsti" ? konstiPageUrl : null,
    physicalSignupLocation: PHYSICAL_SIGNUP_TYPES[p.signupType] ?? null,

    ...capacity,
  };
}

/** Normalise projected items to the typed model, keeping gaming program types only. */
export function normalise(items: ProjectedItem[]): ProgramItem[] {
  return items
    .filter((item) => isGamingProgramType(item.programItem.programType))
    .map(toProgramItem);
}
