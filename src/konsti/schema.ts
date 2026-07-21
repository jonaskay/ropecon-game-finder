/**
 * Konsti wire types and a minimal structural guard.
 *
 * Source of truth: session primer v6 §3 "Verified Konsti technical reference".
 * The wire endpoint is `GET https://ropekonsti.fi/api/program-items`.
 *
 * Two rules from the primer constrain this file:
 *  - Categorical strings stay OPEN-ENDED at the wire boundary (`string`, not unions).
 *    New values are surfaced by the audit, not rejected by the type system.
 *  - Only the STRUCTURAL fields the finder relies on are required. The guard verifies
 *    just enough shape to safely project away PII and enumerate categoricals.
 *
 * PRIVACY: `KonstiUser` (username / signupMessage) exists here only to describe the
 * wire shape. It is projected to a count in `fetch.ts` and must never travel further.
 */

/** The known top-level keys of `programItem`. Used by the audit to detect drift. */
export const KNOWN_PROGRAM_ITEM_KEYS = [
  "programItemId",
  "parentId",
  "title",
  "description",
  "location",
  "startTime",
  "mins",
  "tags",
  "ageGroups",
  "genres",
  "styles",
  "languages",
  "endTime",
  "people",
  "minAttendance",
  "maxAttendance",
  "gameSystem",
  "popularity",
  "shortDescription",
  "revolvingDoor",
  "programType",
  "contentWarnings",
  "otherAuthor",
  "accessibilityValues",
  "otherAccessibilityInformation",
  "entryFee",
  "signupType",
  "state",
  "signupStrategy",
] as const;

export interface KonstiProgramItem {
  programItemId: string;
  parentId: string;
  title: string;
  description: string;
  location: string;
  startTime: string; // UTC ISO-8601, ends in "Z"
  mins: number;
  tags: string[];
  ageGroups: string[];
  genres: string[];
  styles: string[];
  languages: string[];
  endTime: string; // UTC ISO-8601, ends in "Z"
  people: string;
  minAttendance: number;
  maxAttendance: number;
  gameSystem: string;
  popularity: string;
  shortDescription: string;
  revolvingDoor: boolean;
  programType: string;
  contentWarnings: string;
  otherAuthor: string;
  accessibilityValues: string[];
  otherAccessibilityInformation: string;
  entryFee: string;
  signupType: string;
  state: string;
  signupStrategy: string;
}

/** PRIVACY-SENSITIVE. Never leaves `fetch.ts`; projected to a count immediately. */
export interface KonstiUser {
  username: string;
  signupMessage: string;
}

export interface KonstiProgramItemsEntry {
  programItem: KonstiProgramItem;
  users: KonstiUser[];
}

export interface KonstiProgramItemsResponse {
  message: string;
  status: string; // currently "success"
  programItems: KonstiProgramItemsEntry[];
}

/**
 * A program item with its user array projected to a count. This is the ONLY item
 * shape the audit ever sees — it carries no PII. `programItem` is retained whole
 * (it contains no personal data) so Tier-3 structural checks can inspect it.
 */
export interface ProjectedItem {
  programItem: KonstiProgramItem;
  userCount: number;
}

export class StructuralError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuralError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Minimal structural guard: throws `StructuralError` if the payload is not shaped
 * closely enough to the wire schema to be safely projected and enumerated. This is
 * the "fetch → structural validate" step of the data-job contract (§5); the richer,
 * non-fatal categorical drift lives in `audit/checks.ts`.
 *
 * It deliberately does NOT reject unknown categorical string values, and does NOT
 * reject unknown top-level keys (that is a reported finding, not a parse failure).
 */
export function assertProgramItemsResponse(
  payload: unknown,
): asserts payload is KonstiProgramItemsResponse {
  if (!isObject(payload)) {
    throw new StructuralError("response is not an object");
  }
  if (!Array.isArray(payload.programItems)) {
    throw new StructuralError("response.programItems is not an array");
  }

  payload.programItems.forEach((entry, index) => {
    if (!isObject(entry)) {
      throw new StructuralError(`programItems[${index}] is not an object`);
    }
    if (!Array.isArray(entry.users)) {
      throw new StructuralError(`programItems[${index}].users is not an array`);
    }
    const item = entry.programItem;
    if (!isObject(item)) {
      throw new StructuralError(`programItems[${index}].programItem is not an object`);
    }
    // Structural identity is the one field the whole pipeline assumes exists.
    if (typeof item.programItemId !== "string") {
      throw new StructuralError(
        `programItems[${index}].programItem.programItemId is not a string`,
      );
    }
  });
}
