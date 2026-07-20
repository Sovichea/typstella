# Scope-aware language tools example

This example demonstrates static Typst language scopes, provider routing, terminology, missing-provider recovery, and keyboard-language completion.

1. Open Settings → Editor. English and Khmer are bundled.
2. Install and enable Arabic, French, and Spanish dictionaries to activate their scoped spellcheck examples. The document remains usable without them.
3. Mark Khmer and Arabic as Embedded to test disjoint-script routing in the English section. Selecting French or Spanish as Embedded replaces the other Latin-script selection because two embedded providers cannot own the same script.
4. Leave Esperanto unavailable to see the dotted `lang: "eo"` hint and gutter warning. Activating the marker opens the existing Language Tools workflow. The warning disappears after a matching provider becomes installed and enabled.
5. Right-click `Typsastra` or an intentional misspelling to add global, project, or language-family terminology. Remove entries under Accepted terminology in Settings.
6. Set Suggestion language source to Keyboard language, switch the OS keyboard layout, and type a word prefix. On Windows, reliable mapped layouts select one completion provider. Unmapped layouts fall back to the current Typst scope; macOS and Linux report their current fallback reliability.

Spellcheck always follows the document scope. Keyboard language changes suggestions only. Completion is suppressed during IME composition, outside syntax-proven prose, and with incompatible multiple selections.

Tutorial: <https://github.com/Sovichea/typsastra/blob/main/docs/tutorials/MULTILINGUAL_SPELLCHECK.md>
