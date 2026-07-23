# Document typography

Typsastra assigns a font and optional scale directly to each writing script.
There is no primary or embedded typography role: Latin, Khmer, Arabic, and
other scripts use the same configuration model and may be listed in any order.

## Problems addressed

Typst applies one `size` to every family in a normal fallback stack. Different
scripts can have different visual proportions, so fonts at the same nominal
point size may not look balanced.

A font may also contain glyphs for several scripts. For example, a Khmer family
may contain Latin glyphs. In an ordinary ordered stack, placing that family
first can prevent the intended Latin family from being reached. Typsastra keeps
ordinary fallback as the default and offers an explicit shared-character
override when an author needs strict script ownership.

Regex show rules can force another font or size onto a script, but they
reconstruct matching content. Forward and inverse sync can then resolve to a
match or paragraph boundary instead of the intended source character. Typsastra
does not use that approach.

## Default managed Typst rule

By default, Typsastra writes an ordinary Typst fallback stack. Row order has
the same meaning it has in a handwritten Typst document:

```typst
// typsastra:typography:start
// typsastra:document-scripts [{"family":"MiSans Khmer","script":"khmer","scale":0.95,"language":"km"},{"family":"MiSans Latin","script":"latin","scale":1.1,"language":"en-US"},{"family":"MiSans Arabic","script":"arabic","scale":1,"language":"ar"}]
#set text(
  font: (
    "MiSans Khmer",
    "MiSans Latin",
    "MiSans Arabic",
  ),
  size: 11pt,
)
// typsastra:typography:end
```

This is the most portable and predictable default. If an earlier font contains
a requested glyph, Typst uses it; otherwise Typst proceeds through the stack.

## Optional numbers and punctuation override

The **Override** checkbox beside a script is optional. At most one row can be
selected. Selecting it asks that font to own Unicode `Common` characters,
including spaces, Western digits, generic punctuation, and many shared symbols.
Typsastra then restricts every configured font to its assigned script:

```typst
// typsastra:document-scripts [{"family":"Siemreap","script":"khmer","scale":1,"language":"km"},{"family":"Calibri","script":"latin","scale":1,"language":"en-US","common":true}]
#set text(
  font: (
    (name: "Siemreap", covers: regex("\p{scx=Khmer}")),
    (name: "Calibri", covers: regex("[\p{scx=Latin}\p{scx=Common}]")),
  ),
  size: 11pt,
)
```

Clearing the checkbox returns the document to ordinary fallback mode. Selecting
another row moves ownership to that row; Typsastra never writes more than one
`"common": true` entry.

`scx` is the Unicode Script Extensions property. It includes characters that
Unicode associates with a script, including relevant marks that may not have
that script as their primary `Script` property.

Font coverage descriptors require Typst 0.13 or newer, matching Typsastra's
supported managed-toolchain baseline.

The Document Typography dialog lets authors drag script rows into the desired
priority order. A focused drag handle also supports Up and Down Arrow for
keyboard reordering. In default mode this is the actual Typst fallback order.
In override mode, script restrictions prevent one font's extra glyphs from
capturing another configured script, so reordering does not change ownership
of the selected shared characters.

Inherited marks are not automatically assigned to the override font. Typst continues
to resolve them through its shaping and fallback context; script-specific
letters and Script Extensions marks remain restricted by the descriptors above.

The metadata comment is ignored by Typst. Typsastra uses it to restore the
toolbar configuration, prepare private cached font variants, and select one
optional language-tools provider per script. Older typography metadata is
migrated when Typsastra reads and reapplies the configuration. The former
format that gave `Common` coverage to every row is interpreted as an override
owned by its first row, preserving its effective shared-character priority.

## Uniform script scaling

Every script entry accepts a uniform scale from `0.5` to `2.0`, relative to the
shared document point size. For an `11pt` document, Latin can use `1.1`, Khmer
`0.95`, and Arabic `1.0`; no script has a special base-font role.

Fonts supplied internally by the Typst compiler, such as New Computer Modern,
must remain at `1.0` unless that family is also installed locally. Typsastra
cannot access or extract the compiler's embedded font files to create a scaled
variant. The typography dialog disables the scale field for these fonts. A
manually edited non-unit directive produces an error and is reset to `1.0`
instead of starting font generation. Install a local copy of the family to
enable scaling.

Typsastra treats `0.90×` through `1.10×` as the recommended fine-adjustment
range. Values outside that range require confirmation because script scaling
is intended to balance fonts optically, not to double or substantially change
the document text size. Accurate representation beyond ±10% is not guaranteed
and varies from one font to another.

