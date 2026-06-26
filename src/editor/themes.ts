import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const baseEditorLayoutTheme = EditorView.theme({
  "&": { 
      height: "100%", 
      fontSize: "14px", 
      lineHeight: "1.7" 
  },
  ".cm-line": { padding: "0 12px", overflow: "visible !important" },
  ".cm-gutters": { borderRight: "1px solid var(--ui-border)" },
  ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--editor-cursor-color, #005cc5) !important",
      borderLeftWidth: "3px !important",
      filter: "drop-shadow(0 0 2px var(--editor-cursor-shadow, rgba(255, 255, 255, 0.95))) drop-shadow(0 0 5px var(--editor-cursor-glow, rgba(0, 92, 197, 0.45)))"
  },
  ".cm-focused .cm-cursor": {
      animation: "typstry-cursor-pulse 1.05s steps(1) infinite"
  },
  "@keyframes typstry-cursor-pulse": {
      "0%, 45%": {
          borderLeftColor: "var(--editor-cursor-color, #005cc5)",
          filter: "drop-shadow(0 0 2px var(--editor-cursor-shadow, rgba(255, 255, 255, 0.95))) drop-shadow(0 0 5px var(--editor-cursor-glow, rgba(0, 92, 197, 0.45)))"
      },
      "46%, 100%": {
          borderLeftColor: "var(--editor-cursor-contrast-color, #d73a49)",
          filter: "drop-shadow(0 0 2px var(--editor-cursor-contrast-shadow, rgba(255, 255, 255, 0.95))) drop-shadow(0 0 5px var(--editor-cursor-contrast-glow, rgba(215, 58, 73, 0.35)))"
      }
  },
  ".cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--editor-selection-color, rgba(3, 102, 214, 0.22)) !important"
  },
  ".cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--editor-selection-focus-color, rgba(3, 102, 214, 0.3)) !important",
      outline: "1px solid var(--editor-selection-outline, rgba(3, 102, 214, 0.32))"
  },
  ".cm-matchingBracket": {
      backgroundColor: "var(--ui-select, rgba(255, 255, 255, 0.2)) !important",
      outline: "1px solid var(--editor-bracket-match-outline, #005cc5) !important",
      borderRadius: "2px"
  },
  ".cm-nonmatchingBracket": {
      backgroundColor: "var(--editor-bracket-mismatch-bg, rgba(215, 58, 73, 0.16)) !important",
      color: "inherit !important"
  },
  "& .bracket-color-0, & .bracket-color-0 *": { color: "var(--editor-bracket-0) !important", fontWeight: "bold !important" },
  "& .bracket-color-1, & .bracket-color-1 *": { color: "var(--editor-bracket-1) !important", fontWeight: "bold !important" },
  "& .bracket-color-2, & .bracket-color-2 *": { color: "var(--editor-bracket-2) !important", fontWeight: "bold !important" },
  "& .bracket-color-3, & .bracket-color-3 *": { color: "var(--editor-bracket-3) !important", fontWeight: "bold !important" },
  "& .bracket-color-4, & .bracket-color-4 *": { color: "var(--editor-bracket-4) !important", fontWeight: "bold !important" }
});

export function editorFontTheme(fontFamily: string = "ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace") {
  return EditorView.theme({
    "&": {
      height: "100%",
      "--editor-code-font": fontFamily
    },
    ".cm-content": {
      fontFamily: "var(--editor-code-font) !important"
    },
    ".cm-gutters": {
      fontFamily: "ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace !important"
    }
  });
}

export const typstColorHighlighting = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword], color: "#7c3aed", fontWeight: "bold" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--editor-function-color, #0f766e)", fontWeight: "700" },
  { tag: [tags.variableName, tags.labelName], color: "#1d4ed8" },
  { tag: [tags.number, tags.atom, tags.bool], color: "#b45309" },
  { tag: [tags.operator, tags.punctuation], color: "#4b5563" },
  { tag: tags.heading, color: "#0056b3", fontWeight: "bold" },
  { tag: tags.comment, color: "#008000", fontStyle: "italic" },
  { tag: tags.string, color: "#22863a" },
  { tag: [tags.literal, tags.monospace], color: "#0056b3" }
]);

export const typstFunctionHighlighting = HighlightStyle.define([
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--editor-function-color, #0f766e)",
    fontWeight: "700"
  }
]);

export const typstFontHighlighting = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword], fontFamily: "var(--editor-code-font) !important" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], fontFamily: "var(--editor-code-font) !important" },
  { tag: [tags.variableName, tags.labelName], fontFamily: "var(--editor-code-font) !important" },
  { tag: [tags.number, tags.atom, tags.bool], fontFamily: "var(--editor-code-font) !important" },
  { tag: [tags.operator, tags.punctuation], fontFamily: "var(--editor-code-font) !important" },
  { tag: tags.heading, scale: 1.15, fontFamily: "'MiSans Latin', var(--active-unicode-font, 'MiSans Khmer'), sans-serif !important" },
  { tag: tags.comment, fontFamily: "'MiSans Latin', var(--active-unicode-font, 'MiSans Khmer'), sans-serif !important" },
  { tag: tags.string, fontFamily: "var(--editor-code-font) !important" },
  { tag: tags.content, fontFamily: "'MiSans Latin', var(--active-unicode-font, 'MiSans Khmer'), sans-serif !important" },
  { tag: [tags.literal, tags.monospace], fontFamily: "var(--editor-code-font) !important", color: "var(--ui-monospace-color) !important" },
  { tag: [tags.strong, tags.emphasis, tags.list, tags.link, tags.url], fontFamily: "'MiSans Latin', var(--active-unicode-font, 'MiSans Khmer'), sans-serif !important" }
]);
