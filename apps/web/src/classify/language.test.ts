import { describe, expect, it } from "vitest";
import { languageLabel, matchesLanguage, observedLanguages } from "./language.ts";

describe("language filter", () => {
  it("derives distinct options from the observed program values", () => {
    expect(
      observedLanguages([
        { languages: ["finnish", "languageFree"] },
        { languages: ["english", "finnish", ""] },
      ]),
    ).toEqual(["english", "finnish", "languageFree"]);
  });

  it("keeps language-free sessions visible for every spoken-language selection", () => {
    expect(matchesLanguage(["languageFree"], "english")).toBe(true);
    expect(matchesLanguage(["languageFree"], "finnish")).toBe(true);
    expect(matchesLanguage(["finnish"], "english")).toBe(false);
  });

  it("supports an unfiltered state and a language-free-only selection", () => {
    expect(matchesLanguage(["finnish"], null)).toBe(true);
    expect(matchesLanguage(["languageFree"], "languageFree")).toBe(true);
    expect(matchesLanguage(["english"], "languageFree")).toBe(false);
  });

  it("formats known and newly observed values for display", () => {
    expect(languageLabel("languageFree")).toBe("Language-free");
    expect(languageLabel("plainLanguage")).toBe("Plain Language");
    expect(languageLabel("")).toBe("Not specified");
  });
});
