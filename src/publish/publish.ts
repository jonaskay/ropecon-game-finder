/**
 * Privacy-safe publication gate (handoff Step 4; the data-job call-order contract at the
 * top of `src/audit/run.ts`).
 *
 * `buildProgram` is the PURE decision core: given projected items and a caller-supplied
 * `generatedAt`, it runs the audit, and only if the data is structurally and
 * privacy-clean does it normalise, wrap, and return a `ProgramData` marked safe to write.
 * It performs NO I/O and reads NO clock, so the write policy (atomic rename, exit codes,
 * leaving last-good untouched) can live entirely in the impure script.
 *
 * Order of operations (follows the run.ts contract exactly):
 *   runAudit(items)
 *     → hasHardFailure? do NOT write; ok=false (caller keeps last-good + its old generatedAt)
 *     → else normalise(items) → toProgramData
 *        → scanForPii(JSON.stringify(programData)) must be empty, else ok=false (belt-and-
 *          suspenders on top of the fetch-layer projection)
 *        → ok=true
 *
 * Warnings NEVER block the write: an unknown programType is excluded by `normalise` and an
 * unmapped signup type degrades to the generic physical fallback. Only a hard failure
 * (structural drift / privacy) protects last-good data.
 */

import type { ProjectedItem } from "../konsti/schema.ts";
import { runAudit } from "../audit/run.ts";
import { scanForPii, type Finding } from "../audit/checks.ts";
import type { ProgramData } from "../normalise/types.ts";
import { toProgramData } from "./program-data.ts";

export interface BuildOutcome {
  /** Safe to write? True only when there is no hard failure and no PII leak. */
  ok: boolean;
  /** The envelope to publish, present iff `ok`. Null when a publish must be skipped. */
  programData: ProgramData | null;
  /** All audit findings plus any privacy leak found in the serialised envelope. */
  findings: Finding[];
  /** True when a structural/privacy hard failure blocked the write. */
  hasHardFailure: boolean;
}

export function buildProgram(items: ProjectedItem[], generatedAt: string): BuildOutcome {
  const { findings, hasHardFailure } = runAudit(items);

  // Hard failure → keep last-good; the caller must not write.
  if (hasHardFailure) {
    return { ok: false, programData: null, findings, hasHardFailure: true };
  }

  // Structurally clean: build the envelope, then assert no PII survived into it.
  const programData = toProgramData(items, generatedAt);
  const piiFindings = scanForPii(JSON.stringify(programData), "program.json");
  if (piiFindings.length > 0) {
    return {
      ok: false,
      programData: null,
      findings: [...findings, ...piiFindings],
      hasHardFailure: true,
    };
  }

  return { ok: true, programData, findings, hasHardFailure: false };
}
