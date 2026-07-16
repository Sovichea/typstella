import { describe, expect, test } from "bun:test";
import { normalizeAppSettings } from "../src/settings";
import { normalizeWorkspaceMetadata } from "../src/workspace/workspaceStateStore";

describe("scope-aware language settings", () => {
  test("migrates and bounds application terminology", () => {
    const settings = normalizeAppSettings({
      version: 1,
      editor: {
        embeddedSpellcheckLanguages: ["khmer-segmenter", "khmer-segmenter", "english-hunspell"],
        completionLanguageSource: "manual",
        manualCompletionLanguage: "fr_fr",
        globalTerminology: [
          { term: " Typsastra ", exactCase: true },
          { term: "x".repeat(129), exactCase: true },
          { term: "bad\nterm", exactCase: true },
        ],
        languageTerminology: [
          { term: "bonjour", exactCase: false, languageFamily: "FR" },
          { term: "invalid", languageFamily: "french" },
        ],
        scopedIgnoredWords: [
          { term: "colour", scope: "languageFamily", languageFamily: "EN" },
          { term: "unsafe", scope: "languageFamily" },
        ],
      },
    });

    expect(settings.version).toBe(2);
    expect(settings.editor.embeddedSpellcheckLanguages).toEqual(["khmer-segmenter", "english-hunspell"]);
    expect(settings.editor.completionLanguageSource).toBe("manual");
    expect(settings.editor.manualCompletionLanguage).toBe("fr-FR");
    expect(settings.editor.globalTerminology).toEqual([{ term: "Typsastra", exactCase: true }]);
    expect(settings.editor.languageTerminology).toEqual([
      { term: "bonjour", exactCase: false, languageFamily: "fr" },
    ]);
    expect(settings.editor.scopedIgnoredWords).toEqual([
      { term: "colour", scope: "languageFamily", languageFamily: "en" },
    ]);
  });

  test("bounds and sanitizes imported project terminology", () => {
    const metadata = normalizeWorkspaceMetadata({
      project: {
        terminology: [
          { term: " Typsastra ", exactCase: true },
          { term: "Typsastra", exactCase: true },
          { term: "bad\nterm", exactCase: true },
          { term: "x".repeat(129), exactCase: false },
        ],
      },
    });
    expect(metadata.project.terminology).toEqual([{ term: "Typsastra", exactCase: true }]);
  });
});
