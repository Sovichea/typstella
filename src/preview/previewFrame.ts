export type PreviewTextPoint = {
  text: string;
  offset: number;
  pageNo?: number;
  documentPosition?: { page_no: number; x: number; y: number };
};

export type PreviewInteractionStatus = {
  kind: "installed" | "blocked" | "debug";
  url: string;
  reason?: string;
};

type PdfJsModule = typeof import("pdfjs-dist");

type PageDimensions = {
  width: number;
  height: number;
};

type ActivePageRender = {
  generation: number;
  task: { cancel(): void } | null;
  page: { cleanup(): void } | null;
};

type PdfClickItem = {
  text: string;
  left: number;
  right: number;
  baseline: number;
  height: number;
};

type SourceTextScrollOptions = {
  ripple?: boolean;
};

const ZOOM_LEVELS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];
const DEFAULT_ZOOM_PERCENT = 90;
const MAX_OUTPUT_SCALE = 2;
const FORWARD_SYNC_GREEN = "#3db489";

export class PreviewFrame {
  private iframe: HTMLIFrameElement | null = null;
  private messageHost: HTMLDivElement | null = null;
  private errorOverlay: HTMLDivElement | null = null;
  private mountedUrl = "";
  private previewZoomPercent = DEFAULT_ZOOM_PERCENT;
  private lastInteractionStatusKey = "";
  private pdfJsPromise: Promise<PdfJsModule> | null = null;
  private pdfLoadingTask: { destroy(): Promise<void> } | null = null;
  private pdfDoc: any = null;
  private observer: IntersectionObserver | null = null;
  private pageDimensions = new Map<number, PageDimensions>();
  private activeRenders = new Map<number, ActivePageRender>();
  private pageTextCache = new Map<number, string>();
  private pageClickItems = new Map<number, PdfClickItem[]>();
  private pdfGeneration = 0;
  private forwardRippleGeneration = 0;

  constructor(
    private readonly pane: HTMLElement,
    private readonly onTextClick: (point: PreviewTextPoint) => void,
    private readonly onInteractionStatus?: (status: PreviewInteractionStatus) => void,
    private readonly onZoomChanged?: (zoomPercent: number) => void
  ) {}

  public get element(): HTMLIFrameElement | null {
    return this.iframe;
  }

  public get currentUrl(): string {
    return this.mountedUrl;
  }

  public get currentZoomPercent(): number {
    return this.previewZoomPercent;
  }

  public zoomIn(): number {
    return this.setZoom(ZOOM_LEVELS.find(level => level > this.previewZoomPercent) ?? this.previewZoomPercent);
  }

  public zoomOut(): number {
    return this.setZoom([...ZOOM_LEVELS].reverse().find(level => level < this.previewZoomPercent) ?? this.previewZoomPercent);
  }

  private setZoom(percent: number): number {
    if (percent === this.previewZoomPercent) return percent;
    const anchor = this.captureScrollAnchor();
    this.previewZoomPercent = percent;
    this.onZoomChanged?.(percent);
    this.cancelAllPageRenders();
    this.layoutPageSlots();
    this.restoreScrollAnchor(anchor);
    requestAnimationFrame(() => this.renderVisiblePages());
    return percent;
  }

  public async loadPdfData(base64Data: string, identity = "compiler-pdf"): Promise<void> {
    const generation = ++this.pdfGeneration;
    const previousScroll = this.captureScrollAnchor();
    this.clearErrorOverlay();
    this.clearMessageHost();

    const iframe = await this.ensureIframe();
    if (generation !== this.pdfGeneration) return;
    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) throw new Error("PDF preview document is unavailable.");

