= Multilingual section <scripts>

#set text(lang: "en")

The template uses explicit static language scopes so spellcheck ownership remains portable in Typst source.

== English with disjoint embedded scripts

English prose can contain configured Khmer and Arabic embedded runs without changing the primary language: សួស្តី​ពិភពលោក។ مرحبًا بالعالم.

== Khmer named block

#block[
  #set text(lang: "km")
  ឯកសារនេះអាចបញ្ចូលភាសាច្រើននៅក្នុងរចនាសម្ព័ន្ធតែមួយ។
]

== Arabic anonymous block

#[
  #set text(lang: "ar")
  #text(dir: rtl)[يمكن لهذا المستند الجمع بين لغات متعددة.]
]

== Same-script scopes

#text(lang: "fr")[Le français reste vérifié par le fournisseur français.]

#text(lang: "es")[El español requiere su propio ámbito explícito.]

#text(lang: "en")[English, French, and Spanish are never substituted merely because they share Latin script.]

== Language Tools

English and Khmer are bundled. Install optional Arabic, French, and Spanish dictionaries in Settings → Editor. Configure only disjoint scripts as Embedded. Missing providers produce a declaration hint and gutter marker without making the template fail to compile.

Accepted global terminology applies throughout the document, project terminology travels in `.typsastra/config.json`, and language-family terms remain isolated. Keyboard-language completion can change suggestions without changing these spellcheck scopes.
