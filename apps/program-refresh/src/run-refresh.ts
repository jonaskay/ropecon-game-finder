import { buildProgram, classifyWithDiagnostic, projectResponse, validateProgramData, type ProgramData } from "@ropecon/program-core";
import type { SafeLogger } from "./safe-logging.ts";
import { GenerationCollisionError, type ProgramStorage } from "./storage.ts";

export interface RefreshDependencies {
  fetchPayload: () => Promise<unknown>;
  storage: ProgramStorage;
  logger: SafeLogger;
  now: () => Date;
  executionId: string;
  maxAttempts?: number;
}

function published(contents: string): ProgramData | null {
  try { return validateProgramData(JSON.parse(contents)); } catch { return null; }
}

export async function runRefresh(deps: RefreshDependencies): Promise<{ written: boolean; generation?: number }> {
  const { fetchPayload, storage, logger, now, executionId, maxAttempts = 3 } = deps;
  const items = projectResponse(await fetchPayload());
  const generatedAt = now().toISOString();
  const outcome = buildProgram(items, generatedAt);
  const warnings = outcome.findings.filter(f => f.severity === "warn");
  for (const finding of warnings) logger.log("warn", "audit_finding", { executionId, code: finding.code });
  if (!outcome.ok || !outcome.programData) {
    logger.log("error", "publication_blocked", { executionId, hardFindings: outcome.findings.filter(f => f.severity === "hard").length });
    throw new Error("Program data failed structural or privacy checks");
  }

  // Venue-aware map links (issue-01, §7): surface any location we cannot classify as
  // on-site or off-site so a human reviews it before it is guessed onto the hall map.
  // A warn, never a gate — an unreviewed venue simply renders without a con-map link.
  // Dedup by normalized name so each unknown venue is logged once, not per session.
  const seenUnknownVenues = new Set<string>();
  for (const item of outcome.programData.items) {
    classifyWithDiagnostic(item.location, (location, normalized) => {
      if (seenUnknownVenues.has(normalized)) return;
      seenUnknownVenues.add(normalized);
      logger.log("warn", "unknown_venue", { executionId, location, normalized });
    });
  }

  const serialized = `${JSON.stringify(outcome.programData)}\n`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const current = await storage.read();
    const currentData = current ? published(current.contents) : null;
    if (currentData && Date.parse(currentData.generatedAt) >= Date.parse(generatedAt)) {
      logger.log("info", "snapshot_already_current", { executionId, attempt, generation: current!.generation });
      return { written: false, generation: current!.generation };
    }
    try {
      const generation = await storage.write(serialized, current?.generation ?? 0);
      logger.log("info", "snapshot_published", { executionId, attempt, generation, itemCount: outcome.programData.items.length, warningCount: warnings.length, generatedAt });
      return { written: true, generation };
    } catch (error) {
      if (!(error instanceof GenerationCollisionError) || attempt === maxAttempts) throw error;
      logger.log("warn", "generation_collision", { executionId, attempt });
    }
  }
  throw new Error("Publication retry limit exceeded");
}