    let nextPdfDoc: any = null;
    let nextLoadingTask: { destroy(): Promise<void> } | null = null;
    try {
      const pdfjs = await this.pdfJs();
      if (generation !== this.pdfGeneration) return;
      const bytes = decodeBase64(base64Data);
      const loadingTask = pdfjs.getDocument({
        data: bytes,
        ownerDocument: iframeDoc,
        cMapUrl: "/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/standard_fonts/"
      });
      nextLoadingTask = loadingTask as unknown as { destroy(): Promise<void> };
      const pdfDoc = await loadingTask.promise;
      nextPdfDoc = pdfDoc;
      if (generation !== this.pdfGeneration) {
        await (pdfDoc as any).destroy();
        return;
      }
      const nextDimensions = await readPdfPageDimensions(pdfDoc, generation, () => this.pdfGeneration);
      if (generation !== this.pdfGeneration) {
        await (pdfDoc as any).destroy();
        return;
      }

      const oldPdfDoc = this.pdfDoc;
      const oldLoadingTask = this.pdfLoadingTask;
      this.observer?.disconnect();
      this.observer = null;
      this.cancelAllPageRenders();
      this.pageTextCache.clear();
      this.pageClickItems.clear();
      nextPdfDoc = null;
      this.pdfDoc = pdfDoc;
      this.pdfLoadingTask = nextLoadingTask;
      nextLoadingTask = null;
      this.pageDimensions = nextDimensions;
      this.mountedUrl = identity;
      this.createPageSlots(iframeDoc, true);
      this.setupIframeInteractions();
      this.installPageObserver(iframe);
      this.restoreScrollAnchor(previousScroll);
      this.reportInteractionStatus({ kind: "installed", url: identity });
      void cleanupPdfResources(oldPdfDoc, oldLoadingTask);
    } catch (error) {
      if (generation !== this.pdfGeneration) return;
      this.setError("PDF Loading Failed", String(error));
    } finally {
      if (nextPdfDoc) {
        try { await nextPdfDoc.destroy(); } catch {}
      } else if (nextLoadingTask) {
        try { await nextLoadingTask.destroy(); } catch {}
      }
    }
  }

  private async pdfJs(): Promise<PdfJsModule> {
    if (!this.pdfJsPromise) {
      this.pdfJsPromise = Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url")
      ]).then(([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      });
    }
    return this.pdfJsPromise;
  }

  private async ensureIframe(): Promise<HTMLIFrameElement> {
    if (this.iframe?.contentDocument?.getElementById("viewer-container")) return this.iframe;
    if (this.iframe) this.iframe.remove();
    const iframe = document.createElement("iframe");
    iframe.className = "preview-frame";
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:100%;height:100%;background:#d8d8d8}
      body{overflow:auto;font-family:sans-serif}
      #viewer-container{box-sizing:border-box;min-width:100%;width:max-content;padding:20px;display:flex;flex-direction:column;gap:20px}
      .pdf-page-container{position:relative;box-sizing:border-box;flex:none;margin:0 auto;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);overflow:hidden}
      .pdf-page-canvas{position:absolute;inset:0;display:block;width:100%;height:100%}
      .textLayer{position:absolute;inset:0;overflow:hidden;line-height:1;opacity:1;--scale-factor:1;pointer-events:none;user-select:none}
      .textLayer span,.textLayer br{position:absolute;color:transparent;white-space:pre;transform-origin:0 0}
      .forward-sync-ripple{position:fixed;z-index:2147483647;box-sizing:border-box;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid ${FORWARD_SYNC_GREEN};border-radius:999px;background:rgba(61,180,137,.16);box-shadow:0 0 0 0 rgba(61,180,137,.34);pointer-events:none;animation:typstry-forward-ripple 900ms ease-out forwards}
      @keyframes typstry-forward-ripple{0%{opacity:0;transform:scale(.55);box-shadow:0 0 0 0 rgba(61,180,137,.38)}12%{opacity:1}100%{opacity:0;transform:scale(3.1);box-shadow:0 0 0 14px rgba(61,180,137,0)}}
      .annotation-link{position:absolute;display:block}
      ::selection{background:rgba(0,120,215,.35)}
    </style></head><body><div id="viewer-container"></div></body></html>`;
    iframe.addEventListener("load", () => this.setupIframeInteractions());
    const loaded = new Promise<void>(resolve => iframe.addEventListener("load", () => resolve(), { once: true }));
    this.pane.appendChild(iframe);
    this.iframe = iframe;
    await loaded;
    this.setupIframeInteractions();
    return iframe;
  }

  private createPageSlots(doc: Document, preserveExistingPages = false): void {
    const viewer = doc.getElementById("viewer-container");
    if (!viewer || !this.pdfDoc) return;
    if (!preserveExistingPages) {
      viewer.replaceChildren();
    }
    for (let pageNo = 1; pageNo <= this.pdfDoc.numPages; pageNo += 1) {
      let slot = viewer.querySelector<HTMLElement>(`:scope > .pdf-page-container[data-page-no="${pageNo}"]`);
      if (!slot) {
        slot = doc.createElement("div");
        slot.className = "pdf-page-container";
        slot.dataset.pageNo = String(pageNo);
        viewer.appendChild(slot);
      }
    }
    for (const slot of [...viewer.querySelectorAll<HTMLElement>(":scope > .pdf-page-container")]) {
      const pageNo = Number(slot.dataset.pageNo);
      if (pageNo > this.pdfDoc.numPages) slot.remove();
    }
    this.layoutPageSlots({ preserveExistingPages });
  }

  private layoutPageSlots(options: { preserveExistingPages?: boolean } = {}): void {
    const doc = this.iframe?.contentDocument;
    if (!doc) return;
    const zoom = this.previewZoomPercent / 100;
    this.pageClickItems.clear();
    for (const slot of doc.querySelectorAll<HTMLElement>(".pdf-page-container")) {
      const pageNo = Number(slot.dataset.pageNo);
      const dimensions = this.pageDimensions.get(pageNo);
      if (!dimensions) continue;
      slot.style.width = `${dimensions.width * zoom}px`;
      slot.style.height = `${dimensions.height * zoom}px`;
      if (!options.preserveExistingPages) {
        slot.replaceChildren();
        delete slot.dataset.renderGeneration;
      }
    }
  }

  private installPageObserver(iframe: HTMLIFrameElement): void {
    this.observer?.disconnect();
    const doc = iframe.contentDocument;
    const Observer = (iframe.contentWindow as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver;
    if (!doc || !Observer) return;
    this.observer = new Observer(entries => {
      for (const entry of entries) {
        const pageNo = Number((entry.target as HTMLElement).dataset.pageNo);
        if (entry.isIntersecting) void this.renderPage(pageNo, this.pdfGeneration);
        else this.unrenderPage(pageNo);
      }
    }, { root: null, rootMargin: "1000px 0px 1000px 0px", threshold: 0 });
    doc.querySelectorAll(".pdf-page-container").forEach(slot => this.observer?.observe(slot));
  }

  private renderVisiblePages(): void {
    const doc = this.iframe?.contentDocument;
    if (!doc) return;
    const viewportHeight = this.iframe?.clientHeight ?? 0;
    for (const slot of doc.querySelectorAll<HTMLElement>(".pdf-page-container")) {
      const rect = slot.getBoundingClientRect();
      if (rect.bottom >= -1000 && rect.top <= viewportHeight + 1000) {
        void this.renderPage(Number(slot.dataset.pageNo), this.pdfGeneration);
      }
    }
  }

  private async renderPage(pageNo: number, generation: number): Promise<void> {
    if (!this.pdfDoc || generation !== this.pdfGeneration || this.activeRenders.has(pageNo)) return;
    const doc = this.iframe?.contentDocument;
    const slot = doc?.querySelector<HTMLElement>(`.pdf-page-container[data-page-no="${pageNo}"]`);
    if (!doc || !slot || slot.dataset.renderGeneration === String(generation)) return;
    const replacingExistingPage = slot.firstElementChild !== null;

    const active: ActivePageRender = { generation, task: null, page: null };
    this.activeRenders.set(pageNo, active);
    try {
      const pdfjs = await this.pdfJs();
      const page = await this.pdfDoc.getPage(pageNo);
      active.page = page;
      if (!this.renderIsCurrent(pageNo, active, slot)) return;

      const cssScale = this.previewZoomPercent / 100;
      const cssViewport = page.getViewport({ scale: cssScale });
      const outputScale = Math.min(window.devicePixelRatio || 1, MAX_OUTPUT_SCALE);
      const renderViewport = page.getViewport({ scale: cssScale * outputScale });
      const canvas = doc.createElement("canvas");
      canvas.className = "pdf-page-canvas";
      canvas.width = Math.max(1, Math.floor(renderViewport.width));
      canvas.height = Math.max(1, Math.floor(renderViewport.height));
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;
      if (!replacingExistingPage) slot.appendChild(canvas);

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas rendering is unavailable.");
      const task = page.render({ canvasContext: context, viewport: renderViewport });
      active.task = task;
      await task.promise;
      active.task = null;
      if (!this.renderIsCurrent(pageNo, active, slot)) return;

      const textContent = await page.getTextContent();
      this.pageClickItems.set(pageNo, pdfClickItems(textContent.items, cssViewport));
      const textLayerElement = doc.createElement("div");
      textLayerElement.className = "textLayer";
      textLayerElement.style.setProperty("--scale-factor", String(cssViewport.scale));
      if (!replacingExistingPage) slot.appendChild(textLayerElement);
      const textLayer = new pdfjs.TextLayer({
        textContentSource: textContent,
        container: textLayerElement,
        viewport: cssViewport
      });
      await textLayer.render();
      attachPdfTextMetadata(textLayerElement, textContent.items);
      if (!this.renderIsCurrent(pageNo, active, slot)) return;

      const annotationLinks: HTMLElement[] = [];
      for (const annotation of await page.getAnnotations()) {
        if (annotation.subtype !== "Link" || !annotation.url) continue;
        const rect = viewportRectangle(cssViewport, annotation.rect);
        if (!rect) continue;
        const link = doc.createElement("a");
        link.className = "annotation-link";
        link.href = annotation.url;
        link.style.left = `${Math.min(rect[0], rect[2])}px`;
        link.style.top = `${Math.min(rect[1], rect[3])}px`;
        link.style.width = `${Math.abs(rect[2] - rect[0])}px`;
        link.style.height = `${Math.abs(rect[3] - rect[1])}px`;
        annotationLinks.push(link);
      }
      if (replacingExistingPage) {
        slot.replaceChildren(canvas, textLayerElement, ...annotationLinks);
      } else {
        slot.append(...annotationLinks);
      }
      slot.dataset.renderGeneration = String(generation);
    } catch (error) {
      if (!(error instanceof Error && error.name === "RenderingCancelledException")) {
        console.error(`Failed to render PDF page ${pageNo}:`, error);
      }
    } finally {
      if (this.activeRenders.get(pageNo) === active) this.activeRenders.delete(pageNo);
      active.page?.cleanup();
    }
  }

  private renderIsCurrent(pageNo: number, active: ActivePageRender, slot: HTMLElement): boolean {
    return active.generation === this.pdfGeneration
      && this.activeRenders.get(pageNo) === active
      && slot.isConnected;
  }

  private unrenderPage(pageNo: number): void {
    const active = this.activeRenders.get(pageNo);
    active?.task?.cancel();
    active?.page?.cleanup();
    this.activeRenders.delete(pageNo);
    this.pageClickItems.delete(pageNo);
    const slot = this.iframe?.contentDocument
      ?.querySelector<HTMLElement>(`.pdf-page-container[data-page-no="${pageNo}"]`)
    if (!slot) return;
    slot.replaceChildren();
    delete slot.dataset.renderGeneration;
  }

  private cancelAllPageRenders(): void {
    for (const [pageNo, render] of this.activeRenders) {
      render.task?.cancel();
      render.page?.cleanup();
      this.activeRenders.delete(pageNo);
    }
  }

  private async disposePdfDocument(): Promise<void> {
    this.observer?.disconnect();
    this.observer = null;
    this.cancelAllPageRenders();
    const loadingTask = this.pdfLoadingTask;
    const pdfDoc = this.pdfDoc;
    this.pdfLoadingTask = null;
    this.pdfDoc = null;
    if (pdfDoc) {
      try { await pdfDoc.destroy(); } catch {}
    } else if (loadingTask) {
      try { await loadingTask.destroy(); } catch {}
    }
    this.pageDimensions.clear();
    this.pageTextCache.clear();
    this.pageClickItems.clear();
  }

  public scrollToPage(pageNo: number): void {
    this.iframe?.contentDocument
      ?.querySelector(`.pdf-page-container[data-page-no="${pageNo}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  public async scrollToText(pageNo: number, text: string, options: SourceTextScrollOptions = {}): Promise<void> {
    const slot = this.iframe?.contentDocument
      ?.querySelector<HTMLElement>(`.pdf-page-container[data-page-no="${pageNo}"]`);
    if (!slot) return;
    slot.scrollIntoView({ behavior: "smooth", block: "nearest" });
    await this.renderPage(pageNo, this.pdfGeneration);
    const normalized = text.trim();
    const match = [...slot.querySelectorAll<HTMLElement>(".textLayer span")]
      .find(span => {
        const candidate = span.textContent?.trim() ?? "";
        return candidate.length > 0 && (candidate.includes(normalized) || normalized.includes(candidate));
      });
    match?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (match && options.ripple) {
      void this.showForwardSyncRipple(match);
    }
  }

  public async scrollToSourceText(text: string, preferredPage?: number, options: SourceTextScrollOptions = {}): Promise<boolean> {
    if (!this.pdfDoc) return false;
    const probes = sourceTextProbes(text);
    if (probes.length === 0) return false;
    const anchorPage = preferredPage ?? this.captureScrollAnchor()?.pageNo;
    const pages = pageSearchOrder(this.pdfDoc.numPages, anchorPage);
    for (const pageNo of pages) {
      const pageText = await this.getPageText(pageNo);
      const compactPageText = pageText.replace(/\s+/gu, "");
      const probe = probes.find(candidate => {
        const normalized = normalizeSearchText(candidate);
        return pageText.includes(normalized) || compactPageText.includes(normalized.replace(/\s+/gu, ""));
      });
      if (!probe) continue;
      await this.scrollToText(pageNo, firstSearchToken(probe), options);
      return true;
    }
    return false;
  }

  public async revealDocumentPosition(position: { page_no: number; x: number; y: number }, options: { ripple?: boolean } = {}): Promise<void> {
    const slot = this.iframe?.contentDocument
      ?.querySelector<HTMLElement>(`.pdf-page-container[data-page-no="${position.page_no}"]`);
    if (!slot) return;
    const view = this.iframe?.contentWindow;
    if (!view) return;

    const zoom = this.previewZoomPercent / 100;
    const targetY = slot.offsetTop + (position.y * zoom) - (view.innerHeight * 0.45);
    view.scrollTo({
      top: Math.max(0, targetY),
      behavior: "smooth"
    });
    if (options.ripple) {
      await this.showForwardSyncRippleAtDocumentPosition(position);
    }
  }

  private async showForwardSyncRipple(target: HTMLElement): Promise<void> {
    const generation = ++this.forwardRippleGeneration;
    const view = this.iframe?.contentWindow;
    const doc = this.iframe?.contentDocument;
    if (!view || !doc) return;

    await waitForPreviewScrollToSettle(view, 100, 100);
    if (generation !== this.forwardRippleGeneration || !target.isConnected) return;

    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    this.renderForwardSyncRipple(doc, x, y);
  }

  private async showForwardSyncRippleAtDocumentPosition(position: { page_no: number; x: number; y: number }): Promise<void> {
    const generation = ++this.forwardRippleGeneration;
    const view = this.iframe?.contentWindow;
    const doc = this.iframe?.contentDocument;
    if (!view || !doc) return;

    await waitForPreviewScrollToSettle(view, 100, 100);
    const slot = doc.querySelector<HTMLElement>(`.pdf-page-container[data-page-no="${position.page_no}"]`);
    if (generation !== this.forwardRippleGeneration || !slot) return;

    const zoom = this.previewZoomPercent / 100;
    const slotRect = slot.getBoundingClientRect();
    const x = slotRect.left + (position.x * zoom);
    const y = slotRect.top + (position.y * zoom);
    this.renderForwardSyncRipple(doc, x, y);
  }

  private renderForwardSyncRipple(doc: Document, x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    doc.querySelectorAll(".forward-sync-ripple").forEach(element => element.remove());
    const ripple = doc.createElement("div");
    ripple.className = "forward-sync-ripple";
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    doc.body.appendChild(ripple);
    window.setTimeout(() => {
      if (ripple.isConnected) ripple.remove();
    }, 1000);
  }

  private async getPageText(pageNo: number): Promise<string> {
    const cached = this.pageTextCache.get(pageNo);
    if (cached !== undefined) return cached;
    if (!this.pdfDoc) return "";
    const page = await this.pdfDoc.getPage(pageNo);
    const content = await page.getTextContent();
    const text = normalizeSearchText(content.items.map((item: any) => item.str ?? "").join(" "));
    this.pageTextCache.set(pageNo, text);
    page.cleanup();
    return text;
  }

  private captureScrollAnchor(): { pageNo: number; offset: number } | null {
    const doc = this.iframe?.contentDocument;
    if (!doc) return null;
    const slots = [...doc.querySelectorAll<HTMLElement>(".pdf-page-container")];
    const anchor = slots.find(slot => slot.getBoundingClientRect().bottom > 0) ?? slots[0];
    if (!anchor) return null;
    return { pageNo: Number(anchor.dataset.pageNo), offset: anchor.getBoundingClientRect().top };
  }

  private restoreScrollAnchor(anchor: { pageNo: number; offset: number } | null): void {
    if (!anchor) return;
    requestAnimationFrame(() => {
      const slot = this.iframe?.contentDocument
        ?.querySelector<HTMLElement>(`.pdf-page-container[data-page-no="${anchor.pageNo}"]`);
      const view = this.iframe?.contentWindow;
      if (!slot || !view) return;
      view.scrollBy(0, slot.getBoundingClientRect().top - anchor.offset);
    });
  }

  private setupIframeInteractions(): void {
    const doc = this.iframe?.contentDocument;
    if (!doc) {
      this.debugInverse("Interaction installation deferred: iframe document unavailable.");
      return;
    }
    if (doc.documentElement.dataset.typstryInteractions === "true") return;
    doc.documentElement.dataset.typstryInteractions = "true";
    this.debugInverse(`Interaction listener installed: readyState=${doc.readyState}, url=${doc.URL || "(empty)"}.`);
    doc.addEventListener("contextmenu", event => event.preventDefault());
    doc.addEventListener("click", event => {
      const target = event.target as Element | null;
      const slot = target?.closest<HTMLElement>(".pdf-page-container");
      if (!slot) {
        this.debugInverse("Click ignored: no PDF page container at target.");
        return;
      }
      const mouse = event as MouseEvent;
      const pageNo = Number(slot.dataset.pageNo);
      this.debugInverse(`Click received: page=${pageNo}, x=${mouse.clientX.toFixed(1)}, y=${mouse.clientY.toFixed(1)}, target=${target?.tagName ?? "unknown"}.`);
      const pdfPoint = this.pdfTextPointAtClick(pageNo, slot, mouse);
      if (pdfPoint) {
        this.debugInverse(`PDF hit resolved: page=${pageNo}, offset=${pdfPoint.offset}/${pdfPoint.text.length}, text=${debugText(pdfPoint.text, pdfPoint.offset)}.`);
        this.onTextClick({ ...pdfPoint, pageNo });
        return;
      }
      const span = target?.closest<HTMLElement>(".textLayer span")
        ?? closestTextSpanAtPoint(slot, mouse.clientX, mouse.clientY);
      if (!span) {
        this.debugInverse(`Click rejected: page=${pageNo}, no PDF item or text-layer span matched.`);
        return;
      }
      const point = textPointAtClick(span, mouse);
      if (point) {
        this.debugInverse(`DOM fallback resolved: page=${pageNo}, offset=${point.offset}/${point.text.length}, text=${debugText(point.text, point.offset)}.`);
        this.onTextClick({ ...point, pageNo });
      } else {
        this.debugInverse(`DOM fallback rejected: page=${pageNo}, line reconstruction failed.`);
      }
    }, true);
  }

  private pdfTextPointAtClick(pageNo: number, slot: HTMLElement, event: MouseEvent): PreviewTextPoint | null {
    const items = this.pageClickItems.get(pageNo);
    if (!items?.length) {
      this.debugInverse(`PDF hit unavailable: page=${pageNo}, text item metadata is empty.`);
      return null;
    }
    const slotRect = slot.getBoundingClientRect();
    const x = event.clientX - slotRect.left;
    const y = event.clientY - slotRect.top;
    let clicked: PdfClickItem | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const item of items) {
      const top = item.baseline - item.height;
      const dx = x < item.left ? item.left - x : x > item.right ? x - item.right : 0;
      const dy = y < top ? top - y : y > item.baseline ? y - item.baseline : 0;
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        clicked = item;
        bestDistance = distance;
      }
    }
    if (!clicked || bestDistance > Math.max(8, clicked.height)) {
      this.debugInverse(`PDF hit rejected: page=${pageNo}, items=${items.length}, nearestDistance=${bestDistance.toFixed(1)}, tolerance=${clicked ? Math.max(8, clicked.height).toFixed(1) : "n/a"}.`);
      return null;
    }
    const baselineItems = items
      .filter(item => Math.abs(item.baseline - clicked!.baseline) <= Math.max(1.5, clicked!.height * 0.25))
      .sort((a, b) => a.left - b.left);
    const clickedIndex = baselineItems.indexOf(clicked);
    if (clickedIndex < 0) return null;
    let from = clickedIndex;
    let to = clickedIndex;
    while (from > 0 && pdfItemGap(baselineItems[from - 1], baselineItems[from]) <= clicked.height * 4) from -= 1;
    while (to + 1 < baselineItems.length && pdfItemGap(baselineItems[to], baselineItems[to + 1]) <= clicked.height * 4) to += 1;

    let text = "";
    let offset = 0;
    let previous: PdfClickItem | null = null;
    for (const item of baselineItems.slice(from, to + 1)) {
      if (previous && pdfItemGap(previous, item) > Math.min(previous.height, item.height) * 0.12) text += " ";
      if (item === clicked) {
        const ratio = item.right > item.left ? (x - item.left) / (item.right - item.left) : 0;
        offset = text.length + nearestCodePointOffset(item.text, Math.max(0, Math.min(1, ratio)));
      }
      text += item.text;
      previous = item;
    }
    const zoom = this.previewZoomPercent / 100;
    return {
      text,
      offset,
      documentPosition: { page_no: pageNo, x: x / zoom, y: y / zoom }
    };
  }

  private debugInverse(reason: string): void {
    this.reportInteractionStatus({ kind: "debug", url: this.mountedUrl, reason: `Inverse sync: ${reason}` });
  }

  public activateSession(_sessionKey: string): boolean {
    return this.pdfDoc !== null;
  }

  public async clear(): Promise<void> {
    ++this.pdfGeneration;
    this.iframe?.remove();
    this.iframe = null;
    this.mountedUrl = "";
    await this.disposePdfDocument();
    this.clearErrorOverlay();
    this.clearMessageHost();
  }

  public setMessage(html: string): void {
    ++this.pdfGeneration;
    this.iframe?.remove();
    this.iframe = null;
    this.mountedUrl = "";
    void this.disposePdfDocument();
    this.clearErrorOverlay();
    this.clearMessageHost();
    const host = document.createElement("div");
    host.className = "preview-message-host";
    host.innerHTML = html;
    this.pane.appendChild(host);
    this.messageHost = host;
  }

  public setLoading(message: string): void {
    this.clearMessageHost();
    const host = document.createElement("div");
    host.className = "preview-message-host preview-loading-overlay";
    host.innerHTML = `<div class="preview-loading-placeholder">`
      + `<div class="preview-loading-spinner"></div>`
      + `<div class="preview-loading-message">${escapeHtml(message)}</div>`
      + `</div>`;
    this.pane.appendChild(host);
    this.messageHost = host;
  }

  public setError(title: string, message: string): void {
    this.clearErrorOverlay();
    const overlay = document.createElement("div");
    overlay.className = "compiler-preview-error-overlay";
    const content = document.createElement("div");
    content.className = "compiler-preview-error-content";
    const titleElement = document.createElement("h3");
    titleElement.className = "compiler-preview-error-title";
    titleElement.textContent = `ⓧ ${title}`;
    const details = document.createElement("pre");
    details.className = "compiler-preview-error-message";
    details.textContent = message;
    content.append(titleElement, details);
    overlay.appendChild(content);
    this.pane.appendChild(overlay);
    this.errorOverlay = overlay;
  }

  public clearErrorOverlay(): void {
    this.errorOverlay?.remove();
    this.errorOverlay = null;
  }

  private clearMessageHost(): void {
    this.messageHost?.remove();
    this.messageHost = null;
  }

  private reportInteractionStatus(status: PreviewInteractionStatus): void {
    const key = `${status.kind}:${status.url}:${status.reason ?? ""}`;
    if (key === this.lastInteractionStatusKey) return;
    this.lastInteractionStatusKey = key;
    this.onInteractionStatus?.(status);
  }

}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readPdfPageDimensions(
  pdfDoc: any,
  generation: number,
  currentGeneration: () => number
): Promise<Map<number, PageDimensions>> {
  const dimensions = new Map<number, PageDimensions>();
  for (let pageNo = 1; pageNo <= pdfDoc.numPages; pageNo += 1) {
    if (generation !== currentGeneration()) return dimensions;
    const page = await pdfDoc.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1 });
    dimensions.set(pageNo, { width: viewport.width, height: viewport.height });
    page.cleanup();
  }
  return dimensions;
}

