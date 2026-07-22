# Long-document workflow

## Prefer render-on-save when editing is the priority

For very large source files, choose preview-on-save so typing does not request a
compile after each edit. Language analysis and editor extensions are bounded or
deferred where possible, but a 20,000-line active source still requires more
work than an ordinary chapter.

Typsastra uses two independent guard rails. A large text file or PDF is not
loaded into the editor until you confirm it in the editor pane. Separately, a
large preview does not start Tinymist or render until you confirm it in the
preview pane. The preview check measures the configured root together with its
reachable local includes, templates, and libraries. It therefore applies
whether the editor currently shows the main file or one of its dependencies.

## Navigate the preview directly

Enter a page number in the preview toolbar instead of animating through hundreds
of pages. Once Tinymist returns a page-and-line position, manual forward sync
jumps there without animating through intermediate pages. The first source-map
session is warmed when preview becomes ready so the first request does not pay
session startup after the click. In very long documents, resolving a position
from an included file can still take one or two seconds because current
Tinymist versions scan the compiled document. This is a known issue planned for
the v1.x indexed-forward-sync workstream.

## Memory ownership

Tinymist owns compilation memory; the virtualized PDF preview bounds resident
canvases and page resources separately. Closing a project, restarting the
workspace, or selecting a new main file terminates and replaces the owned
Tinymist processes so memory from the previous document is not accumulated.

If memory remains unexpectedly high, capture process-level measurements for the
Typsastra host, WebView, GPU process, and Tinymist separately.
