# PDF preview and source synchronization

Typsastra uses the same virtualized viewer for compiled Typst output and direct
PDF files. Only a bounded set of visible and nearby pages receives rendered
canvases, keeping long-document memory independent of total page count as far as
practical.

## Page navigation

The toolbar shows current page and total page count. Enter a valid page number
to jump immediately. Forward sync also uses an immediate jump; it does not run a
long scroll animation through intermediate pages.

## Forward and inverse sync

Use **Reveal Cursor in Preview** or `Alt+Enter` (`Option+Enter` on macOS) for
forward sync. Tinymist currently supplies page and source-line positioning, not
a reliable exact horizontal word coordinate. Typsastra therefore lands at the
line position instead of guessing by PDF text matching.

Inverse sync depends on the source-map data-plane connection. Preview loading
warms the hidden source-map session without requesting a memory-heavy vector
snapshot. If synchronization fails, inspect the Typst synchronization log for
session readiness, WebSocket connection, request, and timeout events.

## Compilation failures

The last successful preview remains visible when a later compilation fails. Fix
the reported Typst diagnostic and save or edit according to the selected render
mode.

## Linux white preview

On affected Wayland/WebKitGTK systems, enable **Disable WebKitGTK DMA-BUF
renderer** under Settings → Preview → Linux preview compatibility and restart.
The option is Linux-only and may reduce rendering performance.

See [Preview implementation notes](../PREVIEW_INTERCEPTION.md) for internals.
