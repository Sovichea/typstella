# Document typography

## Why use it?

A normal Typst fallback stack applies the same size to every font:

```typst
#set text(font: ("MiSans Khmer", "MiSans Latin"), size: 11pt)
```

This creates two practical problems:

- fonts for different scripts may look mismatched at the same point size;
- a font listed first may contain another script and prevent that script's
  intended font from being used.

Typsastra preserves the familiar fallback stack by default and can optionally
restrict each font to one script without rewriting document content.

## Configure script fonts

1. Open **Document Typography** from the `Aa` toolbar button.
2. Set the shared document size.
3. Add each script used by the document.
4. Choose its installed font and adjust its scale if necessary.
5. Optionally assign the language provider used for spellcheck and completion.
6. Drag the script rows into priority order. With the drag handle focused, Up
   and Down Arrow provide the same operation from the keyboard.
7. Optional: select **Override** on one row if that font should own numbers,
   punctuation, spaces, and other shared symbols.
8. Choose **Apply to document**, or **Apply as template** for shared project
   typography.

For example:

```text
Document size  11pt
Khmer          MiSans Khmer    0.95×
Latin          MiSans Latin    1.10×
Arabic         MiSans Arabic   1.00×
```

With no override selected, Typsastra generates an ordinary ordered fallback:

```typst
font: ("MiSans Khmer", "MiSans Latin", "MiSans Arabic")
```

For mixed Khmer and English, neither ordinary order can guarantee both desired
fonts:

- `("MiSans Latin", "MiSans Khmer")` preserves the Latin font, but Western
  digits and shared punctuation normally come from the Latin family.
- `("MiSans Khmer", "MiSans Latin")` gives those shared characters to the
  Khmer family, but many Khmer fonts also contain Latin glyphs. Embedded English
  may therefore use the Khmer family without ever reaching MiSans Latin.

This overlapping coverage is the main reason to enable **Override**. If Khmer
owns the override, Typsastra generates descriptors like:

```typst
(name: "MiSans Khmer", covers: regex("[\p{scx=Khmer}\p{scx=Common}]"))
(name: "MiSans Latin", covers: regex("\p{scx=Latin}"))
```

`scx` means Unicode Script Extensions. The restriction prevents a Khmer font's
built-in Latin glyphs from taking ownership of embedded English. `Common` gives
the selected Khmer font spaces, Western digits, generic punctuation, and shared
symbols. The result is Khmer typography for the dominant text and MiSans Latin
for actual Latin letters. Clear the checkbox to return to ordinary fallback.

Typsastra asks for confirmation before generating a scaled font. Generated
variants live only in Typsastra's private global application-data cache, where
they can be reused by other projects. No font data or cache path is written
into `.typsastra` or included in project exports.

Typsastra recommends no more than 10 cached scale variants per font face. It
asks before creating another variant and keeps every existing variant until the
user explicitly manages the cache. Cache inspection, deletion, and renewal
controls are planned for v0.5.2.

Keep script scales between `0.90×` and `1.10×` when possible. Typsastra warns
before applying a larger adjustment because this control is for fine optical
balancing, not for doubling the font size. Results beyond ±10% vary between
fonts and may not be represented accurately.

> **PDF limitation:** Non-`1.0` scales are experimental. Typst may normalize a
> scaled font while creating a PDF subset, producing unscaled glyph outlines
> with scaled spacing. Typsastra does not post-process the PDF or make preview
> differ from export. Use `1.0` for dependable PDF output and inspect every
> exported PDF when testing another scale.

## What this does not control

Script assignments do not change:

- the source editor's font;
- Typst `lang` or `dir`;
- Typst's `lang` or `dir` behavior.

The optional language field does select Typsastra spellcheck and word
completion for that script. Leave it off when the script should receive no
language analysis.

For implementation details and limitations, see
[Document typography](../DOCUMENT_TYPOGRAPHY.md). Try
`02-multilingual-writing/01-script-font-assignments`.
