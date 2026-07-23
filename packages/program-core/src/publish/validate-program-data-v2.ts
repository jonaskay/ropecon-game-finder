import type { ProgramDataV2, ProgramItemV2 } from "../normalise/types.ts";

const SIGNUP_PROVIDERS = new Set(["konsti", "physical", "none", "other"]);
const CAPACITY_STATUSES = new Set(["not-applicable", "available", "full", "unknown"]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === "string");

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isNullableNumber = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value));

const isNullableBoolean = (value: unknown): value is boolean | null =>
  value === null || typeof value === "boolean";

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isProgramItemV2(value: unknown): value is ProgramItemV2 {
  if (!isObject(value)) return false;

  const requiredStrings = [
    "slug",
    "parentId",
    "title",
    "shortDescription",
    "description",
    "start",
    "end",
    "location",
    "people",
    "otherAuthor",
    "gameSystem",
    "contentWarnings",
    "otherAccessibilityInformation",
    "entryFee",
    "day",
  ];
  const requiredArrays = [
    "types",
    "topics",
    "registrations",
    "languages",
    "ageGroups",
    "tags",
    "genres",
    "styles",
    "accessibilityValues",
  ];
  if (!requiredStrings.every(key => typeof value[key] === "string")) return false;
  if (!requiredArrays.every(key => isStringArray(value[key]))) return false;

  return Number.isFinite(Date.parse(value.start as string)) &&
    Number.isFinite(Date.parse(value.end as string)) &&
    typeof value.durationMinutes === "number" &&
    Number.isFinite(value.durationMinutes) &&
    typeof value.isCancelled === "boolean" &&
    value.isGaming === true &&
    typeof value.isPreConventionWeek === "boolean" &&
    isNullableBoolean(value.isRevolvingDoor) &&
    isHttpUrl(value.kompassiUrl) &&
    SIGNUP_PROVIDERS.has(String(value.signupProvider)) &&
    isNullableString(value.signupStrategy) &&
    isNullableBoolean(value.requiresSignup) &&
    (value.signupUrl === null || isHttpUrl(value.signupUrl)) &&
    (value.availabilitySource === null || value.availabilitySource === "konsti") &&
    CAPACITY_STATUSES.has(String(value.capacityStatus)) &&
    isNullableNumber(value.maxAttendance) &&
    isNullableNumber(value.joinedCount) &&
    isNullableNumber(value.remainingSeats) &&
    isNullableBoolean(value.isFull) &&
    (value.physicalSignupLocation === null || isObject(value.physicalSignupLocation));
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function validateProgramDataV2(value: unknown): ProgramDataV2 {
  if (
    !isObject(value) ||
    value.schemaVersion !== 2 ||
    value.source !== "kompassi+konsti" ||
    !isTimestamp(value.generatedAt) ||
    !isObject(value.sources) ||
    !isObject(value.sources.kompassi) ||
    typeof value.sources.kompassi.eventSlug !== "string" ||
    !isTimestamp(value.sources.kompassi.fetchedAt) ||
    !isObject(value.sources.konsti) ||
    !isTimestamp(value.sources.konsti.fetchedAt) ||
    !Array.isArray(value.items) ||
    !value.items.every(isProgramItemV2)
  ) {
    throw new Error("Published program data has an invalid version-2 envelope");
  }
  return value as unknown as ProgramDataV2;
}
