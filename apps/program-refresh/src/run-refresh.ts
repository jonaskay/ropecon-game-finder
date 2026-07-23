import {
  buildCombinedProgram,
  classifyWithDiagnostic,
  validateProgramData,
  validateProgramDataV2,
  type KompassiSchedule,
  type ProgramData,
  type ProgramDataV2,
  type ProjectedItem,
} from "@ropecon/program-core";
import type { SafeLogger } from "./safe-logging.ts";
import { GenerationCollisionError, type ProgramStorage } from "./storage.ts";

export interface RefreshDependencies {
  fetchKompassi: () => Promise<KompassiSchedule>;
  fetchKonsti: () => Promise<ProjectedItem[]>;
  kompassiEventSlug: string;
  storage: ProgramStorage;
  logger: SafeLogger;
  now: () => Date;
  executionId: string;
  maxAttempts?: number;
  monotonicNow?: () => number;
}

type PublishedData = ProgramData | ProgramDataV2;

function published(contents: string): PublishedData | null {
  try {
    const value: unknown = JSON.parse(contents);
    try {
      return validateProgramDataV2(value);
    } catch {
      return validateProgramData(value);
    }
  } catch {
    return null;
  }
}

async function fetchSource<T>(
  source: "kompassi" | "konsti",
  fetcher: () => Promise<T>,
  deps: Pick<RefreshDependencies, "executionId" | "logger" | "monotonicNow" | "now">,
): Promise<{ value: T; fetchedAt: string }> {
  const clock = deps.monotonicNow ?? Date.now;
  const startedAt = clock();
  try {
    const value = await fetcher();
    const durationMs = Math.max(0, Math.round(clock() - startedAt));
    const fetchedAt = deps.now().toISOString();
    deps.logger.log("info", "source_fetch_succeeded", {
      executionId: deps.executionId,
      source,
      durationMs,
    });
    return { value, fetchedAt };
  } catch (error) {
    const durationMs = Math.max(0, Math.round(clock() - startedAt));
    deps.logger.log("error", "source_fetch_failed", {
      executionId: deps.executionId,
      source,
      durationMs,
      errorCode: error instanceof Error ? error.name : "UnknownError",
    });
    throw error;
  }
}

export async function runRefresh(
  deps: RefreshDependencies,
): Promise<{ written: boolean; generation?: number }> {
  const {
    fetchKompassi,
    fetchKonsti,
    kompassiEventSlug,
    storage,
    logger,
    now,
    executionId,
    maxAttempts = 3,
  } = deps;

  // Start both requests before awaiting either. A failure from either source
  // aborts publication and leaves the last-good object untouched.
  const [kompassiFetch, konstiFetch] = await Promise.all([
    fetchSource("kompassi", fetchKompassi, deps),
    fetchSource("konsti", fetchKonsti, deps),
  ]);

  const generatedAt = now().toISOString();
  const outcome = buildCombinedProgram(kompassiFetch.value, konstiFetch.value, {
    generatedAt,
    kompassi: {
      eventSlug: kompassiEventSlug,
      fetchedAt: kompassiFetch.fetchedAt,
    },
    konsti: {
      fetchedAt: konstiFetch.fetchedAt,
    },
  });
  const warnings = outcome.findings.filter(finding => finding.severity === "warn");
  for (const finding of warnings) {
    logger.log("warn", "audit_finding", { executionId, code: finding.code });
  }

  const report = outcome.reconciliation;
  logger.log("info", "reconciliation_complete", {
    executionId,
    kompassiCount: report.kompassiItems,
    gamingCount: report.kompassiGamingItems,
    konstiCount: report.konstiItems,
    matchedCount: report.matchedItems,
    unmatchedCount: report.unmatchedKompassiItems,
    orphanCount: report.konstiOrphans,
  });

  if (!outcome.ok || !outcome.programData) {
    logger.log("error", "publication_blocked", {
      executionId,
      hardFindings: outcome.findings.filter(finding => finding.severity === "hard").length,
    });
    throw new Error("Program data failed structural, reconciliation, or privacy checks");
  }

  // Keep location values out of logs. Only the aggregate number of distinct
  // unclassified venues is operationally useful and privacy-safe.
  const unknownVenues = new Set<string>();
  for (const item of outcome.programData.items) {
    classifyWithDiagnostic(item.location, (_location, normalized) => {
      unknownVenues.add(normalized);
    });
  }
  if (unknownVenues.size > 0) {
    logger.log("warn", "unknown_venue_count", {
      executionId,
      count: unknownVenues.size,
    });
  }

  const serialized = `${JSON.stringify(outcome.programData)}\n`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const current = await storage.read();
    const currentData = current ? published(current.contents) : null;
    if (currentData && Date.parse(currentData.generatedAt) >= Date.parse(generatedAt)) {
      logger.log("info", "snapshot_already_current", {
        executionId,
        attempt,
        generation: current!.generation,
      });
      return { written: false, generation: current!.generation };
    }
    try {
      const generation = await storage.write(serialized, current?.generation ?? 0);
      logger.log("info", "snapshot_published", {
        executionId,
        attempt,
        generation,
        itemCount: outcome.programData.items.length,
        warningCount: warnings.length,
        generatedAt,
      });
      return { written: true, generation };
    } catch (error) {
      if (!(error instanceof GenerationCollisionError) || attempt === maxAttempts) throw error;
      logger.log("warn", "generation_collision", { executionId, attempt });
    }
  }
  throw new Error("Publication retry limit exceeded");
}
