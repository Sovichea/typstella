#set document(title: "Primary and Embedded Scripts")
#set page(margin: 24mm)
// typsastra:typography:start
// typsastra:font-roles {"primary":{"family":"MiSans Latin","script":"latin"},"embedded":[{"family":"MiSans Khmer","script":"khmer","scale":1},{"family":"MiSans Arabic","script":"arabic","scale":1}]}
#set text(font: ("MiSans Latin", "MiSans Khmer", "MiSans Arabic"), size: 11pt)
// typsastra:typography:end
#set heading(numbering: "1.")
#set text(lang: "en")

= Primary and embedded scripts

The primary script leads the ordered font fallback. Embedded scripts add
families for glyphs the primary family does not cover. These are typography
roles; they do not change spellcheck ownership or text direction.

== Latin primary with embedded scripts

English remains the document language. Khmer is rendered with the configured
fallback: សួស្តី ពិភពលោក។ Arabic can use another fallback: مرحبًا بالعالم.

== Explicit language scopes

#text(lang: "km")[ឯកសារនេះប្រើវិសាលភាពភាសាខ្មែរដែលបានបញ្ជាក់។]

#text(lang: "ar", dir: rtl)[هذا نطاق عربي صريح داخل المستند.]

The `lang` values control language tools for those ranges. The ordered font
stack controls glyph selection. The two systems are deliberately independent.

Open the typography control to change the primary role, embedded order, or
uniform scale. Typsastra keeps the resulting Typst font stack portable.
