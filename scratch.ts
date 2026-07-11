import { graphemeBoundaries } from "./src/editor/grapheme";
import { snapPositionToGraphemeBoundary } from "./src/editor/grapheme";
import { Text } from "@codemirror/state";
import { editingPolicyRegistry } from "./src/editor/editingPolicies/registry";
import { khmerEditingPolicy } from "./src/editor/editingPolicies/khmer/policy";

const text = "សួស្តី";
const doc = Text.of([text]);

export function newSnapPositionToGraphemeBoundary(doc: Text, position: number, temporaryBoundary: number | null = null): number {
  const line = doc.lineAt(Math.max(0, Math.min(position, doc.length)));
  const local = position - line.from;
  const localTemporaryBoundary = temporaryBoundary === null ? null : temporaryBoundary - line.from;
  for (const boundary of graphemeBoundaries(line.text, localTemporaryBoundary)) {
    if (local <= boundary.from) return line.from + boundary.from;
    if (boundary.from < local && local < boundary.to) {
      const midpoint = boundary.from + ((boundary.to - boundary.from) / 2);
      return line.from + (local <= midpoint ? boundary.from : boundary.to);
    }
  }
  return Math.max(line.from, Math.min(position, line.to));
}

for (let i = 0; i <= text.length; i++) {
  console.log(`snapPosition(${i}) =`, newSnapPositionToGraphemeBoundary(doc, i));
}
