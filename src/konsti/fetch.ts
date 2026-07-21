/**
 * The single live boundary to Konsti.
 *
 * PRIVACY BOUNDARY (primer §3 "Privacy boundary", plan §6):
 * the raw `users[]` array — which carries `username` and `signupMessage` — is
 * projected to `{ userCount }` inside `fetchProjectedItems` and NEVER returned.
 * Everything downstream (enumerate, checks, report, the data job) sees only
 * `ProjectedItem`, so PII cannot leak into output, logs, or fixtures by construction.
 *
 * API POLITENESS (primer §8): one unauthenticated GET per run, descriptive
 * User-Agent, no per-item fetches. Build/test against the committed fixture; the
 * live endpoint is hit at most once, only when the human runs the report.
 */

import {
  assertProgramItemsResponse,
  type ProjectedItem,
  type KonstiProgramItemsEntry,
} from "./schema.ts";

export const KONSTI_PROGRAM_ITEMS_URL = "https://ropekonsti.fi/api/program-items";

export const AUDIT_USER_AGENT =
  "ropecon-game-finder-audit/1.0 (+https://github.com/ropecon-game-finder; contact via repo)";

/**
 * Project a single wire entry to a PII-free item. Isolated and exported so tests
 * can prove the projection drops `users` without going through the network.
 */
export function projectEntry(entry: KonstiProgramItemsEntry): ProjectedItem {
  return {
    programItem: entry.programItem,
    userCount: Array.isArray(entry.users) ? entry.users.length : 0,
  };
}

/**
 * Turn a parsed wire response into projected items. Pure and network-free so it can
 * be reused by the fixture-driven CLI/`check` path. Raw `users` are discarded here.
 */
export function projectResponse(payload: unknown): ProjectedItem[] {
  assertProgramItemsResponse(payload);
  return payload.programItems.map(projectEntry);
}

/**
 * Perform the one live GET and return projected items only.
 *
 * The raw response — including every `users[]` array — is confined to this function
 * body and is unreachable once it returns.
 */
export async function fetchProjectedItems(
  url: string = KONSTI_PROGRAM_ITEMS_URL,
): Promise<ProjectedItem[]> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": AUDIT_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Konsti fetch failed: ${response.status} ${response.statusText}`);
  }

  const payload: unknown = await response.json();
  return projectResponse(payload);
}
