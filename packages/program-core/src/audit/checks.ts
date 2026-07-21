/**
 * Pure diff-against-config core (plan §2, §4).
 *
 * `check(enumeration, config)` produces typed `Finding[]`. It is PURE — it NEVER
 * decides what to do about a finding. The caller (CLI / data job) owns exit policy.
 *
 * Two-tier severity (plan §4):
 *  - "hard": structural drift or privacy failure — must never overwrite last-good data.
 *  - "warn": an unreviewed-but-fail-safe categorical value. Loud but non-fatal in
 *    production: an unknown programType is simply excluded (not on the gaming
 *    allowlist); an unmapped signup type degrades to the generic physical fallback.
 *    Halting the whole feed mid-convention over a benign new genre tag would be worse
 *    than shipping it, so warns do not gate the live data job.
 *
 * Capacity anomalies (non-positive maxAttendance, overbooked) are DIAGNOSTICS ONLY
 * (plan §2) — reported as structural facts, never emitted as findings.
 */

import {
  GAMING_PROGRAM_TYPES,
  NON_GAMING_PROGRAM_TYPES,
} from "../config/gaming.ts";
import {
  NON_PHYSICAL_SIGNUP_TYPES,
  PHYSICAL_SIGNUP_TYPES,
  type PhysicalSignupLocation,
} from "../config/signup.ts";
import {
  KNOWN_SIGNUP_STRATEGIES,
  KNOWN_STATES,
  KNOWN_TIER2_VALUES,
  PRE_CONVENTION_WEEK_TAG,
  TIER2_ARRAY_FIELDS,
} from "../config/taxonomy.ts";
import type { Enumeration, ValueCount } from "./enumerate.ts";

export type Severity = "hard" | "warn";

export interface Finding {
  severity: Severity;
  code: string;
  message: string; // actionable: names exactly which config file to edit
  detail?: unknown; // e.g. the offending value + an example item slug
}

export interface AuditConfig {
  gamingProgramTypes: readonly string[];
  nonGamingProgramTypes: readonly string[];
  physicalSignupTypes: Record<string, PhysicalSignupLocation>;
  nonPhysicalSignupTypes: readonly string[];
  knownSignupStrategies: readonly string[];
  knownStates: readonly string[];
  knownTier2Values: {
    tags: readonly string[];
    genres: readonly string[];
    styles: readonly string[];
    languages: readonly string[];
    ageGroups: readonly string[];
    accessibilityValues: readonly string[];
  };
  preConventionWeekTag: string;
}

export const DEFAULT_CONFIG: AuditConfig = {
  gamingProgramTypes: GAMING_PROGRAM_TYPES,
  nonGamingProgramTypes: NON_GAMING_PROGRAM_TYPES,
  physicalSignupTypes: PHYSICAL_SIGNUP_TYPES,
  nonPhysicalSignupTypes: NON_PHYSICAL_SIGNUP_TYPES,
  knownSignupStrategies: KNOWN_SIGNUP_STRATEGIES,
  knownStates: KNOWN_STATES,
  knownTier2Values: KNOWN_TIER2_VALUES,
  preConventionWeekTag: PRE_CONVENTION_WEEK_TAG,
};

const exampleOf = (vc: ValueCount): string | undefined => vc.examples[0];

/** Values present in the enumeration for a categorical (excludes empties by construction). */
function observedValues(list: ValueCount[]): Set<string> {
  return new Set(list.map((vc) => vc.value));
}

/** warn for each configured value that is no longer observed (stale config). */
function staleConfigFindings(
  configured: readonly string[],
  observed: Set<string>,
  code: string,
  configFile: string,
): Finding[] {
  return configured
    .filter((value) => !observed.has(value))
    .map((value) => ({
      severity: "warn" as const,
      code,
      message: `Configured value "${value}" is no longer observed. Remove it from ${configFile} if it is gone for good.`,
      detail: { value },
    }));
}

