#set document(title: "Keyboard-language Completion")
#set page(margin: 24mm)
#set text(lang: "en", size: 11pt)

= Keyboard-language completion

This paragraph is explicitly English. Misspelled words are checked with the
English provider even when the operating-system keyboard changes.

== Try it

1. Open Settings and set the suggestion language source to Keyboard language.
2. Place the cursor after the prefix below.
3. Switch to a mapped keyboard language and continue typing.

Type here: doc

#text(lang: "fr")[Cette phrase reste un scope français, indépendamment du clavier.]

Keyboard language selects at most one completion provider. It never overrides
the `lang` scope used by spellcheck. Completion is suppressed during IME
composition, outside Typst prose, and for incompatible multiple selections.
