import { randomUUID } from "node:crypto";
import { readEnvironment } from "./environment.ts";
import { runRefresh } from "./run-refresh.ts";
import { jsonLogger } from "./safe-logging.ts";
import { cloudProgramStorage } from "./storage.ts";

export async function main(): Promise<void> {
  const env = readEnvironment(process.env);
  const executionId = process.env.CLOUD_RUN_EXECUTION || randomUUID();
  await runRefresh({
    executionId,
    now: () => new Date(),
    logger: jsonLogger,
    storage: cloudProgramStorage(env.bucket, env.object),
    fetchPayload: async () => {
      const response = await fetch(env.konstiUrl, {
        headers: { Accept: "application/json", "User-Agent": "ropecon-program-refresh/1.0" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Konsti request failed: ${response.status}`);
      return response.json();
    },
  });
}

if (import.meta.main) main().catch(error => {
  jsonLogger.log("error", "refresh_failed", { errorCode: error instanceof Error ? error.name : "UnknownError" });
  process.exitCode = 1;
});