async function cleanupPdfResources(
  pdfDoc: any,
  loadingTask: { destroy(): Promise<void> } | null
): Promise<void> {
  if (pdfDoc) {
    try { await pdfDoc.destroy(); } catch {}
  } else if (loadingTask) {
    try { await loadingTask.destroy(); } catch {}
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] ?? character);
}

function debugText(text: string, offset: number): string {
  const start = Math.max(0, offset - 20);
  const sample = text.slice(start, Math.min(text.length, offset + 36));
  const codePoints = [...sample].map(character => `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ");
  return `${JSON.stringify(sample)} [${codePoints}]`;
}

function normalizeSearchText(value: string): string {
  return value.replace(/[\u200b\u200c\u200d]/gu, "").replace(/\s+/gu, " ").trim();
}

function sourceTextProbes(source: string): string[] {
  const plain = normalizeSearchText(source
    .replace(/^\s*(?:=+|[-+])\s*/u, "")
    .replace(/[#*_`\[\]{}()]/gu, " "));
  const words = plain.split(" ").filter(word => word.length >= 2);
  const probes = [plain];
  for (let size = Math.min(8, words.length); size >= 2; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) probes.push(words.slice(start, start + size).join(" "));
  }
  probes.push(...words.filter(word => word.length >= 3));
  return [...new Set(probes.filter(probe => probe.length >= 3))].sort((a, b) => b.length - a.length);
}

