import type { ProjectedItem } from "../konsti/schema.ts";
import {
  dimensionValues,
  hasDimensionValue,
  type KompassiSchedule,
  type KompassiScheduleItem,
} from "../kompassi/schema.ts";
import type {
  MergeFinding,
  MergeResult,
  MergedProgramItem,
  ReconciliationReport,
} from "./types.ts";

const KNOWN_DIMENSIONS = new Set([
  "age-group",
  "date",
  "form",
  "grouping",
  "inclusivity",
  "is-pre-convention-week",
  "konsti",
  "language",
  "registration",
  "room",
  "scheduled",
  "state",
  "topic",
  "type",
]);

const KNOWN_REGISTRATIONS = new Set(["not-required", "konsti", "ropelarp"]);

function duplicateValues(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

function registrationKey(item: KompassiScheduleItem): string {
  const values = [...new Set(dimensionValues(item, "registration"))].sort();
  return values.length === 0 ? "missing" : values.join("+");
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function canonicalKonstiSignupType(value: string): string {
  return value === "notRequired" ? "not-required" : value;
}

function sameInstant(left: string, right: string): boolean {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function registrationConflicts(item: KompassiScheduleItem, konsti: ProjectedItem): boolean {
  const registrations = [...new Set(dimensionValues(item, "registration"))];
  return registrations.length === 1 &&
    registrations[0] !== canonicalKonstiSignupType(konsti.programItem.signupType);
}

function addConflictFindings(
  findings: MergeFinding[],
  conflicts: ReconciliationReport["conflicts"],
): void {
  for (const field of Object.keys(conflicts) as Array<keyof typeof conflicts>) {
    const count = conflicts[field];
    if (count > 0) {
      findings.push({
        severity: "warn",
        code: "MERGE_FIELD_CONFLICT",
        field,
        count,
      });
    }
  }
}

function auditKompassi(
  scheduleItems: readonly KompassiScheduleItem[],
  findings: MergeFinding[],
): void {
  const duplicateSlugs = duplicateValues(scheduleItems.map(item => item.slug));
  if (duplicateSlugs.length > 0) {
    findings.push({
      severity: "hard",
      code: "DUPLICATE_KOMPASSI_SLUG",
      count: duplicateSlugs.length,
    });
  }

  const invalidTimeCount = scheduleItems.filter(item => {
    const start = Date.parse(item.startTime);
    const end = Date.parse(item.endTime);
    return !Number.isFinite(start) || !Number.isFinite(end) || end <= start;
  }).length;
  if (invalidTimeCount > 0) {
    findings.push({
      severity: "hard",
      code: "INVALID_KOMPASSI_TIME",
      count: invalidTimeCount,
    });
  }

  const unknownDimensions = new Set<string>();
  const unknownRegistrations = new Set<string>();
  let missingRegistration = 0;
  let contradictoryRegistration = 0;

  for (const item of scheduleItems) {
    for (const dimension of Object.keys(item.cachedDimensions)) {
      if (!KNOWN_DIMENSIONS.has(dimension)) unknownDimensions.add(dimension);
    }
    if (!hasDimensionValue(item, "type", "gaming")) continue;

    const registrations = [...new Set(dimensionValues(item, "registration"))];
    if (registrations.length === 0) missingRegistration += 1;
    if (registrations.length > 1) contradictoryRegistration += 1;
    for (const registration of registrations) {
      if (!KNOWN_REGISTRATIONS.has(registration)) unknownRegistrations.add(registration);
    }
  }

  if (unknownDimensions.size > 0) {
    findings.push({
      severity: "warn",
      code: "UNKNOWN_KOMPASSI_DIMENSION",
      count: unknownDimensions.size,
      values: [...unknownDimensions].sort(),
    });
  }
  if (unknownRegistrations.size > 0) {
    findings.push({
      severity: "warn",
      code: "UNKNOWN_REGISTRATION_VALUE",
      count: unknownRegistrations.size,
      values: [...unknownRegistrations].sort(),
    });
  }
  if (missingRegistration > 0) {
    findings.push({
      severity: "warn",
      code: "MISSING_REGISTRATION",
      count: missingRegistration,
    });
  }
  if (contradictoryRegistration > 0) {
    findings.push({
      severity: "warn",
      code: "CONTRADICTORY_REGISTRATION",
      count: contradictoryRegistration,
    });
  }
}

/**
 * Kompassi is the left-hand inventory. Konsti can enrich an exact slug/ID match,
 * but can never create an independently published item.
 */
export function mergeProgramSources(
  kompassi: KompassiSchedule,
  konstiItems: readonly ProjectedItem[],
): MergeResult {
  const findings: MergeFinding[] = [];
  auditKompassi(kompassi.scheduleItems, findings);

  const duplicateKonstiIds = duplicateValues(
    konstiItems.map(item => item.programItem.programItemId),
  );
  if (duplicateKonstiIds.length > 0) {
    findings.push({
      severity: "hard",
      code: "DUPLICATE_KONSTI_ID",
      count: duplicateKonstiIds.length,
    });
  }

  // Preserve the first entry. Duplicates are a hard finding, so the result cannot
  // publish, but deterministic indexing still makes the diagnostics testable.
  const konstiById = new Map<string, ProjectedItem>();
  for (const item of konstiItems) {
    if (!konstiById.has(item.programItem.programItemId)) {
      konstiById.set(item.programItem.programItemId, item);
    }
  }

  const gamingItems = kompassi.scheduleItems.filter(item =>
    hasDimensionValue(item, "type", "gaming")
  );
  const mergedItems: MergedProgramItem[] = gamingItems.map(scheduleItem => ({
    scheduleItem,
    konsti: konstiById.get(scheduleItem.slug) ?? null,
  }));

  const gamingSlugs = new Set(gamingItems.map(item => item.slug));
  const registrations = { matched: {}, unmatched: {} } as ReconciliationReport["registrations"];
  const conflicts: ReconciliationReport["conflicts"] = {
    title: 0,
    startTime: 0,
    location: 0,
    cancellation: 0,
    signupType: 0,
  };

  for (const item of mergedItems) {
    increment(item.konsti ? registrations.matched : registrations.unmatched, registrationKey(item.scheduleItem));
    if (!item.konsti) continue;

    const source = item.scheduleItem;
    const enrichment = item.konsti.programItem;
    if (source.title !== enrichment.title) conflicts.title += 1;
    if (!sameInstant(source.startTime, enrichment.startTime)) conflicts.startTime += 1;
    if (source.location !== enrichment.location) conflicts.location += 1;
    if (source.isCancelled !== (enrichment.state === "cancelled")) conflicts.cancellation += 1;
    if (registrationConflicts(source, item.konsti)) conflicts.signupType += 1;
  }

  const matchedItems = mergedItems.filter(item => item.konsti !== null).length;
  const konstiOrphans = konstiItems.filter(
    item => !gamingSlugs.has(item.programItem.programItemId),
  ).length;
  if (konstiOrphans > 0) {
    findings.push({
      severity: "warn",
      code: "KONSTI_ORPHANS",
      count: konstiOrphans,
    });
  }
  if (konstiItems.length > 0 && gamingItems.length > 0 && matchedItems === 0) {
    findings.push({
      severity: "hard",
      code: "ZERO_MATCHES",
      count: 1,
    });
  }
  addConflictFindings(findings, conflicts);

  const report: ReconciliationReport = {
    kompassiItems: kompassi.scheduleItems.length,
    kompassiGamingItems: gamingItems.length,
    konstiItems: konstiItems.length,
    matchedItems,
    unmatchedKompassiItems: gamingItems.length - matchedItems,
    konstiOrphans,
    registrations,
    conflicts,
  };

  return {
    items: mergedItems,
    report,
    findings,
    hasHardFailure: findings.some(finding => finding.severity === "hard"),
  };
}
