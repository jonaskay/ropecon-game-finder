import { runAudit } from "../audit/run.ts";
import { scanForPii, type Finding } from "../audit/checks.ts";
import type { ProjectedItem } from "../konsti/schema.ts";
import type { KompassiSchedule } from "../kompassi/schema.ts";
import { mergeProgramSources } from "../merge/merge.ts";
import type {
  MergeFinding,
  ReconciliationReport,
} from "../merge/types.ts";
import type { ProgramDataV2 } from "../normalise/types.ts";
import {
  toProgramDataV2,
  type ProgramDataV2Metadata,
} from "./program-data-v2.ts";

export type CombinedFinding = Finding | MergeFinding;

export interface CombinedBuildOutcome {
  ok: boolean;
  programData: ProgramDataV2 | null;
  findings: CombinedFinding[];
  hasHardFailure: boolean;
  reconciliation: ReconciliationReport;
}

/**
 * Pure combined-source publication gate.
 *
 * Konsti's existing structural/taxonomy audit stays independent from the
 * Kompassi inventory and reconciliation audit. Either hard-failure class, or
 * the final serialized PII scan, prevents an envelope from being returned.
 */
export function buildCombinedProgram(
  kompassi: KompassiSchedule,
  konstiItems: readonly ProjectedItem[],
  metadata: ProgramDataV2Metadata,
): CombinedBuildOutcome {
  const konstiAudit = runAudit([...konstiItems]);
  const merge = mergeProgramSources(kompassi, konstiItems);
  const findings: CombinedFinding[] = [...konstiAudit.findings, ...merge.findings];
  const hasHardFailure = konstiAudit.hasHardFailure || merge.hasHardFailure;

  if (hasHardFailure) {
    return {
      ok: false,
      programData: null,
      findings,
      hasHardFailure: true,
      reconciliation: merge.report,
    };
  }

  const programData = toProgramDataV2(merge.items, metadata);
  const piiFindings = scanForPii(JSON.stringify(programData), "program.json");
  if (piiFindings.length > 0) {
    return {
      ok: false,
      programData: null,
      findings: [...findings, ...piiFindings],
      hasHardFailure: true,
      reconciliation: merge.report,
    };
  }

  return {
    ok: true,
    programData,
    findings,
    hasHardFailure: false,
    reconciliation: merge.report,
  };
}
