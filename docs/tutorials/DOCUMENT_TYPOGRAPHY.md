# Document typography

Open Typsastra's typography control and choose one primary script plus any
embedded scripts. The primary family leads an ordered Typst font stack;
embedded families follow in the order you choose.

```typst
// typsastra:typography:start
#set text(font: ("MiSans Latin", "MiSans Khmer", "MiSans Arabic"), size: 11pt)
// typsastra:typography:end
```

The primary script need not be Latin. A Khmer-first document can add Latin and
Arabic fallbacks. Typsastra can recommend installed families with appropriate
coverage, but it does not silently replace the author's selection.

Typography roles control glyph selection and optional uniform embedded-font
scaling. They do not control spellcheck, segmentation, word completion, or text
direction. Use explicit Typst `lang` and `dir` settings for those concerns.

Generated scaled fonts under `.typsastra/fonts/generated` are local rendering
artifacts. They are not committed or exported. Recipients install their required
fonts separately.

For exact behavior and limitations, see [Document typography](../DOCUMENT_TYPOGRAPHY.md).
Try `02-multilingual-writing/01-primary-and-embedded-scripts`.
