import { PHYSICAL_SIGNUP_TYPES } from "../config/signup.ts";
import { helsinkiDay } from "../konsti/time.ts";
import { dimensionValues } from "../kompassi/schema.ts";
import type { MergedProgramItem } from "../merge/types.ts";
import type {
  CapacityStatus,
  PhysicalSignupLocation,
  ProgramItemV2,
  SignupProvider,
} from "./types.ts";

interface SignupClassification {
  provider: SignupProvider;
  requiresSignup: boolean | null;
  physicalSignupLocation: PhysicalSignupLocation | null;
}

interface CapacityFields {
  availabilitySource: "konsti" | null;
  capacityStatus: CapacityStatus;
  maxAttendance: number | null;
  joinedCount: number | null;
  remainingSeats: number | null;
  isFull: boolean | null;
}

function classifySignup(registrations: readonly string[]): SignupClassification {
  const distinct = [...new Set(registrations)];
  if (distinct.length !== 1) {
    return {
      provider: "other",
      requiresSignup: null,
      physicalSignupLocation: null,
    };
  }

  const registration = distinct[0]!;
  if (registration === "not-required") {
    return {
      provider: "none",
      requiresSignup: false,
      physicalSignupLocation: null,
    };
  }
  if (registration === "konsti") {
    return {
      provider: "konsti",
      requiresSignup: true,
      physicalSignupLocation: null,
    };
  }
  if (registration === "ropelarp") {
    return {
      provider: "physical",
      requiresSignup: true,
      physicalSignupLocation: PHYSICAL_SIGNUP_TYPES.ropelarp ?? null,
    };
  }
  return {
    provider: "other",
    requiresSignup: true,
    physicalSignupLocation: null,
  };
}

function unknownCapacity(status: CapacityStatus = "unknown"): CapacityFields {
  return {
    availabilitySource: null,
    capacityStatus: status,
    maxAttendance: null,
    joinedCount: null,
    remainingSeats: null,
    isFull: null,
  };
}

function deriveCapacity(
  item: MergedProgramItem,
  provider: SignupProvider,
): CapacityFields {
  if (provider === "none") return unknownCapacity("not-applicable");
  if (provider !== "konsti" || item.konsti === null) return unknownCapacity();

  const joinedCount = item.konsti.userCount;
  const maxAttendance = item.konsti.programItem.maxAttendance;
  if (!(maxAttendance > 0)) {
    return {
      availabilitySource: "konsti",
      capacityStatus: "unknown",
      maxAttendance: null,
      joinedCount,
      remainingSeats: null,
      isFull: null,
    };
  }

  const isFull = joinedCount >= maxAttendance;
  return {
    availabilitySource: "konsti",
    capacityStatus: isFull ? "full" : "available",
    maxAttendance,
    joinedCount,
    remainingSeats: Math.max(maxAttendance - joinedCount, 0),
    isFull,
  };
}

function toProgramItem(item: MergedProgramItem): ProgramItemV2 {
  const source = item.scheduleItem;
  const enrichment = item.konsti?.programItem ?? null;
  const registrations = [...dimensionValues(source, "registration")];
  const signup = classifySignup(registrations);
  const capacity = deriveCapacity(item, signup.provider);

  return {
    slug: source.slug,
    parentId: source.program.slug,
    title: source.title,
    shortDescription: enrichment?.shortDescription ?? "",
    description: enrichment?.description ?? "",
    start: source.startTime,
    end: source.endTime,
    durationMinutes: source.durationMinutes,
    location: source.location,
    people: enrichment?.people ?? "",
    otherAuthor: enrichment?.otherAuthor ?? "",

    isCancelled: source.isCancelled,
    isGaming: true,
    types: [...dimensionValues(source, "type")],
    topics: [...dimensionValues(source, "topic")],
    registrations,
    languages: [...dimensionValues(source, "language")],
    ageGroups: [...dimensionValues(source, "age-group")],
    tags: enrichment?.tags ?? [],
    genres: enrichment?.genres ?? [],
    styles: enrichment?.styles ?? [],
    gameSystem: enrichment?.gameSystem ?? "",
    contentWarnings: enrichment?.contentWarnings ?? "",
    accessibilityValues: enrichment?.accessibilityValues ?? [],
    otherAccessibilityInformation: enrichment?.otherAccessibilityInformation ?? "",
    entryFee: enrichment?.entryFee ?? "",

    day: helsinkiDay(source.startTime) ?? "",
    isPreConventionWeek: dimensionValues(source, "is-pre-convention-week").includes("yes"),
    isRevolvingDoor: enrichment?.revolvingDoor ?? null,

    kompassiUrl: source.kompassiUrl,
    signupProvider: signup.provider,
    signupStrategy: enrichment?.signupStrategy ?? null,
    requiresSignup: signup.requiresSignup,
    signupUrl: source.signupUrl,
    physicalSignupLocation: signup.physicalSignupLocation,

    ...capacity,
  };
}

/** Normalize the already-filtered Kompassi-left merge into the future v2 item model. */
export function normaliseMerged(items: readonly MergedProgramItem[]): ProgramItemV2[] {
  return items.map(toProgramItem);
}