export function check(
  enumeration: Enumeration,
  config: AuditConfig = DEFAULT_CONFIG,
): Finding[] {
  const findings: Finding[] = [];
  const s = enumeration.structural;

  // ---- Tier 1: config-backed categoricals ----

  // programType must be classified gaming or explicitly non-gaming.
  const gamingSet = new Set(config.gamingProgramTypes);
  const nonGamingSet = new Set(config.nonGamingProgramTypes);
  for (const vc of enumeration.programType) {
    if (!gamingSet.has(vc.value) && !nonGamingSet.has(vc.value)) {
      findings.push({
        severity: "warn",
        code: "UNREVIEWED_PROGRAM_TYPE",
        message: `Program type "${vc.value}" is in neither GAMING_PROGRAM_TYPES nor NON_GAMING_PROGRAM_TYPES. Classify it in src/config/gaming.ts (it is currently excluded from the finder).`,
        detail: { value: vc.value, count: vc.count, exampleTitle: exampleOf(vc) },
      });
    }
  }
  const observedProgramTypes = observedValues(enumeration.programType);
  findings.push(
    ...staleConfigFindings(
      config.gamingProgramTypes,
      observedProgramTypes,
      "STALE_GAMING_PROGRAM_TYPE",
      "src/config/gaming.ts",
    ),
    ...staleConfigFindings(
      config.nonGamingProgramTypes,
      observedProgramTypes,
      "STALE_NON_GAMING_PROGRAM_TYPE",
      "src/config/gaming.ts",
    ),
  );

  // signupType: everything other than non-physical (notRequired/konsti) must map.
  const nonPhysical = new Set(config.nonPhysicalSignupTypes);
  for (const vc of enumeration.signupType) {
    if (nonPhysical.has(vc.value)) continue;
    if (!Object.prototype.hasOwnProperty.call(config.physicalSignupTypes, vc.value)) {
      findings.push({
        severity: "warn",
        code: "UNMAPPED_SIGNUP_TYPE",
        message: `Signup type "${vc.value}" has no PHYSICAL_SIGNUP_TYPES entry. Add its location to src/config/signup.ts (it currently degrades to the generic "see the info desk" fallback).`,
        detail: { value: vc.value, count: vc.count, exampleTitle: exampleOf(vc) },
      });
    }
  }
  const observedSignupTypes = observedValues(enumeration.signupType);
  findings.push(
    ...staleConfigFindings(
      Object.keys(config.physicalSignupTypes),
      observedSignupTypes,
      "STALE_PHYSICAL_SIGNUP_TYPE",
      "src/config/signup.ts",
    ),
  );

  // signupStrategy: a new value must not be silently treated as `direct`.
  const knownStrategies = new Set(config.knownSignupStrategies);
  for (const vc of enumeration.signupStrategy) {
    if (!knownStrategies.has(vc.value)) {
      findings.push({
        severity: "warn",
        code: "NEW_SIGNUP_STRATEGY",
        message: `Signup strategy "${vc.value}" is unknown. Add it to KNOWN_SIGNUP_STRATEGIES in src/config/taxonomy.ts and confirm it is not silently treated as "direct".`,
        detail: { value: vc.value, count: vc.count, exampleTitle: exampleOf(vc) },
      });
    }
  }
  findings.push(
    ...staleConfigFindings(
      config.knownSignupStrategies,
      observedValues(enumeration.signupStrategy),
      "STALE_SIGNUP_STRATEGY",
      "src/config/taxonomy.ts",
    ),
  );

  // state: cancellation derives from this; a new state must surface.
  const knownStates = new Set(config.knownStates);
  for (const vc of enumeration.state) {
    if (!knownStates.has(vc.value)) {
      findings.push({
        severity: "warn",
        code: "NEW_STATE",
        message: `State "${vc.value}" is unknown. Add it to KNOWN_STATES in src/config/taxonomy.ts and check whether it affects cancellation handling.`,
        detail: { value: vc.value, count: vc.count, exampleTitle: exampleOf(vc) },
      });
    }
  }
  findings.push(
    ...staleConfigFindings(
      config.knownStates,
      observedValues(enumeration.state),
      "STALE_STATE",
      "src/config/taxonomy.ts",
    ),
  );

  // ---- Tier 2: warn on new element vs the known-values snapshot ----
  for (const field of TIER2_ARRAY_FIELDS) {
    const known = new Set(config.knownTier2Values[field]);
    for (const vc of enumeration[field]) {
      if (!known.has(vc.value)) {
        findings.push({
          severity: "warn",
          code: "NEW_TIER2_VALUE",
          message: `New ${field} value "${vc.value}". Add it to KNOWN_TIER2_VALUES.${field} in src/config/taxonomy.ts once reviewed.`,
          detail: { field, value: vc.value, count: vc.count, exampleTitle: exampleOf(vc) },
        });
      }
    }
  }
  // gameSystem is intentionally NOT gated (free text — enumerated in the report only).

  // preConventionWeek tag must still appear (isPreConventionWeek depends on it).
  if (!s.preConventionWeekPresent) {
    findings.push({
      severity: "warn",
      code: "MISSING_PRE_CONVENTION_WEEK_TAG",
      message: `The tag "${config.preConventionWeekTag}" was not observed. isPreConventionWeek depends on this exact string; confirm the data still uses it (may be legitimately absent before pre-con week is scheduled).`,
    });
  }

  // ---- Tier 3: structural / integrity (hard) ----
  if (s.duplicateProgramItemIds.length > 0) {
    findings.push({
      severity: "hard",
      code: "DUPLICATE_PROGRAM_ITEM_ID",
      message: `programItemId is assumed unique but ${s.duplicateProgramItemIds.length} id(s) repeat. This breaks canonical identity — do not publish.`,
      detail: { ids: s.duplicateProgramItemIds },
    });
  }
  // NOTE: parentId === programItemId is deliberately NOT a finding. Live data shows it
  // is Konsti's normal marker for a standalone (single-session) item; it is reported as
  // a structural fact only.
  if (s.unknownTopLevelKeys.length > 0) {
    findings.push({
      severity: "hard",
      code: "UNKNOWN_TOP_LEVEL_KEY",
      message: `Unknown top-level programItem key(s): ${s.unknownTopLevelKeys.join(", ")}. The wire shape drifted; review src/konsti/schema.ts before publishing.`,
      detail: { keys: s.unknownTopLevelKeys },
    });
  }
  if (s.schemaViolations.length > 0) {
    findings.push({
      severity: "hard",
      code: "SCHEMA_VIOLATION",
      message: `${s.schemaViolations.length} required-field violation(s) (missing / null / wrong scalar type). A null or wrong-typed required field is structural drift — do not publish.`,
      detail: { violations: s.schemaViolations.slice(0, 20) },
    });
  }
  if (s.timestampViolations.length > 0) {
    findings.push({
      severity: "hard",
      code: "NON_UTC_TIMESTAMP",
      message: `${s.timestampViolations.length} timestamp(s) are not UTC ISO-8601 ending in "Z". Time-window logic assumes UTC instants — do not publish.`,
      detail: { violations: s.timestampViolations.slice(0, 20) },
    });
  }

  // ---- Privacy (hard): no PII may survive into the enumeration ----
  findings.push(...privacyFindings(enumeration));

  return findings;
}

const PII_KEYS = ["username", "signupMessage"] as const;

/**
 * Scan a serialized blob for PII key names. Exported so the caller can also run it
 * over the rendered report string (plan §6) — belt-and-suspenders on top of the
 * fetch-layer projection that already strips `users[]`.
 */
export function scanForPii(serialized: string, source: string): Finding[] {
  const leaked = PII_KEYS.filter((key) => serialized.includes(key));
  if (leaked.length === 0) return [];
  return [
    {
      severity: "hard",
      code: "PRIVACY_LEAK",
      message: `PII key(s) [${leaked.join(", ")}] found in ${source}. Raw users must be projected to a count in src/konsti/fetch.ts and never serialized.`,
      detail: { source, leaked },
    },
  ];
}

function privacyFindings(enumeration: Enumeration): Finding[] {
  return scanForPii(JSON.stringify(enumeration), "enumeration");
}
