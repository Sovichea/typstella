# Long-document workflow

## Prefer render-on-save when editing is the priority

For very large source files, choose preview-on-save so typing does not request a
compile after each edit. Language analysis and editor extensions are bounded or
deferred where possible, but a 20,000-line active source still requires more
work than an ordinary chapter.

Typsastra restores inactive tabs lazily. A large text file or PDF is not loaded
until activated, and activation asks for confirmation in the editor pane. This
keeps workspace startup responsive even when the previous session contained
large files.

## Navigate the preview directly

Enter a page number in the preview toolbar instead of animating through hundreds
of pages. Manual forward sync jumps immediately to Tinymist's page-and-line
position. The first source-map session is warmed when preview becomes ready so
the first request does not pay session startup after the click.

## Memory ownership

Tinymist owns compilation memory; the virtualized PDF preview bounds resident
canvases and page resources separately. Closing a project, restarting the
workspace, or selecting a new main file terminates and replaces the owned
Tinymist processes so memory from the previous document is not accumulated.

If memory remains unexpectedly high, capture process-level measurements for the
Typsastra host, WebView, GPU process, and Tinymist separately.
