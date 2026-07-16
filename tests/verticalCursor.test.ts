import { describe, expect, test } from "bun:test";
import { Text } from "@codemirror/state";
import { cursorRowColumn } from "../src/editor/verticalCursor";

describe("vertical cursor navigation", () => {
  test("reports Unicode grapheme columns instead of UTF-16 offsets", () => {
    const doc = Text.of(["ក្មែ😀រ", "ឱ្យ"]);
    expect(cursorRowColumn(doc, doc.line(1).to)).toEqual({ row: 1, column: 4 });
    expect(cursorRowColumn(doc, doc.line(2).to)).toEqual({ row: 2, column: 2 });
  });
});
