import { validateProgramData, type ProgramData } from "@ropecon/program-core";

export type ProgramLoadState =
  | { status: "loading" }
  | { status: "ready-network"; data: ProgramData }
  | { status: "ready-cache"; data: ProgramData; stale: boolean; error?: string }
  | { status: "unavailable-first-run"; error: string };

export interface ProgramCache {
  read(): Promise<unknown | null>;
  write(data: ProgramData): Promise<void>;
}

export { validateProgramData } from "@ropecon/program-core";

export function isNewer(candidate: ProgramData, current: ProgramData): boolean {
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

  let cached: ProgramData | null = null;
  try {
    const raw = await cache.read();
    if (raw !== null) cached = validateProgramData(raw);
  } catch { /* Ignore corrupt browser cache. */ }

  try {
    const response = await fetchProgram(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-cache" });
    if (!response.ok) throw new Error(`Program request failed: ${response.status}`);
    const network = validateProgramData(await response.json());
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

export function localStorageProgramCache(key = "ropecon-program-data"): ProgramCache {
  return {
    async read() {
      const raw = localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    },
    async write(data) { localStorage.setItem(key, JSON.stringify(data)); },
  };
}
