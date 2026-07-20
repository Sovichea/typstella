# Installing language providers

Open Settings → Editor → Language Tools. English and Khmer are bundled. Other
catalog providers may be downloaded, verified, enabled, disabled, or removed
independently.

Each entry reports its support level:

- **Basic**: dictionary spellcheck;
- **Enhanced**: language-specific tokenization or boundaries;
- **Deep**: script editing policy, segmentation, spellcheck, and completion.

Installing a provider does not make it own every matching-script word. Static
Typst language scopes and the configured primary/embedded-provider rules decide
routing.

If a document declares an unavailable language, Typsastra underlines its `lang`
value and overlays a warning on the declaration line. Hovering shows a tooltip;
activating the marker opens Language Tools. Only that scope is left unchecked.
After a matching provider becomes installed and enabled, analysis restarts and
the warning disappears without reopening the file.

Enable the spellcheck developer log when reporting catalog or routing failures.
Try `03-language-providers/04-optional-dictionaries`.
