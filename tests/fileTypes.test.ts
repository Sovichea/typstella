import { describe, expect, test } from "bun:test";
import { fileExtension, isBinaryImagePath, isSupportedInAppPath, isTypstDocumentPath } from "../src/platform/fileTypes";

describe("file types", () => {
  test("switches non-Typst text files to the plain-text editor mode", async () => {
    const extensions = await Bun.file(new URL("../src/editor/extensions.ts", import.meta.url)).text();
    const controller = await Bun.file(new URL("../src/appController.ts", import.meta.url)).text();
    expect(extensions).toContain("languageCompartment.of(typstLanguage)");
    expect(controller).toContain("languageCompartment.reconfigure(isTypstDocument ? typstLanguage : [])");
  });

  test("recognizes supported editor and image formats case-insensitively", () => {
    expect(isSupportedInAppPath("C:\\docs\\main.TYP")).toBe(true);
    expect(isSupportedInAppPath("/docs/references.bib")).toBe(true);
    expect(isSupportedInAppPath("/docs/figure.PNG")).toBe(true);
    expect(isBinaryImagePath("/docs/figure.PNG")).toBe(true);
  });

  test("rejects formats that should be opened externally", () => {
    expect(isSupportedInAppPath("/docs/output.pdf")).toBe(true); // Now supported in-app
    expect(isSupportedInAppPath("/docs/archive.zip")).toBe(false);
    expect(isSupportedInAppPath("/docs/no-extension")).toBe(false);
  });

  test("extracts only a file-name extension", () => {
    expect(fileExtension("C:\\folder.with.dot\\main.typ")).toBe("typ");
  });

  test("limits Typst language services to Typst documents", () => {
    expect(isTypstDocumentPath("C:\\docs\\main.TYP")).toBe(true);
    expect(isTypstDocumentPath("/docs/notes.md")).toBe(false);
    expect(isTypstDocumentPath("/docs/notes.txt")).toBe(false);
  });
});
