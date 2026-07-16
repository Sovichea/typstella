# Scope-aware Language Tools

Typsastra routes spellcheck through statically knowable Typst text styles. The document remains ordinary portable Typst source; no Typsastra-only language markup is required.

The behavior follows Typst's documented [`text` language, region, script, and direction parameters](https://typst.app/docs/reference/text/text/), [set rules](https://typst.app/docs/reference/styling/#set-rules), and [content blocks](https://typst.app/docs/reference/foundations/content/).

## Supported scopes

The main document starts with Typst's `lang: "en"`, `region: none`, and `script: auto` defaults. Included files opened without their main-document context are treated as inherited and unresolved.

Typsastra supports:

- ordinary `#set text(lang: "…", region: "…", script: "…")` rules;
- literal `if true` and `if false` set conditions;
- named content such as `#block[...]`, anonymous `#[...]`, generic function content, and code/content lexical restoration;
- nested direct `#text(lang: "…")[...]` calls;
- direct string bodies when source offsets do not cross an escape;
- independent inheritance of language, region, and shaping script.

The official pinned `typst-syntax` parser runs outside the UI thread. Native byte offsets are converted to UTF-16 before reaching CodeMirror. Malformed edits make the affected lexical remainder unresolved instead of retaining stale language state.

Variables, dynamic conditions, spread arguments, shadowed or aliased `text`, and show-set transformations are not evaluated. Comments, raw text, math, URLs, labels, references, code, and unrelated strings are excluded from spellcheck and language completion.

## Provider routing

An explicit static language selects one installed provider by exact language/region, then an unambiguous language fallback. An unknown, disabled, downloadable, unsupported, invalid, or ambiguous provider fails closed—Typsastra never silently substitutes another same-script dictionary.

Embedded spellcheck languages are ordered in Settings. They may check only disjoint scripts not owned by the primary provider or an earlier embedded provider. This supports English, Khmer, and Arabic in one scope while requiring explicit scopes for English, French, and Spanish.

A missing static `lang` declaration receives a theme-aware dotted hint and accessible gutter marker. Disabled providers are informational. Invalid Typst values remain owned by Tinymist diagnostics and do not receive a duplicate Typsastra warning. Activating a marker opens the existing Language Tools workflow; installing or enabling a provider refreshes the document without reopening it.

## Accepted terminology

- Global terminology is available in every scope.
- Project terminology is bounded and stored in `.typsastra/config.json`, so it travels with project export.
- Language-family terminology applies only to the provider's canonical language family.
- Existing `userDictionary` and `ignoredWords` entries retain their legacy global behavior after settings migration.
- New ignores require an explicit global or language-family scope.

Terms are limited to 128 characters, imported project terminology is capped at 2,000 entries, newline/NUL content is rejected, and UI rendering uses text nodes rather than HTML. Changing terminology rechecks only source occurrences of changed terms.

## Typing suggestions

Spellcheck scope and completion input language are independent. Suggestions can follow:

1. the current operating-system keyboard language;
2. the current static Typst scope;
3. a manual language setting.

Windows maps the foreground keyboard layout and reports whether the result is reliable. Custom or unmapped layouts fall back to scope. macOS currently reports an unsupported adapter and falls back; Linux uses the process locale as an explicitly unreliable fallback. In development, `TYPSASTRA_DEV_INPUT_LANGUAGE=km-KH` (or another tag) provides a test override.

Exactly one completion provider is queried. Results are discarded after document, cursor, provider, input generation, or replacement-range changes. Language completion is suppressed during IME composition, outside parser-proven prose, and for multiple selections. Tinymist completion remains available independently.
