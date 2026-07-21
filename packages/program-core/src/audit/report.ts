/**
 * Pure report renderer (plan §1 "report mode", §6).
 *
 * `renderReport(enumeration, findings)` returns a human-readable string: every
 * distinct categorical value with counts + example titles, plus Tier-3 structural
 * facts, plus any findings. It is PURE — no console, no fetch. The output must be
 * clean enough to paste back into a chat to make config decisions, and must contain
 * no PII (the enumeration it renders is already PII-free by construction).
 */

import type { Enumeration, ValueCount } from "./enumerate.ts";
import type { Finding } from "./checks.ts";

function section(title: string, list: ValueCount[]): string {
  const lines = [`## ${title} (${list.length} distinct)`];
  if (list.length === 0) {
    lines.push("  (none observed)");
    return lines.join("\n");
  }
  for (const vc of list) {
    const examples = vc.examples.length ? `  e.g. ${vc.examples.join(" · ")}` : "";
    lines.push(`  ${String(vc.count).padStart(5)} × ${vc.value}${examples}`);
  }
  return lines.join("\n");
}

function structuralSection(enumeration: Enumeration): string {
  const s = enumeration.structural;
  const g = s.parentGroups;
  const c = s.capacity;
  return [
    "## Structural facts (Tier 3)",
    `  items: ${s.itemCount}`,
    `  distinct programItemId: ${s.distinctProgramItemIds} (duplicates: ${s.duplicateProgramItemIds.length})`,
    `  parentId grouping: ${g.groupCount} group(s) (${g.singletonGroupCount} single-session), ` +
      `largest group ${g.largestGroupSize}, self-parent ${g.selfParentCount}, empty parentId ${g.emptyParentIdCount}`,
    `  unknown top-level keys: ${s.unknownTopLevelKeys.length ? s.unknownTopLevelKeys.join(", ") : "none"}`,
    `  null fields: ${s.nullFields.length ? s.nullFields.join(", ") : "none"}`,
    `  schema violations: ${s.schemaViolations.length}`,
    `  non-UTC timestamps: ${s.timestampViolations.length}`,
    `  konsti capacity: ${c.konstiItemCount} konsti item(s), ` +
      `${c.nonPositiveMaxAttendance} with non-positive maxAttendance, ${c.overbooked} overbooked (diagnostics only)`,
    `  preConventionWeek tag present: ${s.preConventionWeekPresent ? "yes" : "NO"}`,
  ].join("\n");
}

function findingsSection(findings: Finding[]): string {
  if (findings.length === 0) return "## Findings\n  none — all values reviewed, no structural/privacy problems.";
  const hard = findings.filter((f) => f.severity === "hard");
  const warn = findings.filter((f) => f.severity === "warn");
  const lines = [`## Findings (${hard.length} hard, ${warn.length} warn)`];
  for (const f of findings) {
    const tag = f.severity === "hard" ? "HARD" : "warn";
    lines.push(`  [${tag}] ${f.code}: ${f.message}`);
  }
  return lines.join("\n");
}

export function renderReport(enumeration: Enumeration, findings: Finding[]): string {
  return [
    "# Konsti taxonomy audit report",
    "",
    "### Tier 1 — config-backed",
    section("programType", enumeration.programType),
    section("signupType", enumeration.signupType),
    section("signupStrategy", enumeration.signupStrategy),
    section("state", enumeration.state),
    "",
    "### Tier 2 — enumerate + warn-on-new",
    section("tags", enumeration.tags),
    section("genres", enumeration.genres),
    section("styles", enumeration.styles),
    section("languages", enumeration.languages),
    section("ageGroups", enumeration.ageGroups),
    section("accessibilityValues", enumeration.accessibilityValues),
    section("gameSystem", enumeration.gameSystem),
    section("day (Europe/Helsinki)", enumeration.days),
    "",
    "### Tier 3 — structural / integrity",
    structuralSection(enumeration),
    "",
    findingsSection(findings),
    "",
  ].join("\n");
}
