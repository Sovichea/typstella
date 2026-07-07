import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { typstImportPathRange } from "../src/editor/extensions";

describe("Ctrl-hover Typst links", () => {
  test("covers the complete include path across hyphens and dots", () => {
    const source = '#include "foo-bar-2.typ"';
    const state = EditorState.create({ doc: source });
    const position = source.indexOf("bar") + 1;

    const range = typstImportPathRange(state, position);
    expect(range).not.toBeNull();
    expect(state.sliceDoc(range!.from, range!.to)).toBe("foo-bar-2.typ");
  });

  test("covers a complete nested import path", () => {
    const source = '#import "templates/chapter-one.typ": chapter';
    const state = EditorState.create({ doc: source });
    const position = source.indexOf("chapter-one") + 4;

    const range = typstImportPathRange(state, position);
    expect(range).not.toBeNull();
    expect(state.sliceDoc(range!.from, range!.to)).toBe("templates/chapter-one.typ");
  });

  test("does not treat an unrelated quoted string as an import path", () => {
    const source = '#let name = "foo-bar-2.typ"';
    const state = EditorState.create({ doc: source });

    expect(typstImportPathRange(state, source.indexOf("bar"))).toBeNull();
  });
});
