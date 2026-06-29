import { describe, expect, test } from "bun:test";
import { allowsLiveImportPreview, previewRefreshStyle, previewSessionIdentity } from "../src/preview/previewPolicy";

describe("preview policy", () => {
  test("only accepts the directive on the first line", () => {
    expect(allowsLiveImportPreview("//@allow-preview\n= Chapter")).toBe(true);
    expect(allowsLiveImportPreview("\uFEFF//@allow-preview\n= Chapter")).toBe(true);
    expect(allowsLiveImportPreview("\n//@allow-preview\n= Chapter")).toBe(false);
  });

  test("uses save refresh for ordinary imported files", () => {
    expect(previewRefreshStyle({ rootPath: "main.typ", imported: true, liveUpdates: false })).toBe("on-save");
    expect(previewRefreshStyle({ rootPath: "main.typ", imported: true, liveUpdates: true })).toBe("on-type");
  });

  test("creates stable distinct task IDs for each refresh policy", () => {
    const live = previewSessionIdentity("C:\\docs\\main.typ", "on-type");
    const saved = previewSessionIdentity("C:\\docs\\main.typ", "on-save");
    expect(live).toEqual(previewSessionIdentity("C:\\docs\\main.typ", "on-type"));
    expect(live.taskId).not.toBe(saved.taskId);
  });
});
