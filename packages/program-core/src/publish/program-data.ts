/**
 * The publication envelope (primer §5.3, handoff Step 4).
 *
 * `toProgramData` wraps normalised items in the serialised `ProgramData` shape the
 * client fetches as `program.json`. It is PURE: `generatedAt` is passed IN, never read
 * from the clock here, so the envelope stays deterministic and testable. The build job
 * (`scripts/build-program.ts`) supplies a fresh ISO timestamp — and only ever on a
 * successful write — so last-good data keeps its old `generatedAt` when a publish is
 * skipped (see the fail-safe gate in `publish.ts`).
 */

import type { ProjectedItem } from "../konsti/schema.ts";
import { normalise } from "../normalise/normalise.ts";
import type { ProgramData } from "../normalise/types.ts";

/** Build the published envelope from projected items. Gaming-only + PII-free via `normalise`. */
export function toProgramData(items: ProjectedItem[], generatedAt: string): ProgramData {
  return {
    generatedAt,
    source: "konsti",
    items: normalise(items),
  };
}
