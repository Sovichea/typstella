import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";
import { codeFolding, foldEffect } from "@codemirror/language";
import {
  firstSearchMatch,
  firstVisibleSearchMatch,
  foldedRangeForSearchMatch,
  mergeVisibleSearchRanges,
  searchQueryHasVisibleMatch
} from "../src/editor/extensions";

describe("editor search navigation", () => {
  test("ships an incremental current/total result counter", async () => {
    const source = await Bun.file(new URL("../src/editor/extensions.ts", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/style.css", import.meta.url)).text();

    expect(source).toContain("cm-search-match-count");
    expect(source).toContain("performance.now() - startedAt < 4");
    expect(source).toContain("`${current}/${total}`");
    expect(css).toContain(".cm-panel.cm-search .cm-search-match-count");
  });

  test("centers search navigation results when document boundaries allow it", async () => {
    const source = await Bun.file(new URL("../src/editor/extensions.ts", import.meta.url)).text();

    expect(source).toContain('scrollToMatch: range => EditorView.scrollIntoView(range, { y: "center" })');
    expect(source).toContain('EditorView.scrollIntoView(selection.main, { y: "center" })');
  });

  test("recognizes a match in the visible editor range", () => {
    const state = EditorState.create({ doc: "first target\nsecond line\ntarget again" });
    const query = new SearchQuery({ search: "target" });

    expect(searchQueryHasVisibleMatch(state, query, [{ from: 20, to: state.doc.length }])).toBe(true);
    expect(firstVisibleSearchMatch(state, query, [{ from: 20, to: state.doc.length }]))
      .toEqual({ from: 25, to: 31, precise: true });
  });

  test("falls back to the first document match when the viewport has none", () => {
    const state = EditorState.create({ doc: "first target\nsecond line\nnothing here" });
    const query = new SearchQuery({ search: "target" });
    const visible = [{ from: 25, to: state.doc.length }];

    expect(searchQueryHasVisibleMatch(state, query, visible)).toBe(false);
    expect(firstSearchMatch(state, query)).toEqual({ from: 6, to: 12, precise: true });
  });

  test("does not treat a nearby off-canvas match as visible", () => {
    const state = EditorState.create({ doc: `target${" ".repeat(300)}visible canvas` });
    const query = new SearchQuery({ search: "target" });
    const visible = [{ from: 306, to: state.doc.length }];

    expect(searchQueryHasVisibleMatch(state, query, visible)).toBe(false);
  });

  test("keeps wrapped visual rows separate from off-canvas text on the same logical line", () => {
    const ranges = mergeVisibleSearchRanges([
      { from: 0, to: 20 },
      { from: 20, to: 40 },
      { from: 80, to: 100 }
    ]);

    expect(ranges).toEqual([
      { from: 0, to: 40 },
      { from: 80, to: 100 }
    ]);
    const state = EditorState.create({ doc: `${"a".repeat(60)}target${"a".repeat(40)}` });
    const query = new SearchQuery({ search: "target" });
    expect(searchQueryHasVisibleMatch(state, query, ranges)).toBe(false);
  });

  test("does not navigate for an empty query", () => {
    const state = EditorState.create({ doc: "target" });
    const query = new SearchQuery({ search: "" });

    expect(searchQueryHasVisibleMatch(state, query, [{ from: 0, to: state.doc.length }])).toBe(false);
    expect(firstSearchMatch(state, query)).toBeNull();
  });

  test("does not count a folded match as visible", () => {
    let state = EditorState.create({
      doc: "before [hidden target] after",
      extensions: [codeFolding()]
    });
    state = state.update({ effects: foldEffect.of({ from: 7, to: 22 }) }).state;
    const query = new SearchQuery({ search: "target" });
    const match = firstSearchMatch(state, query);

    expect(match).not.toBeNull();
    expect(foldedRangeForSearchMatch(state, match!)).toEqual({ from: 7, to: 22 });
    expect(searchQueryHasVisibleMatch(state, query, [{ from: 0, to: state.doc.length }])).toBe(false);
  });

  test("still accepts an unfolded match in the same viewport", () => {
    let state = EditorState.create({
      doc: "[hidden target] visible target",
      extensions: [codeFolding()]
    });
    state = state.update({ effects: foldEffect.of({ from: 0, to: 15 }) }).state;
    const query = new SearchQuery({ search: "target" });

    expect(searchQueryHasVisibleMatch(state, query, [{ from: 0, to: state.doc.length }])).toBe(true);
  });
});
