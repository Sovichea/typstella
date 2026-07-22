import { describe, expect, test } from "bun:test";
import {
  LARGE_PDF_FILE_BYTES,
  LARGE_TEXT_FILE_BYTES,
  LARGE_TEXT_FILE_LINES,
  formatFileSize,
  largeFileOpeningNotice,
  largeMainPreviewOpeningNotice,
} from "../src/workspace/largeFileOpening";

describe("large file opening notice", () => {
  test("notifies for large text and PDF files at independent thresholds", () => {
    expect(largeFileOpeningNotice("chapter.typ", LARGE_TEXT_FILE_BYTES)).toEqual({
      kind: "text",
      sizeBytes: LARGE_TEXT_FILE_BYTES,
    });
    expect(largeFileOpeningNotice("book.pdf", LARGE_PDF_FILE_BYTES)).toEqual({
      kind: "pdf",
      sizeBytes: LARGE_PDF_FILE_BYTES,
    });
    expect(largeFileOpeningNotice("chapter.typ", LARGE_TEXT_FILE_BYTES - 1)).toBeNull();
    expect(largeFileOpeningNotice("book.pdf", LARGE_PDF_FILE_BYTES - 1)).toBeNull();
  });

  test("also guards text files with many short lines", () => {
    expect(largeFileOpeningNotice("chapter.typ", 200 * 1024, LARGE_TEXT_FILE_LINES)).toEqual({
      kind: "text",
      sizeBytes: 200 * 1024,
      lineCount: LARGE_TEXT_FILE_LINES,
    });
  });

  test("does not classify binary images or unsupported files as large text", () => {
    expect(largeFileOpeningNotice("figure.png", LARGE_PDF_FILE_BYTES)).toBeNull();
    expect(largeFileOpeningNotice("archive.zip", LARGE_PDF_FILE_BYTES)).toBeNull();
  });

  test("describes a large Typst preview root separately from the opened chapter", () => {
    expect(largeMainPreviewOpeningNotice("book.typ", LARGE_TEXT_FILE_BYTES)).toEqual({
      kind: "main-preview",
      sizeBytes: LARGE_TEXT_FILE_BYTES,
      previewRootPath: "book.typ",
    });
    expect(largeMainPreviewOpeningNotice(
      "book.typ",
      200 * 1024,
      LARGE_TEXT_FILE_LINES,
    )).toEqual({
      kind: "main-preview",
      sizeBytes: 200 * 1024,
      lineCount: LARGE_TEXT_FILE_LINES,
      previewRootPath: "book.typ",
    });
    expect(largeMainPreviewOpeningNotice("book.typ", LARGE_TEXT_FILE_BYTES - 1)).toBeNull();
    expect(largeMainPreviewOpeningNotice("book.pdf", LARGE_PDF_FILE_BYTES)).toBeNull();
  });

  test("formats the size for the user-facing status", () => {
    expect(formatFileSize(768 * 1024)).toBe("768 KB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatFileSize(100 * 1024 * 1024)).toBe("100 MB");
  });
});
