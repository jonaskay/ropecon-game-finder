import { describe, expect, it } from "vitest";
import { languageLabel, matchesLanguage, observedLanguages } from "./language.ts";

describe("language filter", () => {
  it("derives distinct options from the observed program values", () => {
    expect(
      observedLanguages([
        { languages: ["fi", "lang-free"] },
        { languages: ["en", "fi", ""] },
      ]),
    ).toEqual(["en", "fi", "lang-free"]);
  });

  it("keeps language-free sessions visible for every spoken-language selection", () => {
    expect(matchesLanguage(["lang-free"], "en")).toBe(true);
    expect(matchesLanguage(["lang-free"], "fi")).toBe(true);
    expect(matchesLanguage(["fi"], "en")).toBe(false);
  });

  it("supports an unfiltered state and a language-free-only selection", () => {
    expect(matchesLanguage(["fi"], null)).toBe(true);
    expect(matchesLanguage(["lang-free"], "lang-free")).toBe(true);
    expect(matchesLanguage(["en"], "lang-free")).toBe(false);
  });

  it("formats known and newly observed values for display", () => {
    expect(languageLabel("lang-free")).toBe("Language-free");
    expect(languageLabel("plainLanguage")).toBe("Plain Language");
    expect(languageLabel("")).toBe("Not specified");
  });
});
