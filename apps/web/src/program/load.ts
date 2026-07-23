import {
  validateProgramDataV2,
  type ProgramDataV2,
} from "@ropecon/program-core";

export type ProgramLoadState =
  | { status: "loading" }
  | { status: "ready-network"; data: ProgramDataV2 }
  | { status: "ready-cache"; data: ProgramDataV2; stale: boolean; error?: string }
  | { status: "unavailable-first-run"; error: string };

export interface ProgramCache {
  read(): Promise<unknown | null>;
  write(data: ProgramDataV2): Promise<void>;
}

export { validateProgramDataV2 as validateProgramData } from "@ropecon/program-core";

export function isNewer(candidate: ProgramDataV2, current: ProgramDataV2): boolean {
  return Date.parse(candidate.generatedAt) > Date.parse(current.generatedAt);
}

export async function loadProgramData(options: {
  url: string;
  cache: ProgramCache;
  fetchProgram?: typeof fetch;
  timeoutMs?: number;
  nowMs?: number;
  staleAfterMs?: number;
}): Promise<Exclude<ProgramLoadState, { status: "loading" }>> {
  const { url, cache, fetchProgram = fetch, timeoutMs = 8_000,
    nowMs = Date.now(), staleAfterMs = 15 * 60_000 } = options;
  if (!url) throw new Error("PUBLIC_PROGRAM_DATA_URL is required");

  let cached: ProgramDataV2 | null = null;
  try {
    const raw = await cache.read();
    if (raw !== null) cached = validateProgramDataV2(raw);
  } catch { /* Ignore corrupt browser cache. */ }

  try {
    const response = await fetchProgram(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-cache" });
    if (!response.ok) throw new Error(`Program request failed: ${response.status}`);
    const network = validateProgramDataV2(await response.json());
    if (!cached || isNewer(network, cached)) await cache.write(network);
    const data = cached && !isNewer(network, cached) ? cached : network;
    return { status: "ready-network", data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Program request failed";
    if (cached) {
      return {
        status: "ready-cache",
        data: cached,
        stale: nowMs - Date.parse(cached.generatedAt) > staleAfterMs,
        error: message,
      };
    }
    return { status: "unavailable-first-run", error: message };
  }
}

export function localStorageProgramCache(key = "ropecon-program-data-v2"): ProgramCache {
  return {
    async read() {
      const raw = localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    },
    async write(data) { localStorage.setItem(key, JSON.stringify(data)); },
  };
}
