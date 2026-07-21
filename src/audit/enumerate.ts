/**
 * Pure enumeration core (plan §3, §2).
 *
 * `enumerate(items)` turns PII-free `ProjectedItem[]` into an `Enumeration`: distinct
 * categorical values with counts + example titles (Tier 1/2) plus structural facts
 * (Tier 3). It is PURE and side-effect-free — no fetching, no console, no exit — and
 * has no access to `users[]`, so no PII can enter or leave.
 *
 * Design notes:
 *  - Array categoricals enumerate distinct ELEMENTS, not distinct arrays.
 *  - Empty strings / empty arrays are treated as "no value" and are not enumerated as
 *    categorical values; emptiness-vs-null is handled by structural `schemaViolations`.
 *  - Days are computed in `Europe/Helsinki` from UTC instants via `Intl`, never by a
 *    hand-rolled offset (primer §Tooling).
 */

import {
  KNOWN_PROGRAM_ITEM_KEYS,
  type ProjectedItem,
} from "../konsti/schema.ts";
import { helsinkiDay } from "../konsti/time.ts";
import { PRE_CONVENTION_WEEK_TAG, TIER2_ARRAY_FIELDS } from "../config/taxonomy.ts";

const MAX_EXAMPLES = 3;

export interface ValueCount {
  value: string;
  count: number;
  examples: string[]; // example titles (or slugs when a title is empty)
}

export interface SchemaViolation {
  slug: string;
  field: string;
  kind: "missing" | "null" | "wrongType";
  expected: string;
}

export interface TimestampViolation {
  slug: string;
  field: "startTime" | "endTime";
  value: string;
}

export interface ParentGroupFacts {
  // Konsti convention (verified against live data 2026-07-21): parentId is always
  // present; a STANDALONE item sets parentId === its own programItemId, and sessions
  // of one multi-session program share a parentId. So self-parenting is normal, NOT a
  // defect. Grouping key = parentId, or the item's own id when parentId is empty.
  emptyParentIdCount: number; // items with parentId === "" (unobserved in live data)
  selfParentCount: number; // parentId === programItemId (normal standalone marker)
  groupCount: number; // distinct groups
  singletonGroupCount: number; // groups with exactly one session
  largestGroupSize: number;
}

export interface CapacityFacts {
  konstiItemCount: number;
  nonPositiveMaxAttendance: number; // maxAttendance <= 0
  overbooked: number; // joinedCount > maxAttendance
}

export interface StructuralFacts {
  itemCount: number;
  distinctProgramItemIds: number;
  duplicateProgramItemIds: string[];
  parentGroups: ParentGroupFacts;
  unknownTopLevelKeys: string[];
  nullFields: string[]; // known fields observed as null (primer's null-vs-empty note)
  schemaViolations: SchemaViolation[];
  timestampViolations: TimestampViolation[]; // non-"Z" / unparseable
  capacity: CapacityFacts;
  preConventionWeekPresent: boolean;
}

export interface Enumeration {
  // Tier 1 — config-backed
  programType: ValueCount[];
  signupType: ValueCount[];
  signupStrategy: ValueCount[];
  state: ValueCount[];
  // Tier 2 — array categoricals (distinct elements)
  tags: ValueCount[];
  genres: ValueCount[];
  styles: ValueCount[];
  languages: ValueCount[];
  ageGroups: ValueCount[];
  accessibilityValues: ValueCount[];
  // Tier 2 — scalar
  gameSystem: ValueCount[];
  // Tier 2 — day sanity (Europe/Helsinki)
  days: ValueCount[];
  // Tier 3 — structural / integrity
  structural: StructuralFacts;
}

class Counter {
  private map = new Map<string, { count: number; examples: string[] }>();

  add(value: string, title: string): void {
    let entry = this.map.get(value);
    if (!entry) {
      entry = { count: 0, examples: [] };
      this.map.set(value, entry);
    }
    entry.count += 1;
    if (entry.examples.length < MAX_EXAMPLES && !entry.examples.includes(title)) {
      entry.examples.push(title);
    }
  }

