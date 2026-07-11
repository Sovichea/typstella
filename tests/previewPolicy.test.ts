import { describe, expect, test } from "bun:test";
import { allowsStandalonePreview, previewRefreshStyle, previewSessionIdentity, researchDocumentIdentity, sourceMapPreviewTaskId, staleSourceMapTaskIds, supportsResponsivePartialRendering, tinymistPreviewArguments } from "../src/preview/previewPolicy";

describe("preview policy", () => {
  test("only accepts the directive on the first line", () => {
    expect(allowsStandalonePreview("// @standalone-preview\n= Chapter")).toBe(true);
    expect(allowsStandalonePreview("\uFEFF// @standalone-preview\n= Chapter")).toBe(true);
    expect(allowsStandalonePreview("//@standalone-preview\n= Chapter")).toBe(true);
    expect(allowsStandalonePreview("\n// @standalone-preview\n= Chapter")).toBe(false);
    expect(allowsStandalonePreview("// @allow-preview\n= Legacy chapter")).toBe(false);
  });

  test("uses the selected refresh mode independently of preview roots", () => {
    expect(previewRefreshStyle("on-save")).toBe("on-save");
    expect(previewRefreshStyle("on-type")).toBe("on-type");
  });

  test("creates stable distinct task IDs for each refresh policy", () => {
    const live = previewSessionIdentity("C:\\docs\\main.typ", "on-type");
    const saved = previewSessionIdentity("C:\\docs\\main.typ", "on-save");
    expect(live).toEqual(previewSessionIdentity("C:\\docs\\main.typ", "on-type"));
    expect(live.taskId).not.toBe(saved.taskId);
  });

  test("keys a research document by workspace and configured main file", () => {
    const chapter = researchDocumentIdentity("C:\\research", "C:\\research\\main.typ", "C:\\research\\chapters\\one.typ");
    const sibling = researchDocumentIdentity("C:\\research", "C:\\research\\main.typ", "C:\\research\\chapters\\two.typ");
    expect(chapter.cacheKey).toBe(sibling.cacheKey);
    expect(chapter.sourceKey).not.toBe(sibling.sourceKey);
    expect(previewSessionIdentity("C:\\research\\main.typ", "on-type", chapter))
      .toEqual(previewSessionIdentity("C:\\research\\main.typ", "on-type", sibling));
  });

  test("isolates identical main paths owned by different workspaces", () => {
    const first = researchDocumentIdentity("C:\\one", "C:\\one\\main.typ", "C:\\one\\main.typ");
    const second = researchDocumentIdentity("C:\\two", "C:\\two\\main.typ", "C:\\two\\main.typ");
    expect(previewSessionIdentity("main.typ", "on-type", first).key)
      .not.toBe(previewSessionIdentity("main.typ", "on-type", second).key);
  });

  test("enables Tinymist partial rendering for live previews", () => {
    const args = tinymistPreviewArguments("C:\\docs\\main.typ", "preview-1", "on-type");
    expect(args).toContain("--partial-rendering");
    expect(args[args.indexOf("--partial-rendering") + 1]).toBe("true");
  });

  test("disables expensive partial rendering under Linux WebKitGTK", () => {
    expect(supportsResponsivePartialRendering("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1")).toBe(false);
    expect(supportsResponsivePartialRendering("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(true);
    expect(tinymistPreviewArguments("/docs/main.typ", "preview-1", "on-type", false))
      .not.toContain("--partial-rendering");
  });

  test("uses one dedicated source-map task and cleans legacy registrations", () => {
    expect(sourceMapPreviewTaskId("preview-1")).toBe("preview-1-source-map");
    expect(sourceMapPreviewTaskId("preview-1-source-map")).toBe("preview-1-source-map");
    expect(staleSourceMapTaskIds("preview-1", "preview-old-source-map")).toEqual([
      "preview-old-source-map",
      "preview-1",
      "preview-1-source-map"
    ]);
  });
});
