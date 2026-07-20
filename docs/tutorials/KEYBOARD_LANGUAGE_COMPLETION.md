# Keyboard-language completion

Spellcheck answers “which dictionary owns this document range?” Completion
answers “which language is the user typing now?” Typsastra allows those answers
to differ without changing the Typst source.

## Configure suggestions

Open Settings → Editor and enable typing suggestions. Choose a source:

- **Typst scope** follows the static `lang` scope at the cursor;
- **Keyboard language** uses a reliably mapped operating-system keyboard;
- **Manual language** always requests the selected provider.

Keyboard mode selects exactly one compatible completion provider. It never
changes spellcheck scope. An English document can therefore remain English for
spellcheck while a Khmer keyboard requests Khmer word suggestions.

## Fallbacks and IME

Windows exposes mapped keyboard layouts most reliably. Platform status and any
fallback are shown in Settings. If a keyboard cannot be mapped or its provider
is unavailable, Typsastra falls back according to the displayed policy rather
than querying several providers and merging ambiguous results.

Completion is suppressed during IME composition, outside parser-confirmed
prose, and for incompatible multiple selections. The IME itself may also show
operating-system candidates; Typsastra's completion is a separate provider-
based feature and must not interrupt composition.

Try `02-multilingual-writing/03-keyboard-language-completion`.