function firstSearchToken(value: string): string {
  return value.split(/\s+/u).find(token => token.length >= 2) ?? value;
}

function pageSearchOrder(count: number, preferred?: number): number[] {
  const pages = Array.from({ length: count }, (_, index) => index + 1);
  if (!preferred || preferred < 1 || preferred > count) return pages;
  return pages.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
}

function textPointAtClick(clicked: HTMLElement, event: MouseEvent): PreviewTextPoint | null {
  const layer = clicked.closest<HTMLElement>(".textLayer");
  const spans = [...(layer?.querySelectorAll<HTMLElement>("span") ?? [])];
  const clickedRect = clicked.getBoundingClientRect();
  const clickedTop = positionedTop(clicked);
  const baselineSpans = spans.filter(span => {
    const top = positionedTop(span);
    if (clickedTop !== null && top !== null) return Math.abs(top - clickedTop) <= 1.5;
    const rect = span.getBoundingClientRect();
    const overlap = Math.min(rect.bottom, clickedRect.bottom) - Math.max(rect.top, clickedRect.top);
    return overlap >= Math.min(rect.height, clickedRect.height) * 0.35;
  }).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  const clickedIndex = baselineSpans.indexOf(clicked);
  if (clickedIndex < 0) return null;
  let from = clickedIndex;
  let to = clickedIndex;
  while (from > 0 && horizontalGap(baselineSpans[from - 1], baselineSpans[from]) <= clickedRect.height * 4) from -= 1;
  while (to + 1 < baselineSpans.length && horizontalGap(baselineSpans[to], baselineSpans[to + 1]) <= clickedRect.height * 4) to += 1;
  const sameLine = baselineSpans.slice(from, to + 1);
  if (sameLine.length === 0) return null;
  const localOffset = caretOffsetAtPoint(clicked, event.clientX);
  let text = "";
  let offset = 0;
  let previous: HTMLElement | null = null;
  for (const span of sameLine) {
    const separator = previous && hasWordGap(previous, span) ? " " : "";
    text += separator;
    const value = span.dataset.typstryPdfText ?? span.textContent ?? "";
    if (span === clicked) offset = text.length + localOffset;
    text += value;
    previous = span;
  }
  return { text, offset };
}

