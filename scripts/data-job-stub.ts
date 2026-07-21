/**
 * Data-job STUB (plan §5, context 3) — demonstrates the fail-safe branch only.
 *
 * This is NOT the real ~30-min refresh job (out of scope, plan §12). It shows exactly
 * how the future job must wire `runAudit` so a structural/privacy failure never
 * overwrites last-good data, while a benign new categorical still ships.
 *
 *   bun scripts/data-job-stub.ts            # against the committed fixture
 *   bun scripts/data-job-stub.ts --live     # against live Konsti
 */

import { readFileSync } from "node:fs";
import { fetchProjectedItems, projectResponse } from "../src/konsti/fetch.ts";
import { runAudit } from "../src/audit/run.ts";
import { scanForPii } from "../src/audit/checks.ts";

const DEFAULT_FIXTURE = "fixtures/konsti-sample.synthetic.json";

async function main(): Promise<void> {
  const live = process.argv.includes("--live");

  // 1. fetch → structural validate → project users to a count (raw users[] discarded).
  const items = live
    ? await fetchProjectedItems()
    : projectResponse(JSON.parse(readFileSync(DEFAULT_FIXTURE, "utf8")));

  // 2. runAudit.
  const { findings, hasHardFailure } = runAudit(items);

  // 3. Fail safe: hard failure → keep last-good program.json + old generatedAt; alert.
  if (hasHardFailure) {
    const hard = findings.filter((f) => f.severity === "hard");
    console.error(`[data-job] HARD failure (${hard.length}); keeping last-good program.json. Alerting ops.`);
    for (const f of hard) console.error(`  [HARD] ${f.code}: ${f.message}`);
    process.exit(1);
  }

  // 4. Warnings are loud but non-fatal — log to the job/ops channel, never to program.json.
  const warns = findings.filter((f) => f.severity === "warn");
  for (const f of warns) console.warn(`[data-job] warn ${f.code}: ${f.message}`);

  // 5. (Out of scope here) normalise → count-and-discard users → assert no PII →
  //    atomic write → stamp a fresh generatedAt. We only demonstrate the PII assertion.
  const normalisedPreview = JSON.stringify(items.map((i) => ({ slug: i.programItem.programItemId, userCount: i.userCount })));
  const leak = scanForPii(normalisedPreview, "normalised-preview");
  if (leak.length > 0) {
    console.error(`[data-job] PII leak in serialized output; refusing to write.`);
    process.exit(1);
  }

  console.log(`[data-job] would publish ${items.length} item(s) with a fresh generatedAt (${warns.length} warning(s)).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
