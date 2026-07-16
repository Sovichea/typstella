#set document(title: "Scope-aware Language Tools")
#set page(margin: 24mm)
// typsastra:typography:start
#set text(font: ("MiSans Latin", "MiSans Khmer"), size: 11pt)
// typsastra:typography:end
#set heading(numbering: "1.")
#set par(leading: 0.7em)
#set text(lang: "en")

= Scope-aware Language Tools

Typsastra derives spellcheck language from static Typst `text` scopes. Typing suggestions can independently follow the keyboard language, the current scope, or a manual language selected in Settings.

== Disjoint scripts in one English scope

Enable Khmer and Arabic as *Embedded* languages in Settings. English owns Latin runs; the embedded providers may check only their disjoint Khmer and Arabic scripts.

English with an intentional sentance typo. សួស្តី ពិភពលោក។ مرحبًا بالعالم.

== Named and anonymous set-rule blocks

#block[
  #set text(lang: "km")
  អត្ថបទខ្មែរនេះស្ថិតក្នុង named block។ English remains an explicitly configured embedded run only when its provider owns a disjoint script.
]

#[
  #set text(lang: "ar")
  #text(dir: rtl)[هذا النص داخل anonymous content block.]
]

== Nested direct text scopes

#text(lang: "fr", region: "FR")[Le français utilise son propre dictionnaire. #text(lang: "en")[This nested sentence is English.] Retour au français.]

#text(lang: "es", region: "ES", "El español también funciona dans une chaîne directe.")

English, French, and Spanish all use Latin script. Typsastra therefore requires these explicit scopes and never accepts a French word merely because an English dictionary recognizes it.

== Missing-provider recovery

#text(lang: "eo")[Ĉi tiu Esperanto-scope intentionally demonstrates an unavailable language provider.]

The `lang: "eo"` declaration receives a dotted hint and gutter warning when no provider is installed. Activate the gutter marker to open Language Tools. Installing or enabling the provider removes the warning and starts analysis without reopening this file.

== Terminology and scoped ignores

Right-click an unknown word such as Typsastra and choose global, project, or language-family terminology. Global and project terminology apply across scopes; a language-family term remains isolated. New ignores also record an explicit language or global scope, while migrated legacy ignores remain visible.

== Keyboard-language completion

In Settings, set *Suggestion language source* to Keyboard language. Switch the operating-system layout, type a prefix in a compatible prose scope, and open completion. Suggestions follow the keyboard language but spellcheck remains owned by the Typst scope. IME composition is never interrupted.

Dynamic expressions such as `#text(lang: selected-language)[...]`, spread style dictionaries, and show-set rules remain unresolved. Typsastra does not evaluate Typst code to guess their language.
