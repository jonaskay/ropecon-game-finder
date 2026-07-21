/**
 * The shared audit seam (plan §1, §3, §5).
 *
 * `runAudit(items)` composes the pure core: enumerate -> check. It returns everything
 * the three run contexts need and, crucially, decides NOTHING about exit codes or
 * writes — that policy lives in `scripts/audit-konsti.ts` and (later) the data job.
 *
 * ── DATA-JOB CALL-ORDER CONTRACT (plan §5, context 3) ───────────────────────────────
 * The future ~30-min server-side data job MUST use this seam as follows:
 *
 *   const items = await fetchProjectedItems();      // raw users[] discarded in fetch.ts
 *   // structural validate happened inside fetchProjectedItems (assertProgramItemsResponse)
 *   const { enumeration, findings, hasHardFailure } = runAudit(items);
 *
 *   if (hasHardFailure) {
 *     // DO NOT write. Keep last-good program.json + its old generatedAt. Alert ops.
 *     return;
 *   }
 *   // else:
 *   logWarnings(findings);                          // job log / ops channel, never program.json
 *   const normalised = normalise(items);            // (out of scope here)
 *   assertNoPii(JSON.stringify(normalised));        // final belt-and-suspenders
 *   atomicWrite("program.json", normalised);        // then stamp a fresh generatedAt
 *
 * A `warn` NEVER blocks publication: an unknown programType is simply excluded and an
 * unmapped signup type degrades to the generic physical fallback. Only `hasHardFailure`
 * (structural drift / privacy) protects last-good data. Keep all audit diagnostics in
 * logs — never in the published program.json.
 * ────────────────────────────────────────────────────────────────────────────────────
 */

import type { ProjectedItem } from "../konsti/schema.ts";
import { enumerate, type Enumeration } from "./enumerate.ts";
import { check, type AuditConfig, type Finding, DEFAULT_CONFIG } from "./checks.ts";

export interface AuditResult {
  enumeration: Enumeration;
  findings: Finding[];
  hasHardFailure: boolean;
}

export function runAudit(
  items: ProjectedItem[],
  config: AuditConfig = DEFAULT_CONFIG,
): AuditResult {
  const enumeration = enumerate(items);
  const findings = check(enumeration, config);
  const hasHardFailure = findings.some((f) => f.severity === "hard");
  return { enumeration, findings, hasHardFailure };
}
