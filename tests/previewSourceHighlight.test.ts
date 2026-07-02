import { describe, expect, test } from "bun:test";
import { findPreviewTextMatchInSourceLine, findPreviewTextMatchesInSource } from "../src/preview/sourceHighlight";

describe("preview source highlighting", () => {
  test("maps preview text clicks back into a source line", () => {
    expect(findPreviewTextMatchInSourceLine("A source sentence", "source sentence", 4)).toEqual({ sourceOffset: 6 });
  });

  test("matches normalized preview whitespace", () => {
    expect(findPreviewTextMatchInSourceLine("A source sentence", "A   source sentence", 5)).toEqual({ sourceOffset: 5 });
  });

  test("maps WASM-inserted Khmer word breaks back to source offsets", () => {
    const source = "មុន ទន្សាយនិងខ្យង ក្រោយ";
    const preview = "ទន្សាយ\u200bនិង\u200bខ្យង";
    const previewOffset = preview.indexOf("ខ្យង") + 1;
    expect(findPreviewTextMatchesInSource(source, preview, previewOffset)).toEqual([
      source.indexOf("ខ្យង") + 1
    ]);
  });

  test("returns every repeated source match for cursor-nearest selection", () => {
    const source = "ខ្យង និង ខ្យង";
    expect(findPreviewTextMatchesInSource(source, "ខ្យង", 2)).toEqual([2, 11]);
  });
});
