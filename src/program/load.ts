import { readFile } from "node:fs/promises";

import type { ProgramData } from "../normalise/types.ts";

export const LIVE_PROGRAM_URL =
  "https://storage.googleapis.com/ropecon-game-finder-program/program.json";

interface ProgramSourceOptions {
  development: boolean;
  localPath: string;
  fetchProgram?: typeof fetch;
  readLocal?: typeof readFile;
}

/** Load the local baked snapshot in development and the live snapshot in deployments. */
export async function loadProgramData({
  development,
  localPath,
  fetchProgram = fetch,
  readLocal = readFile,
}: ProgramSourceOptions): Promise<ProgramData> {
  if (development) {
    return JSON.parse(await readLocal(localPath, "utf8")) as ProgramData;
  }

  const response = await fetchProgram(LIVE_PROGRAM_URL);
  if (!response.ok) {
    throw new Error(`Live program request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as ProgramData;
}
