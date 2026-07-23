import type { ProgramItemV2 } from "@ropecon/program-core";
import { escapeHtml, renderProgramItem } from "./render-card.ts";

export interface GameSystemGroup {
  name: string;
  items: ProgramItemV2[];
}

/**
 * gameSystem is free text: only surrounding whitespace is normalised. Casing,
 * punctuation, and spelling remain distinct and the first source spelling is shown.
 */
export function groupByGameSystem(
  items: readonly ProgramItemV2[],
  locale: string,
): GameSystemGroup[] {
  const groups = new Map<string, GameSystemGroup>();

  for (const item of items) {
    const name = item.gameSystem.trim();
    // Format/control characters such as a zero-width space are not visible to guests.
    if (!name.replace(/[\p{White_Space}\p{Cf}]/gu, "")) continue;
    const existing = groups.get(name);
    if (existing) existing.items.push(item);
    else groups.set(name, { name, items: [item] });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => a.start.localeCompare(b.start)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export function renderGameSystems(groups: readonly GameSystemGroup[]): string {
  return groups
    .map(
      ({ name, items }) => `<details class="system">
        <summary>
          <span class="system-name">${escapeHtml(name)}</span>
          <span class="system-count">${items.length} ${items.length === 1 ? "session" : "sessions"}</span>
        </summary>
        <ul class="sessions">${items.map((item) => renderProgramItem(item, { includeDay: true })).join("")}</ul>
      </details>`,
    )
    .join("");
}
