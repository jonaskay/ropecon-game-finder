/**
 * Build-time bake of the published feed (handoff Step 4). Run with bun:
 *
 *   bun scripts/build-program.ts                    # against the committed fixture
 *   bun scripts/build-program.ts --live             # against live Konsti
 *   bun scripts/build-program.ts --fixture <path>   # against another fixture
 *   bun scripts/build-program.ts --out <path>       # override output (default public/program.json)
 *
 * Wired as `prebuild`, so `bun run build` regenerates `public/program.json`, which Astro
 * then serves as a static asset. This is the IMPURE edge: it fetches / reads files, reads
 * the clock, writes atomically, and owns exit policy. The pure core (`buildProgram`)
 * decides safe-to-write; it never touches disk.
 *
 * Fail-safe (build-time last-good semantics): on a hard structural/privacy failure the
 * existing `public/program.json` is LEFT UNTOUCHED (last-good keeps its old `generatedAt`)
 * and the build FAILS LOUDLY (exit 1). Warnings are logged but never block the write.
 * The ~30-min refresh job (Step 11) reuses `buildProgram` with the same gate.
 */

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { fetchProjectedItems, projectResponse } from "../src/konsti/fetch.ts";
import type { ProjectedItem } from "../src/konsti/schema.ts";
import { buildProgram } from "../src/publish/publish.ts";

const DEFAULT_FIXTURE = "fixtures/konsti-sample.synthetic.json";
const DEFAULT_OUT = "public/program.json";

interface Args {
  live: boolean;
  fixture: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  let live = false;
  let fixture = DEFAULT_FIXTURE;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--live") live = true;
    else if (arg === "--fixture") fixture = argv[++i] ?? fixture;
    else if (arg === "--out") out = argv[++i] ?? out;
  }
  return { live, fixture, out };
}

async function loadItems(args: Args): Promise<ProjectedItem[]> {
  if (args.live) return fetchProjectedItems();
  return projectResponse(JSON.parse(readFileSync(args.fixture, "utf8")));
}

/** Write via a temp file + rename so a reader never sees a half-written program.json. */
function atomicWrite(path: string, contents: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, contents);
  renameSync(tmp, path);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const source = args.live ? "live Konsti" : args.fixture;

  const items = await loadItems(args);

  // Fresh timestamp stamped only when we are actually about to write (see below).
  const generatedAt = new Date().toISOString();
  const { ok, programData, findings } = buildProgram(items, generatedAt);

  // Warnings are loud but non-fatal — they never gate the write.
  for (const f of findings.filter((finding) => finding.severity === "warn")) {
    console.warn(`[build-program] warn ${f.code}: ${f.message}`);
  }

  if (!ok) {
    const hard = findings.filter((f) => f.severity === "hard");
    console.error(
      `[build-program] HARD failure (${hard.length}) against ${source}; ` +
        `leaving existing ${args.out} untouched (last-good preserved). Failing the build.`,
    );
    for (const f of hard) console.error(`  [HARD] ${f.code}: ${f.message}`);
    process.exit(1);
  }

  atomicWrite(args.out, `${JSON.stringify(programData, null, 2)}\n`);
  console.log(
    `[build-program] wrote ${programData!.items.length} gaming item(s) to ${args.out} ` +
      `(generatedAt ${generatedAt}, source ${source}, ${findings.length} warning(s)).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
