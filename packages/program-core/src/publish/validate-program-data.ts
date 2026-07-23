import type { ProgramData, ProgramItem } from "../normalise/types.ts";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isProgramItem(value: unknown): value is ProgramItem {
  if (!isObject(value)) return false;
  return ["slug", "title", "start", "end", "day", "signupMode", "capacityStatus", "konstiPageUrl"].every(
    key => typeof value[key] === "string",
  ) && typeof value.isCancelled === "boolean" && typeof value.isGaming === "boolean" &&
    Array.isArray(value.tags) && value.tags.every(tag => typeof tag === "string") &&
    Number.isFinite(Date.parse(value.start as string)) && Number.isFinite(Date.parse(value.end as string));
}

export function validateProgramData(value: unknown): ProgramData {
  if (!isObject(value) || value.source !== "konsti" || typeof value.generatedAt !== "string" ||
      !Number.isFinite(Date.parse(value.generatedAt)) || !Array.isArray(value.items) ||
      !value.items.every(isProgramItem)) {
    throw new Error("Published program data has an invalid envelope");
  }
  return value as unknown as ProgramData;
}
