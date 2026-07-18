# PDF Preview Interaction Implementation Plan

## Objective

Make PDF gesture scrolling and scrollbar-drag release feel immediate enough for Typsastra v1.0 without redesigning the complete preview transport or optimizing unsupported raster-heavy engineering documents.

The v1.0 contract is:

> Keep a useful page surface available during motion, then prioritize the settled visible page immediately.

Compilation and initial document loading are not the focus of this plan. A four-to-seven-second initial load is acceptable for an unusually long document as long as the application remains responsive and ordinary documents continue to open quickly.

## Scope

This plan owns:

- touchpad and other gesture-scroll presentation;
- scrollbar-drag destination presentation;
- scroll-settle detection;
- render priority and selective cancellation;
- bounded low-resolution draft surfaces;
- directional idle preparation;
- final-canvas retention and eviction;
- runtime interaction measurements and v1.0 release gates.

This plan does not own:

- removal of the current base64 compiler-preview transport;
- range loading for large existing PDF files;
- raster-heavy engineering drawing support;
- a full arithmetic page-layout index;
- true page-container DOM windowing;
- multiple PDF.js workers;
- hardware-acceleration policy;
- custom GPU or OffscreenCanvas page rendering;
- more than one active render lane unless later measurements justify it.

Those improvements may be evaluated after v1.0 without blocking this workstream.

## Current bottleneck

The current viewer deliberately pauses expensive work while scrolling. It uses a boolean motion flag, cancels active page work, waits for a fixed idle timeout, and then resumes one serialized render queue. This protects scrollbar input but creates two visible delays:

1. Gesture scrolling can expose a page whose canvas was never rendered or was already released.
2. Releasing the scrollbar thumb still incurs the fixed settle delay before the destination page receives render priority.

The correction is not to render every page crossed during motion. The viewer must retain or prepare cheap page representations and render only the likely destination at final quality.

## v1.0 architecture

Keep `PreviewFrame` as the orchestrator. Introduce small, testable policies rather than performing a broad preview refactor:

```text
PreviewFrame
├── PreviewMotionController
├── PreviewRenderScheduler
├── PreviewDraftCache
└── existing PDF.js document, page slots, and final-canvas lifecycle
```

Suggested files:

```text
src/preview/
├── previewFrame.ts
├── previewMotion.ts
├── previewRenderScheduler.ts
├── previewDraftCache.ts
└── virtualization.ts
```

The new modules should contain deterministic policy and bookkeeping. PDF.js calls and DOM mutations remain owned by `PreviewFrame`.

## Terminology

### Draft surface

A bounded low-resolution rendering used to preserve orientation and avoid an empty visible page. A draft is not expected to provide final reading quality.

### Final surface

The existing normal-resolution page canvas. The current maximum of seven resident final pages remains the v1.0 contract.

### Motion destination

The page predicted to become visible when the current gesture or scrollbar movement settles.

### Settled destination

The visible page after the scroll position remains stable for the required animation frames.

## Interaction state

Use a motion state machine instead of a fixed timeout:

```ts
type PreviewMotionState =
  | "idle"
  | "moving"
  | "settling";

interface PreviewMotionSample {
  scrollTop: number;
  timestamp: number;
  velocity: number;
  direction: -1 | 0 | 1;
  stableFrames: number;
  pointerDown: boolean;
}
```

Transitions:

```text
scroll position changes       -> moving
first stable animation frame  -> settling
third stable animation frame  -> idle
new movement while settling   -> moving
new PDF generation            -> reset
zoom or layout replacement    -> reset while preserving its explicit anchor
```

Pointer state is best-effort only. WebView scrollbar implementations do not consistently expose native thumb interaction as ordinary DOM pointer events. Stable animation frames are the authoritative fallback.

Behavior:

```text
moving:
  display retained final or cached draft surfaces
  update destination and direction
  do not start distant final renders

first stable frame:
  commit a cached destination draft immediately
  schedule an uncached destination draft at highest priority

third stable frame:
  schedule the visible final surface at highest priority
  begin low-priority directional preparation only after it commits
```

A short timeout remains only as a safety fallback if animation frames or pointer events are interrupted.

## Render scheduling policy

Use one active PDF.js render lane for the initial v1.0 implementation.

