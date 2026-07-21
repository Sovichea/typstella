#set document(title: "Optional Language Providers")
#set page(margin: 24mm)
#set text(font: "New Computer Modern", lang: "en", size: 11pt)

= Optional language providers

English and Khmer are bundled. French, Spanish, Arabic, Lao spellcheck, and
other catalog entries are optional downloads.

#text(lang: "fr")[Le français reste vérifié uniquement par le fournisseur français.]

#text(lang: "es")[El español requiere su propio proveedor instalado.]

#text(lang: "ar", dir: rtl)[هذا النص يحتاج إلى مزود اللغة العربية.]

#text(lang: "eo")[Ĉi tiu amplekso montras averton kiam provizanto ne disponeblas.]

When a matching provider is unavailable, Typsastra disables spellcheck only in
that explicit scope. It highlights the `lang` declaration and overlays a warning
on its line number. Activate the warning to open Language Tools. Typsastra never
silently substitutes an English dictionary for French or Spanish.
