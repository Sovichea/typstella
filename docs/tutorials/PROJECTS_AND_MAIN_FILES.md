# Projects and main files

## One project, one configured main file

The workspace directory identifies the project. The configured main `.typ` file
identifies its document. An included chapter is source within that document, so
opening it changes the editor tab but not preview ownership.

Set the main file from the Explorer or tab context menu. Renaming the main file
updates the project relationship and restarts the owned Tinymist sessions rather
than leaving a stale compiler target.

## Workspace restoration

Typsastra stores portable state under `.typsastra`:

- `config.json`: project ID, relative main file, recommended toolchain, and
  accepted project terminology;
- `workspace.json`: open tabs, active file, cursor/scroll/fold state, expanded
  directories, pane layout, and selected toolchain.

Paths are project-relative and normalized with `/`, so moving or copying the
whole directory retains the main-file setting. Workspace state is loaded before
the workspace UI appears. PDF compilation may continue asynchronously.

## Generated data

`.typsastra/cache` and generated font data are disposable. Do not copy, commit,
or share them. They can be rebuilt from source. Project export retains applicable
workspace settings but filters generated data.

## Large restored tabs

Restored inactive tabs are lazy: Typsastra does not read a large text file or
PDF merely because it appears in the tab bar. Activating a large file shows an
editor-pane confirmation before expensive loading begins.

Try the bundled `05-project-portability/01-main-and-included-files` example.