```ts
type PreviewRenderQuality = "draft" | "final";

interface PreviewRenderRequest {
  generation: number;
  pageNo: number;
  quality: PreviewRenderQuality;
  priority: number;
  reason:
    | "settled-visible"
    | "motion-destination"
    | "directional-neighbor"
    | "idle-preparation";
}
```

Priority order:

```text
0  settled visible final
1  motion destination draft
2  next page in travel direction
3  previous page
4  idle draft preparation
```

Queue rules:

- Deduplicate by PDF generation, page, quality, and zoom/render key.
- Never allow an older generation to commit.
- A final surface supersedes a draft request for the same page but does not remove an already committed draft until the final canvas is ready.
- A visible request may promote an existing queued request without creating duplicate work.
- High-velocity motion updates destination bookkeeping without queuing every crossed page.
- Final rendering begins only when the destination settles or was already close enough to finish safely.

## Selective cancellation

Do not cancel all active page work merely because scrolling began.

Keep an active render when:

- it belongs to the current PDF generation and zoom;
- it targets the visible page, motion destination, or a page within two pages of that destination.

PDF.js does not expose reliable render-progress completion. Do not infer that a task is "nearly finished" from elapsed time; proximity and priority are the cancellation inputs.

Cancel an active render when:

- its PDF generation or zoom key is stale;
- the destination moved far outside its render window;
- a higher-priority visible request cannot otherwise start promptly; or
- the document is being disposed.

PDF replacement, zoom replacement, and project closure retain their existing hard-cancellation behavior.

## Two-tier page presentation

Each page slot may contain:

```text
draft surface
final surface
annotation links
```

Presentation rules:

1. Keep an existing final canvas visible while it remains valid.
2. Otherwise attach a cached draft immediately when available.
3. Never remove the draft before the final replacement commits.
4. When the final commits, hide or detach the draft without destroying it unless the draft cache evicts it.
5. A failed or cancelled final render leaves the valid draft visible.
6. A new PDF generation may reuse scroll position but never reuse draft pixels from the previous generation.

## Draft rendering policy

Draft quality must be bounded by pixels rather than only by a fixed scale:

```ts
interface DraftPolicy {
  outputScale: number;
  maxPixelsPerPage: number;
  maxTotalBytes: number;
}
```

Initial policy for qualification:

```text
output scale target:   0.35-0.50
maximum draft pixels:  1.5 million per page
total draft budget:    48 MiB default
hard upper budget:     64 MiB
```

The exact defaults must be selected from benchmark results. Estimated draft cost is `canvas.width * canvas.height * 4`. Eviction occurs before the cache exceeds its byte budget.

Draft render keys include PDF generation and page number. Drafts may be CSS-scaled during zoom as temporary placeholders; they are not continuously regenerated at every intermediate zoom level.

## Draft cache policy

Use a byte-bounded LRU cache. Page count is informational rather than authoritative.

Retention order:

```text
visible page
motion destination
next pages in motion direction
previous page
most recently used remaining drafts
```

For a short ordinary document, the cache may hold drafts for every page when they fit within the budget. For a long document, it retains a directional window and evicts distant drafts.

The seven-page final-canvas limit remains separate from the draft byte budget. Performance diagnostics must report both categories independently.

## Directional idle preparation

After the visible final surface commits and the viewer remains idle:

1. Prepare the next page in the most recent direction.
2. Prepare the previous page.
3. Continue outward in the likely direction.
4. For short documents, continue until all drafts are cached or the byte budget is reached.
5. Stop immediately when motion, zoom, PDF replacement, or a higher-priority render begins.

Use `requestIdleCallback` only when available and always provide a controlled fallback. Starting a PDF.js page render is not an interruptible idle slice, so preparation must remain serialized and must recheck motion before each page.

## Final-canvas retention

Intersection changes should no longer immediately destroy every page that leaves the overscan region.

Instead:

- mark the page as outside the current render window;
- retain its final canvas while the seven-page budget allows;
- evict the farthest and least recently useful final canvas when the budget is exceeded;
- prefer retaining pages in the latest motion direction;
- call `page.cleanup()` only after no active task owns the page and its retained resources are evicted.

This allows short backward gestures to reuse a final canvas rather than expose an empty slot.

