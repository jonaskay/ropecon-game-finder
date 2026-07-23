import type { ProgramItem } from "@ropecon/program-core";

export const LANGUAGE_FREE = "languageFree";

const KNOWN_LABELS: Readonly<Record<string, string>> = {
  english: "English",
  finnish: "Finnish",
  languageFree: "Language-free",
  swedish: "Swedish",
};

/** Human-readable copy for both filter buttons and card metadata. */
export function languageLabel(language: string): string {
  const trimmed = language.trim();
  if (!trimmed) return "Not specified";
  return (
    KNOWN_LABELS[trimmed] ??
    trimmed
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(/^./, (first) => first.toUpperCase())
  );
}

/** Distinct non-empty values observed in the current published program. */
export function observedLanguages(items: readonly Pick<ProgramItem, "languages">[]): string[] {
  return [...new Set(items.flatMap((item) => item.languages).map((value) => value.trim()).filter(Boolean))]
    .sort((a, b) => languageLabel(a).localeCompare(languageLabel(b), "en"));
}

/**
 * A language-free session is playable regardless of the selected language. Selecting
 * Language-free itself narrows the list to explicitly language-free sessions.
 */
export function matchesLanguage(
  languages: readonly string[],
  selectedLanguage: string | null,
): boolean {
  if (selectedLanguage === null) return true;
  if (languages.includes(selectedLanguage)) return true;
  return selectedLanguage !== LANGUAGE_FREE && languages.includes(LANGUAGE_FREE);
}