When a file is selected as the project's main file, Typsastra reads its managed
typography directive before changing the preview target. If its generated font
cache is missing or no longer matches the directive, Typsastra lists the
required scales and asks for confirmation before generating fonts. Cancelling
also cancels the main-file change, so the directive, typography toolbar, font
cache, and Tinymist session cannot silently diverge. An already matching cache
does not prompt again.
Selecting a main file without a managed typography directive clears scaled
fonts left by the previous main file before Tinymist restarts.

Typography directives in non-main files are inert workspace configuration.
They can be edited through source or the typography toolbar without prompting,
generating fonts, or restarting Tinymist. Typsastra evaluates such a directive
only if that file is later selected as the project's main file.

When a scale differs from `1.0`, Typsastra:

1. locates every installed TTF or OTF face in the selected family;
2. creates a uniformly scaled copy by changing the OpenType units-per-em value;
3. recalculates the `head` table and whole-font checksums;
4. writes the result to Typsastra's private application-data font cache;
5. records the selected global variants outside the project and restarts
   Tinymist with only those variant directories in `TYPST_FONT_PATHS`.

Changing units-per-em asks the font engine to interpret outlines, advances,
vertical metrics, and OpenType positioning anchors against a different em
square. Generated fonts retain their original internal family names. The
global cache is private to the local Typsastra installation. Another project
requesting the same font and scale reuses the cached variant without rescaling.
Font bytes and machine-specific cache paths are never written under
`.typsastra`, copied with workspace settings, or included in project exports.
Recipients install the original fonts and reproduce any scale locally.
Typsastra rechecks the main-file directive before starting workspace services,
so a directive changed outside the app cannot silently reuse a stale selection.

Typsastra recommends keeping at most 10 cached scale variants per font face.
Reusing an existing variant never prompts. When a main-file change, toolbar
edit, or direct typography-directive edit would create an additional variant
after that limit, Typsastra asks for confirmation first. It does not delete an
existing variant automatically. Advanced controls for viewing, deleting, and
renewing global variants are planned for v0.5.2.

### Known Typst PDF limitation

Non-`1.0` script scaling is experimental for PDF output. Typst's PDF subsetter
may normalize a generated font back to a 1000-unit em square while retaining
advance widths calculated from the scaled font. When that happens, glyphs keep
their unscaled outlines but occupy scaled horizontal space, which looks like
excessive letter spacing. Typst does not apply this normalization consistently
to every font or scale; for example, a 2x subset may retain a 500-unit em square
while another scaled subset is normalized to 1000 units.

This behavior is reproducible with the Typst CLI and a generated font, without
Typsastra's preview layer. Typsastra therefore does not rewrite the exported
PDF or apply a preview-only correction. Preview and exported PDF intentionally
show the same result. Use `1.0` scales when reliable, portable PDF output is
required, and verify every non-unit scale in the exported PDF with the intended
PDF reader.

The managed source block remains valid Typst. Outside Typsastra, or when the
generated font cache is absent, the original installed family is used and the
metadata scale is ignored. This preserves source compatibility at the cost of
the optional visual scale not being portable.

Two assignments that use the same physical family with different scales are
not supported because both generated copies would have the same internal family
name. Choose separate families or use the same scale for those assignments.

OpenType collections (`.ttc` and `.otc`) are not transformed. Select an
individual TTF or OTF face for scaling.

## Application and boundaries

**Apply to document** inserts or replaces the managed block. **Apply as
template** updates a detected local template or creates
`typsastra-template.typ`, allowing included chapters to inherit the same rule.

Document Typography does not change CodeMirror's source-editor font or Typst
`lang` and `dir`. Its optional language selection does control Typsastra
spellcheck and word completion for the assigned script. A script with no
language is intentionally left unchecked and receives no Typsastra completion.
Typst language scopes and keyboard layouts do not override this selection.
When the file is configured as the workspace main document, these language
assignments are inherited by its included chapters, imported templates, and
imported local libraries. Do not duplicate the directive in each dependency.
Unrelated files remain isolated and may provide their own directive.

An applied template retains separate `typsastra:script-fonts` metadata because
Typsastra needs the original family, script, order, and scale to edit the
generated typography rule. This is typography metadata, not language routing;
it deliberately contains no language-provider assignments.

Typsastra does not override `raw`; inline and block raw content keeps Typst's
normal raw-font behavior.

## Rust and WASM

The pure transformation engine lives in `crates/font-scaler`. Desktop
Typsastra uses its native Rust API. The same crate exposes a WASM binding behind
the `wasm` feature:

```text
cargo check --manifest-path crates/font-scaler/Cargo.toml --features wasm
```

The WASM host supplies font bytes and persists the result. The transformation
engine itself performs no filesystem or system-font access.
