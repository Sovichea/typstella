import type { Text } from "@codemirror/state";
import { graphemeBoundaries } from "./grapheme";

export function cursorRowColumn(doc: Text, position: number): { row: number; column: number } {
  const clamped = Math.max(0, Math.min(position, doc.length));
  const line = doc.lineAt(clamped);
  return {
    row: line.number,
    column: graphemeColumnAt(line.text, clamped - line.from) + 1,
  };
}

function graphemeColumnAt(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(offset, text.length));
  return graphemeBoundaries(text).filter(boundary => boundary.to <= clamped).length;
}