## Runtime measurements

Add measurements narrowly tied to the two v1.0 problems:

```text
preview.motion-handler
preview.motion-settle
preview.destination-draft-queue
preview.destination-draft-commit
preview.destination-final-queue
preview.destination-final-commit
preview.draft-cache-hit
preview.draft-cache-miss
preview.render-cancel
preview.render-promote
```

Definitions:

- `motion-settle`: last changed scroll position to the stable-frame decision.
- `destination-draft-commit`: stable-frame decision to a visible draft commit.
- `destination-final-commit`: idle decision to visible final commit.
- Queue delay and PDF.js render time are recorded separately.
- Cache hits must distinguish retained final surfaces from draft surfaces.

Store a bounded rolling sample and report p50, p95, and maximum in Developer mode. Instrumentation must not scan the full document or allocate per-scroll-event objects without a bound.

## Implementation phases

### Phase PV0 — Baseline and contracts

- [ ] **PV0.1** Add the interaction measurements without changing behavior.
- [ ] **PV0.2** Add a deterministic 20-page mixed-script fixture and retain the existing 100-page fixture.
- [ ] **PV0.3** Record Windows and Linux baselines for gesture scrolling, scrollbar release, resident canvases, and visible commit latency.
- [ ] **PV0.4** Add pure tests for motion samples, stable frames, direction reversal, immediate re-grab, and reset.
- [ ] **PV0.5** Document which metrics are automated and which require real WebView/manual input.

Exit gate: the existing delay is measurable from the final scroll movement through draft/final canvas commit.

### Phase PV1 — Motion controller

- [ ] **PV1.1** Replace the boolean/fixed-delay flow with `PreviewMotionController`.
- [ ] **PV1.2** Run one animation-frame sampling loop only while moving or settling.
- [ ] **PV1.3** Treat pointer state as an optimization and stable frames as the fallback.
- [ ] **PV1.4** Reset correctly on re-grab, direction reversal, zoom, PDF generation replacement, and disposal.
- [ ] **PV1.5** Pause background geometry and idle preparation during motion without blocking visible presentation.

Exit gate: releasing a stationary scrollbar destination is recognized within three frames, with the first destination action occurring after one stable frame.

### Phase PV2 — Priority and retention

- [ ] **PV2.1** Introduce the deduplicating priority scheduler with one active lane.
- [ ] **PV2.2** Promote visible work instead of appending duplicate requests.
- [ ] **PV2.3** Replace blanket scroll cancellation with distance- and generation-aware cancellation.
- [ ] **PV2.4** Stop immediately unrendering every page that leaves the observer window.
- [ ] **PV2.5** Preserve the seven-final-canvas limit using distance, direction, and recent use for eviction.
- [ ] **PV2.6** Add stale-generation, stale-zoom, promotion, cancellation, and final-budget tests.

Exit gate: a recently visited page within the retained window reappears without rerendering, and stale work never commits.

### Phase PV3 — Draft presentation

- [ ] **PV3.1** Add separate draft and final layers to a page slot.
- [ ] **PV3.2** Implement bounded draft resolution and byte accounting.
- [ ] **PV3.3** Implement the byte-bounded LRU draft cache.
- [ ] **PV3.4** Commit cached drafts on the first stable frame.
- [ ] **PV3.5** Schedule an uncached destination draft ahead of final rendering.
- [ ] **PV3.6** Keep the draft visible until final commit and through final cancellation/failure.
- [ ] **PV3.7** Clear every draft deterministically on generation disposal.
- [ ] **PV3.8** Add cache-budget, layer-swap, zoom-placeholder, cancellation, and disposal tests.

Exit gate: no destination with a valid cached draft presents an empty page, and draft memory remains within its configured byte budget.

### Phase PV4 — Directional preparation

- [ ] **PV4.1** Prioritize the next likely page from velocity and direction.
- [ ] **PV4.2** Prepare drafts serially after the visible final surface commits.
- [ ] **PV4.3** Stop preparation immediately when interaction resumes.
- [ ] **PV4.4** Allow short documents to fill the draft cache when the complete set fits the budget.
- [ ] **PV4.5** Verify rapid reversal, page jumps, repeated re-grab, and long-document boundedness.

