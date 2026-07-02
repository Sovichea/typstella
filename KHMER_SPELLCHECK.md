# Khmer Spellcheck and Word Completion

Typstry provides local Khmer spellcheck, correction suggestions, and optional word completion through the Rust language-provider registry. The editor and IPC contracts remain provider-neutral; Khmer-specific segmentation and comparison rules stay in `src-tauri/src/segmentation/registry.rs` and the pinned `third_party/khmer_segmenter` submodule.

## User controls

Editor settings expose two independent features:

- **Language spellcheck** marks unknown words and supplies correction suggestions. Right-click an underlined word to replace it or add it to the personal dictionary.
- **Typing word suggestions** shows dictionary completions while typing. It can be disabled without disabling spellcheck or Typst/Tinymist code completion.

Personal dictionary entries are normalized, deduplicated, and stored in the `editor.userDictionary` array in Typstry's platform-specific `settings.json`. Adding a word triggers fresh analysis immediately. Personal entries affect spellcheck only; they do not modify the bundled Khmer dictionary or completion ranking.

## Analysis pipeline

1. CodeMirror invalidates the active document revision immediately after an edit, tab change, close, workspace close, or spellcheck setting change.
2. After the debounce, `analyze_text` runs the registered provider outside the Tauri UI thread.
3. The Khmer segmenter normalizes and segments the submitted text while retaining original source byte spans.
4. Typstry converts original byte boundaries to CodeMirror UTF-16 offsets.
5. The frontend applies results only when the document key, revision, and CodeMirror document identity still match.
6. Every replacement verifies that the current source slice still equals the issue's captured source text.

Normalization mapping covers reordered Khmer marks, composed vowel forms, and removed ZWSP, ZWNJ, and ZWJ characters. Normalized text is used for dictionary lookup while underlines and replacements continue to target the original visible source.

## Modern COENG+DA and COENG+TA equivalence

In modern Khmer, COENG+DA (`U+17D2 U+178A`) and COENG+TA (`U+17D2 U+178F`) render identically. Typstry therefore converts COENG+DA to COENG+TA only in the provider's internal comparison key.

Consequences:

- A dictionary entry containing COENG+DA matches source typed with COENG+TA, and vice versa.
- Correction distance, prefix detection, and word completion use the same modern comparison key.
- Returned modern suggestions use COENG+TA.
- Typstry does not silently rewrite the document. Source code points and source ranges remain unchanged.
- Historical or Middle Khmer distinctions are not modeled by the current modern-Khmer provider. A future historical provider should use a strict comparison policy instead of this equivalence.

This policy follows the modern encoding model described by [Unicode Technical Note #61](https://www.unicode.org/notes/tn61/tn61-1.html). The note is implementation guidance rather than a Unicode normalization form, so this mapping must not be added to generic NFC/NFD normalization.

## Correction suggestions

The provider first looks for dictionary prefix matches, then uses bounded edit-distance candidates. Results retain the provider ID so correction requests are routed to the provider that produced the issue. Personal dictionary words are filtered by the frontend after native analysis.

The current correction fallback predates the planned bounded cluster-aware index and can still scan a large part of the dictionary. Phase 4 of `KHMER_SEGMENTER_IMPLEMENTATION_PLAN.md` tracks that performance work.

## Word completion

`complete_language_word` receives the active Khmer run and cursor offset. The provider segments the run, evaluates recent token combinations for compound prefixes, and returns an explicit UTF-16 replacement range plus frequency-ranked options. Recombining recent boundaries is necessary for inputs such as `សាលារ`, which may segment as `សាលា` plus `រ` while still being a prefix of `សាលារៀន`.

The frontend refreshes bounded native results after every Khmer character. Accepting a completion replaces only the returned range and does not consume adjacent text.

## Validation

Relevant coverage is in:

- `src-tauri/src/segmentation/registry.rs` for normalization ranges, encoding equivalence, completion boundaries, and ranking;
- `tests/spellcheck.test.ts` for stale responses, safe replacement, IPC failures, and personal dictionary behavior;
- `tests/autocomplete.test.ts` for explicit completion ranges and refresh behavior;
- `tests/settings.test.ts` for setting defaults and personal dictionary persistence normalization.

