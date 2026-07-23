import type { MergedProgramItem } from "../merge/types.ts";
import { normaliseMerged } from "../normalise/normalise-merged.ts";
import type { ProgramDataV2 } from "../normalise/types.ts";

export interface ProgramDataV2Metadata {
  generatedAt: string;
  kompassi: {
    eventSlug: string;
    fetchedAt: string;
  };
  konsti: {
    fetchedAt: string;
  };
}

export function toProgramDataV2(
  items: readonly MergedProgramItem[],
  metadata: ProgramDataV2Metadata,
): ProgramDataV2 {
  return {
    schemaVersion: 2,
    generatedAt: metadata.generatedAt,
    source: "kompassi+konsti",
    sources: {
      kompassi: metadata.kompassi,
      konsti: metadata.konsti,
    },
    items: normaliseMerged(items),
  };
}
