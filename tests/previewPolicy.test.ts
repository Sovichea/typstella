import { describe, expect, test } from "bun:test";
import { allowsStandalonePreview, previewLspMainPath, previewRefreshStyle, previewSessionIdentity, researchDocumentIdentity, sourceMapPreviewTaskId, staleSourceMapTaskIds, supportsResponsivePartialRendering, tinymistPreviewArguments, tinymistPreviewByteColumn, usesTemplateAwareStandaloneRoot } from "../src/preview/previewPolicy";

describe("preview policy", () => {
  test("keeps standalone preview disabled for v1.0", () => {
    expect(allowsStandalonePreview("// @standalone-preview\n= Chapter")).toBe(false);
    expect(allowsStandalonePreview("\uFEFF// @standalone-preview\n= Chapter")).toBe(false);
    expect(allowsStandalonePreview("= Chapter")).toBe(false);
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

  test("pins a standalone preview to its compilation root", () => {
    expect(previewLspMainPath({
      rootPath: "/workspace/.chapter.preview.typ",
      mainPath: "/workspace/main.typ",
      standalone: true
    })).toBe("/workspace/.chapter.preview.typ");
    expect(previewLspMainPath({
      rootPath: "/workspace/main.typ",
      mainPath: "/workspace/main.typ",
      standalone: false
    })).toBe("/workspace/main.typ");
  });

  test("uses UTF-8 byte columns for Tinymist preview source mapping", () => {
    const line = "Latin ខ្មែរ text";
    const offset = line.indexOf(" text");
    expect(tinymistPreviewByteColumn(line, offset)).toBe(new TextEncoder().encode("Latin ខ្មែរ").length);
    expect(tinymistPreviewByteColumn("😀x", 2)).toBe(4);
  });

  test("keeps original source paths for template-aware standalone wrappers", () => {
    const active = "C:\\workspace\\chapters\\one.typ";
    expect(usesTemplateAwareStandaloneRoot(
      active,
      "C:/workspace/.one.typ.task.typstella-preview.typ",
      true
    )).toBe(true);
    expect(usesTemplateAwareStandaloneRoot(active, active, true)).toBe(false);
    expect(usesTemplateAwareStandaloneRoot(active, "C:/workspace/main.typ", false)).toBe(false);
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
