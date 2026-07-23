# Typsastra v0.6.0 Markdown Live Preview Implementation Plan

## Objective

Provide a responsive, secure live preview for Markdown documentation without
coupling Markdown files to Tinymist, Typst compilation, or the PDF renderer.
The feature supports project READMEs, notes, tutorials, and research-supporting
documentation while keeping Typst authoring as Typsastra's primary purpose.

Markdown preview is a separate presentation surface:

```text
.typ          -> Typst/Tinymist -> virtualized PDF preview
.pdf          -> virtualized PDF preview
.md           -> Markdown parser -> sanitized HTML preview
other text    -> editor only
```

## Product scope

The first release supports:

- headings, paragraphs, emphasis, strong text, block quotes, and horizontal
  rules;
- ordered and unordered lists, task lists, and tables;
- fenced and inline code;
- links and statically referenced local images;
- Unicode, mixed-script text, and the browser's standard bidi behavior;
- theme-aware typography and code styling;
- debounced preview updates from the in-memory editor document;
- preservation of preview scroll position across edits and tab changes;
- Ctrl/Cmd-hover and click behavior consistent with other Typsastra links.

GitHub-Flavored Markdown compatibility should be documented precisely rather
than implied from the parser name.

## Explicit exclusions

v0.6.0 does not include:

- Markdown-to-Typst or Typst-to-Markdown conversion;
- Markdown forward or inverse source synchronization;
- WYSIWYM or rich-text editing;
- Markdown PDF export;
- executable code blocks, diagrams, plugins, or embedded web applications;
- automatic rewriting of Markdown source;
- a second LSP or Tinymist process for Markdown.

These exclusions prevent a documentation convenience from becoming a second
document-authoring architecture.

## Architecture

Add a renderer router that selects a presentation surface from the active file:

```text
src/preview/
├── previewRouter.ts
├── previewFrame.ts
└── markdownPreviewFrame.ts
```

`previewRouter.ts` owns only renderer selection and visibility. It must not
duplicate compiler ownership, project identity, or tab policy.

`markdownPreviewFrame.ts` owns:

- Markdown parsing;
- HTML sanitization;
- theme and typography installation;
- local-resource resolution;
- link interaction;
- scroll anchoring;
- stale-generation rejection;
- disposal of Markdown DOM and event handlers.

The existing PDF preview remains mounted but hidden while Markdown is active so
returning to a Typst tab can restore the last successful PDF without
recompilation. Markdown rendering must not create or restart a Tinymist task.
Memory measurements must verify that retaining the bounded PDF session alongside
one Markdown document remains acceptable.

## Security and resource policy

Markdown is untrusted project content.

- Sanitize all generated HTML with an explicit allowlist.
- Remove scripts, event-handler attributes, forms, iframes, embedded objects,
  unsafe URLs, and CSS injection.
- Do not execute raw HTML merely because the Markdown parser supports it.
- Resolve local images relative to the Markdown file and restrict them to
  explicitly permitted workspace resources.
- Do not fetch remote images automatically; present a blocked-resource state
  unless the user deliberately opens the URL externally.
- Open external links only through the existing controlled shell action.
- Reject stale asynchronous parse or resource results after edits, tab changes,
  project closure, or renderer replacement.
- Reuse the large-file editor guard before loading unusually large Markdown
  source.

## Interaction contract

- Update after a bounded debounce without writing the source file.
- Preserve the nearest heading or relative scroll anchor when the DOM changes.
- Restore separate scroll positions for different Markdown tabs.
- Opening a Markdown file must not change the configured Typst main file,
  preview root, Tinymist lifecycle, or PDF page position.
- Switching back to Typst restores the previous PDF immediately unless the
  Typst source independently requires recompilation.
- Local Markdown links open the corresponding workspace file in Typsastra.
- Other supported local files follow the existing in-app file policy; external
  URLs require an explicit user gesture.
- Compilation and source-sync controls are disabled or hidden while the
  Markdown renderer is active.

## Performance budgets

Initial qualification targets:

```text
input-to-preview update p95       < 150 ms for a 1,000-line README
scroll restoration               < 16 ms of main-thread work
stale render visible              never
Tinymist starts from Markdown     zero
Typst recompiles from tab switch  zero
retained Markdown renderers       one
```

Record parser, sanitization, DOM commit, image metadata, and scroll-restoration
timings separately. Optimize measured bottlenecks rather than adding
incremental DOM complexity preemptively.

## Implementation phases

### Phase 0 — contracts and fixtures

- Lock supported syntax and excluded behavior.
- Add multilingual, mixed-direction, table, task-list, code, link, image,
  malformed HTML, and malicious-content fixtures.
- Record baseline tab-switch and PDF-session memory.

### Phase 1 — renderer routing

- Add active-file renderer selection.
- Mount and hide preview surfaces without changing Typst compiler ownership.
- Disable irrelevant PDF actions while Markdown is active.

### Phase 2 — parsing and sanitization

- Select a maintained Markdown parser and sanitizer.
- Implement the allowlist, safe URL policy, and stale-generation rejection.
- Add theme-aware output and code styles.

### Phase 3 — resources and navigation

- Resolve safe local images and workspace links.
- Add Ctrl/Cmd link indication and explicit external opening.
- Block automatic remote-resource loading.

### Phase 4 — state and performance

- Add debounced updates, heading-aware scroll anchoring, and per-tab restoration.
- Verify that Markdown typing and tab switching never compile Typst.
- Measure memory while alternating repeatedly between Markdown and long PDFs.

### Phase 5 — documentation and qualification

- Add a Markdown preview tutorial and troubleshooting guidance.
- Test Windows WebView2, Linux WebKitGTK, and macOS WKWebView.
- Publish supported Markdown behavior and security limitations.

## Release gates

- Markdown content cannot execute scripts or load remote resources silently.
- Markdown activation never starts/restarts Tinymist or changes Typst preview
  ownership.
- Returning to a Typst tab restores the prior PDF and page position without an
  unnecessary compile.
- Local links and images resolve cross-platform without escaping the permitted
  workspace boundary.
- Rapid edits cannot display stale Markdown output.
- Complex-script and mixed-direction fixtures remain readable and selectable.
- Large Markdown files retain the existing explicit loading guard.
- All supported syntax, exclusions, and security behavior are documented.