Exit gate: normal forward and backward gesture scrolling through the 20-page fixture predominantly uses retained finals or draft-cache hits.

### Phase PV5 — Qualification and release integration

- [ ] **PV5.1** Run the interaction matrix on Windows/WebView2 and Linux/WebKitGTK.
- [ ] **PV5.2** Verify trackpad or precision-touchpad gesture input where hardware is available; document unavailable hardware coverage.
- [ ] **PV5.3** Test scrollbar continuous drag, release, immediate re-grab, rapid direction reversal, page 1-to-20 jump, zoom during motion, resize after motion, and PDF replacement during motion.
- [ ] **PV5.4** Verify source synchronization and scroll-anchor behavior are unchanged.
- [ ] **PV5.5** Verify the undocked preview follows the same generation, cache, and cancellation contracts.
- [ ] **PV5.6** Update `PERFORMANCE_GATES.md`, `BENCHMARKS.md`, developer diagnostics, and release notes with measured results.
- [ ] **PV5.7** Remove temporary instrumentation or keep it behind Developer mode when it remains useful.

Exit gate: all v1.0 acceptance criteria below pass without increasing unbounded memory or introducing stale/blank replacement frames.

## Automated test matrix

Pure policy tests:

```text
continuous movement never becomes idle
one stable frame requests destination presentation
three stable frames permit final rendering
movement after one or two stable frames returns to moving
direction reversal changes preparation order
immediate re-grab prevents obsolete final work
priority promotion does not duplicate a request
generation and zoom changes reject stale commits
draft cache evicts before exceeding its byte budget
final eviction never exceeds seven canvases
```

Preview contract tests:

```text
draft remains until final commit
cancelled final leaves draft visible
retained final wins over a draft
new generation clears old drafts
scroll anchor survives resize and zoom
PDF replacement during motion cannot reveal the stale generation
```

Manual WebView scenarios:

```text
slow gesture scroll through 20 pages
fast gesture with momentum through 20 pages
continuous scrollbar drag from page 1 to page 20
release and immediately re-grab the scrollbar
rapidly reverse the scrollbar direction
jump between distant pages in a 100-page document
zoom repeatedly after a settled drag
edit while preview motion is still settling
```

## v1.0 acceptance criteria

For the qualified 20-page mixed-script fixture:

| Metric | v1.0 gate |
|---|---:|
| Scroll input delay p95 | under 16 ms |
| Motion handler p95 | under 8 ms |
| Stable destination decision | first action within 1 stable frame |
| Cached draft visible after settle | under 50 ms p95 |
| Uncached draft queued after settle | under 32 ms p95 |
| Uncached draft committed | under 200 ms p95 |
| Final visible page committed | under 500 ms p95 |
| Resident final canvases | 7 maximum |
| Draft cache | 64 MiB hard maximum |
| Empty page when a valid draft exists | never |
| Stale generation or zoom committed | never |

Additional release requirements:

- Gesture scrolling must not attempt a final render for every transient page.
- Scrollbar release must not wait for the former fixed 120 ms delay.
- The application must remain responsive when a destination page takes longer than its target render budget.
- A valid retained final or draft surface must remain visible until its replacement commits.
- Memory must remain bounded after repeated full-document scrolling, zoom, recompilation, and project closure.
- The existing first-page, zoom, source-sync, resize-anchor, and compiler-recovery contracts must continue to pass.

## Rollout and fallback

Land each phase behind internal policy boundaries but avoid a permanent user-facing compatibility toggle unless platform qualification finds a real backend-specific failure.

Safe fallback order:

1. Disable idle draft preparation while retaining cached destination drafts.
2. Reduce the draft byte budget.
3. Disable uncached drafts during active motion but retain stable-frame scheduling.
4. Retain the priority scheduler and selective final-canvas retention even if drafts must be disabled on one platform.

Never fall back to unbounded page rendering, multiple active render lanes, or stale-generation presentation.

## Completion definition

This workstream is complete only when:

- phases PV0 through PV5 are complete;
- automated policy and preview contract tests pass;
- Windows and Linux manual interaction qualification is recorded;
- the v1.0 acceptance metrics are published;
- no blocker remains in gesture scrolling, scrollbar release, preview memory, source synchronization, zoom, resize anchoring, or stale-generation safety.
