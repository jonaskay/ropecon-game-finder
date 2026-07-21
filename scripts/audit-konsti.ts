/**
 * Konsti taxonomy audit CLI (plan §5, §10). Run with bun:
 *
 *   bun scripts/audit-konsti.ts report            # live fetch, informational (exit 0)
 *   bun scripts/audit-konsti.ts report --fixture fixtures/konsti-sample.synthetic.json
 *   bun scripts/audit-konsti.ts check             # committed fixture, exit≠0 on ANY finding
 *   bun scripts/audit-konsti.ts check --live      # gate against live data
 *
 * This is the IMPURE edge: it fetches / reads files, prints, and owns exit policy.
 * The pure core (enumerate/checks/report/run) decides nothing about exit codes.
 *
 * Exit policy:
 *  - report: informational human loop. Never exits non-zero on warns (plan §5.1).
 *  - check:  the fixture is curated, so EVERY value is reviewed — any finding (hard OR
 *            warn) fails the build (plan §5.2). Catches config/normalisation regressions.
 */

import { readFileSync } from "node:fs";
import { fetchProjectedItems, projectResponse } from "../src/konsti/fetch.ts";
import type { ProjectedItem } from "../src/konsti/schema.ts";
import { runAudit } from "../src/audit/run.ts";
import { renderReport } from "../src/audit/report.ts";
import { scanForPii } from "../src/audit/checks.ts";

const DEFAULT_FIXTURE = "fixtures/konsti-sample.synthetic.json";

type Mode = "report" | "check";

interface Args {
  mode: Mode;
  live: boolean;
  fixture: string;
}

function parseArgs(argv: string[]): Args {
  const [modeArg, ...rest] = argv;
  const mode: Mode = modeArg === "check" ? "check" : "report";
  let live = false;
  let fixture = DEFAULT_FIXTURE;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--live") live = true;
    else if (arg === "--fixture") fixture = rest[++i] ?? fixture;
  }
  return { mode, live, fixture };
}

async function loadItems(args: Args): Promise<ProjectedItem[]> {
  // report defaults to live; check defaults to the committed fixture.
  const useLive = args.live || (args.mode === "report" && !hasExplicitFixture());
  if (useLive) {
    return fetchProjectedItems();
  }
  const raw = readFileSync(args.fixture, "utf8");
  return projectResponse(JSON.parse(raw));
}

let explicitFixture = false;
function hasExplicitFixture(): boolean {
  return explicitFixture;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  explicitFixture = argv.includes("--fixture");
  const args = parseArgs(argv);

  const items = await loadItems(args);
  const { enumeration, findings, hasHardFailure } = runAudit(items);
  const report = renderReport(enumeration, findings);

  // Belt-and-suspenders: also scan the rendered report string for PII (plan §6).
  const reportPii = scanForPii(report, "report");
  const allFindings = [...findings, ...reportPii];
  const hardFailure = hasHardFailure || reportPii.length > 0;

  console.log(report);

  if (args.mode === "check") {
    if (allFindings.length > 0) {
      console.error(
        `\naudit:check FAILED — ${allFindings.length} finding(s) against ${args.live ? "live data" : args.fixture}. ` +
          `Every value in the fixture must be reviewed; encode the decision in src/config/* and update the fixture.`,
      );
      process.exit(1);
    }
    console.error("\naudit:check OK — no findings.");
    return;
  }

  // report mode: informational; surface hard problems loudly but do not fail on warns.
  if (hardFailure) {
    console.error("\nNOTE: hard finding(s) present — see Findings above.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
