# Tutorial troubleshooting

## Native actions do nothing in development

Run `bun run tauri dev`. `bun run dev` starts only the browser frontend and
cannot provide native filesystem, process, dialog, or managed-toolchain APIs.

## A language scope has no spelling marks

Check that its matching provider is installed and enabled. An unavailable
explicit scope should mark the `lang` declaration instead of borrowing another
dictionary. Enable Settings → Developer → Spellcheck and language scopes, then
inspect provider catalog and routing events.

## Completion does not appear

Check the suggestion toggle, selected language source, provider completion
capability, current keyboard mapping, and whether an IME composition is active.
Keyboard-language completion does not change document spellcheck scope.

## An included file previews by itself

Confirm that the intended `.typ` root is set as the project main file. Open the
included source normally; changing active tabs should not change preview owner.

## A large restored file was not loaded

This is intentional. Activate the tab and confirm the large-file notice in the
editor pane. Inactive large tabs stay lazy to keep workspace startup responsive.

## Preview is white on Linux

Use the Linux DMA-BUF compatibility setting described in
[PDF preview and source synchronization](PDF_PREVIEW_AND_SYNC.md).

For build, packaging, platform, and detailed preview diagnostics, see the full
[troubleshooting reference](../TROUBLESHOOTING.md).