function horizontalGap(left: HTMLElement, right: HTMLElement): number {
  return Math.max(0, right.getBoundingClientRect().left - left.getBoundingClientRect().right);
}

function positionedTop(element: HTMLElement): number | null {
  const baseline = Number.parseFloat(element.dataset.typstryPdfBaseline ?? "");
  if (Number.isFinite(baseline)) return baseline;
  const value = Number.parseFloat(element.style.top);
  return Number.isFinite(value) ? value : null;
}

function caretOffsetAtPoint(element: HTMLElement, x: number): number {
  const value = element.dataset.typstryPdfText ?? element.textContent ?? "";
  const rect = element.getBoundingClientRect();
  const ratio = rect.width > 0 ? (x - rect.left) / rect.width : 0;
  return nearestCodePointOffset(value, Math.max(0, Math.min(1, ratio)));
}

function nearestCodePointOffset(value: string, ratio: number): number {
  const offsets = [0];
  for (let index = 0; index < value.length;) {
    index += String.fromCodePoint(value.codePointAt(index)!).length;
    offsets.push(index);
  }
  return offsets[Math.round(ratio * (offsets.length - 1))] ?? value.length;
}

function hasWordGap(left: HTMLElement, right: HTMLElement): boolean {
  const leftRect = left.getBoundingClientRect();
  const rightRect = right.getBoundingClientRect();
  const gap = rightRect.left - leftRect.right;
  const height = Math.max(1, Math.min(leftRect.height, rightRect.height));
  return gap > height * 0.12;
}