  toList(): ValueCount[] {
    return [...this.map.entries()]
      .map(([value, entry]) => ({ value, count: entry.count, examples: entry.examples }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
}

function isUtcTimestamp(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.endsWith("Z") &&
    !Number.isNaN(new Date(value).getTime())
  );
}

const REQUIRED_STRING_FIELDS = [
  "programItemId",
  "parentId",
  "title",
  "startTime",
  "endTime",
  "programType",
  "signupType",
  "state",
  "signupStrategy",
  "gameSystem",
] as const;
const REQUIRED_NUMBER_FIELDS = ["mins", "minAttendance", "maxAttendance"] as const;
const REQUIRED_BOOLEAN_FIELDS = ["revolvingDoor"] as const;
const REQUIRED_ARRAY_FIELDS = [
  "tags",
  "ageGroups",
  "genres",
  "styles",
  "languages",
  "accessibilityValues",
] as const;

function titleOf(record: Record<string, unknown>): string {
  const title = record.title;
  if (typeof title === "string" && title.trim() !== "") return title;
  const id = record.programItemId;
  return typeof id === "string" ? id : "(unknown)";
}

function collectSchemaViolations(
  record: Record<string, unknown>,
  slug: string,
  nullFields: Set<string>,
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  const check = (field: string, expected: string, ok: (v: unknown) => boolean) => {
    if (!(field in record)) {
      violations.push({ slug, field, kind: "missing", expected });
      return;
    }
    const value = record[field];
    if (value === null) {
      nullFields.add(field);
      violations.push({ slug, field, kind: "null", expected });
      return;
    }
    if (!ok(value)) {
      violations.push({ slug, field, kind: "wrongType", expected });
    }
  };

  for (const field of REQUIRED_STRING_FIELDS) {
    check(field, "string", (v) => typeof v === "string");
  }
  for (const field of REQUIRED_NUMBER_FIELDS) {
    check(field, "number", (v) => typeof v === "number" && !Number.isNaN(v));
  }
  for (const field of REQUIRED_BOOLEAN_FIELDS) {
    check(field, "boolean", (v) => typeof v === "boolean");
  }
  for (const field of REQUIRED_ARRAY_FIELDS) {
    check(field, "string[]", (v) => Array.isArray(v));
  }
  return violations;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function scalarString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function enumerate(items: ProjectedItem[]): Enumeration {
  const programType = new Counter();
  const signupType = new Counter();
  const signupStrategy = new Counter();
  const state = new Counter();
  const gameSystem = new Counter();
  const days = new Counter();

  const arrayCounters: Record<string, Counter> = {
    tags: new Counter(),
    genres: new Counter(),
    styles: new Counter(),
    languages: new Counter(),
    ageGroups: new Counter(),
    accessibilityValues: new Counter(),
  };

  const idCounts = new Map<string, number>();
  const parentGroupSizes = new Map<string, number>();
  let emptyParentIdCount = 0;
  let selfParentCount = 0;

  const unknownKeys = new Set<string>();
  const nullFields = new Set<string>();
  const schemaViolations: SchemaViolation[] = [];
  const timestampViolations: TimestampViolation[] = [];

  let konstiItemCount = 0;
  let nonPositiveMaxAttendance = 0;
  let overbooked = 0;
  let preConventionWeekPresent = false;

  const knownKeySet = new Set<string>(KNOWN_PROGRAM_ITEM_KEYS);

  for (const item of items) {
    // programItem carries no PII; treat loosely for structural inspection.
    const record = item.programItem as unknown as Record<string, unknown>;
    const slug = typeof record.programItemId === "string" ? record.programItemId : "(unknown)";
    const title = titleOf(record);

    // Tier 3: unknown top-level keys.
    for (const key of Object.keys(record)) {
      if (!knownKeySet.has(key)) unknownKeys.add(key);
    }

    // Tier 3: schema violations (missing / null / wrong type).
    schemaViolations.push(...collectSchemaViolations(record, slug, nullFields));

    // Tier 3: identity + grouping (self-parenting is the normal standalone marker).
    idCounts.set(slug, (idCounts.get(slug) ?? 0) + 1);
    const parentId = scalarString(record.parentId);
    if (parentId === "") emptyParentIdCount += 1;
    if (parentId === slug) selfParentCount += 1;
    const groupKey = parentId !== "" ? parentId : slug;
    parentGroupSizes.set(groupKey, (parentGroupSizes.get(groupKey) ?? 0) + 1);

    // Tier 3: timestamps must be UTC ISO-8601 ending in "Z".
    for (const field of ["startTime", "endTime"] as const) {
      const value = record[field];
      if (!isUtcTimestamp(value)) {
        timestampViolations.push({ slug, field, value: scalarString(value) });
      }
    }

    // Tier 1 scalars (skip empties — emptiness is a structural concern, not a value).
    const pType = scalarString(record.programType);
    if (pType !== "") programType.add(pType, title);
    const sType = scalarString(record.signupType);
    if (sType !== "") signupType.add(sType, title);
    const sStrategy = scalarString(record.signupStrategy);
    if (sStrategy !== "") signupStrategy.add(sStrategy, title);
    const st = scalarString(record.state);
    if (st !== "") state.add(st, title);

    // Tier 2 scalar gameSystem.
    const gs = scalarString(record.gameSystem);
    if (gs !== "") gameSystem.add(gs, title);

    // Tier 2 arrays (distinct elements).
    for (const field of TIER2_ARRAY_FIELDS) {
      for (const element of stringArray(record[field])) {
        if (element !== "") arrayCounters[field].add(element, title);
      }
    }
    if (stringArray(record.tags).includes(PRE_CONVENTION_WEEK_TAG)) {
      preConventionWeekPresent = true;
    }

    // Tier 2 day sanity (only for valid UTC startTimes).
    if (isUtcTimestamp(record.startTime)) {
      const day = helsinkiDay(record.startTime as string);
      if (day) days.add(day, title);
    }

    // Tier 3 capacity facts — konsti only, diagnostics only (never a finding).
    if (sType === "konsti") {
      konstiItemCount += 1;
      const maxAttendance =
        typeof record.maxAttendance === "number" ? record.maxAttendance : 0;
      if (maxAttendance <= 0) nonPositiveMaxAttendance += 1;
      if (item.userCount > maxAttendance) overbooked += 1;
    }
  }

  const duplicateProgramItemIds = [...idCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();

  const groupSizeValues = [...parentGroupSizes.values()];
  const largestGroupSize = groupSizeValues.length ? Math.max(...groupSizeValues) : 0;
  const singletonGroupCount = groupSizeValues.filter((n) => n === 1).length;

  return {
    programType: programType.toList(),
    signupType: signupType.toList(),
    signupStrategy: signupStrategy.toList(),
    state: state.toList(),
    tags: arrayCounters.tags.toList(),
    genres: arrayCounters.genres.toList(),
    styles: arrayCounters.styles.toList(),
    languages: arrayCounters.languages.toList(),
    ageGroups: arrayCounters.ageGroups.toList(),
    accessibilityValues: arrayCounters.accessibilityValues.toList(),
    gameSystem: gameSystem.toList(),
    days: days.toList(),
    structural: {
      itemCount: items.length,
      distinctProgramItemIds: idCounts.size,
      duplicateProgramItemIds,
      parentGroups: {
        emptyParentIdCount,
        selfParentCount,
        groupCount: parentGroupSizes.size,
        singletonGroupCount,
        largestGroupSize,
      },
      unknownTopLevelKeys: [...unknownKeys].sort(),
      nullFields: [...nullFields].sort(),
      schemaViolations,
      timestampViolations,
      capacity: { konstiItemCount, nonPositiveMaxAttendance, overbooked },
      preConventionWeekPresent,
    },
  };
}
