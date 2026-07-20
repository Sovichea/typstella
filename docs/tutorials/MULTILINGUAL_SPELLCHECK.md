# Multilingual spellcheck

## The document scope is authoritative

Typsastra derives spellcheck language from static Typst text scopes:

```typst
#set text(lang: "en")
English paragraph.

#text(lang: "fr")[Texte français.]

#[
  #set text(lang: "es")
  Texto español.
]
```

`#set text` applies through its content scope. Typsastra recognizes named blocks
such as `#block[...]`, anonymous blocks `#[...]`, nested text calls, and included
files. A nested explicit scope overrides its parent until that scope ends.

## Same-script languages remain isolated

English, French, and Spanish share Latin script but not dictionary ownership.
An explicit French scope never falls back to English merely because an English
provider is installed. If French is unavailable, spellcheck is disabled for
that scope and the `lang` declaration receives a hint and warning marker.

Mixed-script runs may use configured embedded providers only when ownership is
unambiguous and the scripts are disjoint. This convenience cannot substitute a
same-script language provider.

## Terminology

Use the spelling context menu to accept a term globally, for the project, or for
a language family. Global and project terminology can recognize a product name
such as `Typsastra` across languages. Language-family terminology stays isolated
so accepting an ordinary French word does not hide a typo in English.

## Diagnose routing

Enable **Spellcheck and language scopes** under Settings → Developer → Log
categories. The log records resolved scopes, provider catalog readiness, routed
chunks, rejected results, and published hints without changing analysis.

Try `02-multilingual-writing/02-language-scoped-spellcheck` and the complete
`04-research-projects/01-multilingual-article` example.