function attachPdfTextMetadata(layer: HTMLElement, rawItems: readonly any[]): void {
  const items = rawItems.filter(item => typeof item?.str === "string" && item.str.length > 0);
  const spans = [...layer.querySelectorAll<HTMLElement>(":scope > span")];
  for (let index = 0; index < Math.min(items.length, spans.length); index += 1) {
    const item = items[index];
    const span = spans[index];
    span.dataset.typstryPdfText = item.str;
    const transform = item.transform;
    if (Array.isArray(transform) && transform.length >= 6) {
      span.dataset.typstryPdfBaseline = String(transform[5]);
    }
  }
}

function closestTextSpanAtPoint(slot: HTMLElement, x: number, y: number): HTMLElement | null {
  let best: { span: HTMLElement; distance: number } | null = null;
  for (const span of slot.querySelectorAll<HTMLElement>(".textLayer span")) {
    const rect = span.getBoundingClientRect();
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { span, distance };
  }
  if (!best) return null;
  const height = Math.max(12, best.span.getBoundingClientRect().height);
  return best.distance <= height * 1.5 ? best.span : null;
}

function pdfClickItems(rawItems: readonly any[], viewport: any): PdfClickItem[] {
  const items: PdfClickItem[] = [];
  for (const item of rawItems) {
    if (typeof item?.str !== "string" || item.str.length === 0 || !Array.isArray(item.transform)) continue;
    const [left, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const width = Math.max(0, Number(item.width) * viewport.scale);
    const sourceHeight = Number(item.height) || Math.hypot(Number(item.transform[2]) || 0, Number(item.transform[3]) || 0);
    const height = Math.max(1, Math.abs(sourceHeight * viewport.scale));
    items.push({ text: item.str, left, right: left + width, baseline, height });
  }
  return items;
}

function viewportRectangle(viewport: any, rect: unknown): [number, number, number, number] | null {
  if (!Array.isArray(rect) || rect.length < 4 || typeof viewport?.convertToViewportPoint !== "function") {
    return null;
  }
  const x1 = Number(rect[0]);
  const y1 = Number(rect[1]);
  const x2 = Number(rect[2]);
  const y2 = Number(rect[3]);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  const first = viewport.convertToViewportPoint(x1, y1);
  const second = viewport.convertToViewportPoint(x2, y2);
  if (!Array.isArray(first) || !Array.isArray(second)) return null;
  return [first[0], first[1], second[0], second[1]];
}

function pdfItemGap(left: PdfClickItem, right: PdfClickItem): number {
  return Math.max(0, right.left - left.right);
}

async function waitForPreviewScrollToSettle(
  view: Window,
  initialDelayMs: number,
  afterScrollStopDelayMs: number
): Promise<void> {
  let sawScroll = false;
  const startedAt = performance.now();
  let lastScrollAt = performance.now();
  let lastX = view.scrollX;
  let lastY = view.scrollY;
  const onScroll = () => {
    sawScroll = true;
    lastScrollAt = performance.now();
    lastX = view.scrollX;
    lastY = view.scrollY;
  };

  view.addEventListener("scroll", onScroll, { passive: true });
  await delay(initialDelayMs);
  if (view.scrollX !== lastX || view.scrollY !== lastY) {
    onScroll();
  }
  if (!sawScroll) {
    view.removeEventListener("scroll", onScroll);
    return;
  }

  await new Promise<void>(resolve => {
    const check = () => {
      const now = performance.now();
      if (now - lastScrollAt >= afterScrollStopDelayMs || now - startedAt >= 5000) {
        window.setTimeout(resolve, afterScrollStopDelayMs);
        return;
      }
      view.requestAnimationFrame(check);
    };
    view.requestAnimationFrame(check);
  });
  view.removeEventListener("scroll", onScroll);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}
