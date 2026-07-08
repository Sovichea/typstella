import { describe, expect, test } from "bun:test";
import { allowsStandalonePreview, previewRefreshStyle, previewSessionIdentity, supportsResponsivePartialRendering, tinymistPreviewArguments } from "../src/preview/previewPolicy";

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
});
