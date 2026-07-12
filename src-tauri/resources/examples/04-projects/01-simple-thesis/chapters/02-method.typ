= Method <method>

The document is assembled by `main.typ`, which includes all three chapter files. Opening a chapter retains the thesis's main-document preview.

The method has three steps:

+ define a stable label on every chapter or important result;
+ reference labels normally with Typst's `@label` syntax; and
+ use the full main document when checking final numbering and bibliography output.

This chapter refers back to @introduction and forward to @main-result. Those references resolve through the main-document preview.

== Main result <main-result>

#block(
  inset: 10pt,
  fill: rgb("eef5ff"),
  stroke: rgb("9abbe8"),
)[A chapter can remain focused and independently previewable without changing the source syntax used by other Typst editors.]
