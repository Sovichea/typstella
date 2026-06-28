export type PreviewTextPoint = { text: string; offset: number };

export class PreviewFrame {
  private iframe: HTMLIFrameElement | null = null;

  constructor(
    private readonly pane: HTMLElement,
    private readonly onTextClick: (point: PreviewTextPoint) => void
  ) {}

  public get element(): HTMLIFrameElement | null {
    return this.iframe;
  }

  public async mount(previewUrl: string, getPreviewHtml: () => Promise<string>): Promise<void> {
    this.pane.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.className = "preview-frame";
    iframe.addEventListener("load", () => this.configureDocument());
    this.pane.appendChild(iframe);
    this.iframe = iframe;

    const previewHtml = await getPreviewHtml();
    if (previewHtml) iframe.srcdoc = this.buildSrcdoc(previewUrl, previewHtml);
    else iframe.src = previewUrl;
  }

  public mountSvgPages(pages: readonly string[]): void {
    this.pane.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.className = "preview-frame";
    iframe.sandbox.add("allow-same-origin");
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;min-height:100%;background:#d8d8d8}body{padding:24px;box-sizing:border-box}
      .page{display:block;margin:0 auto 24px;max-width:100%;height:auto;box-shadow:0 2px 10px rgba(0,0,0,.2)}
    </style></head><body>${pages.map(page => page.replace("<svg", '<svg class="page"')).join("")}</body></html>`;
    this.pane.appendChild(iframe);
    this.iframe = iframe;
  }

  public scrollToHighlight(color = "#fe0102"): boolean {
    const iframe = this.iframe;
    const iframeDocument = iframe?.contentDocument;
    if (!iframe || !iframeDocument) return false;

    const elements = Array.from(iframeDocument.querySelectorAll(
      `[fill="${color}"], [fill="rgb(254, 1, 2)"], [style*="color: ${color}"], [style*="color: rgb(254, 1, 2)"]`
    ));
    const target = elements.find(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (!target) return false;
    target.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    return true;
  }

  private buildSrcdoc(previewUrl: string, previewHtml: string): string {
    const baseHref = previewUrl.endsWith("/") ? previewUrl : `${previewUrl}/`;
    const escapedHref = baseHref
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const base = `<base href="${escapedHref}">`;
    return /<head[^>]*>/i.test(previewHtml)
      ? previewHtml.replace(/<head([^>]*)>/i, `<head$1>${base}`)
      : `${base}${previewHtml}`;
  }

  private configureDocument(): void {
    try {
      const doc = this.iframe?.contentDocument;
      if (!doc || doc.documentElement.dataset.typstryInteractions === "true") return;
      doc.documentElement.dataset.typstryInteractions = "true";
      doc.addEventListener("click", event => {
        const point = this.textPointFromMouseEvent(doc, event);
        if (point) this.onTextClick(point);
      }, true);
      doc.addEventListener("contextmenu", event => event.preventDefault());
    } catch {
      // Cross-origin preview pages keep their own interaction handling.
    }
  }

  private textPointFromMouseEvent(doc: Document, event: MouseEvent): PreviewTextPoint | null {
    const pointDocument = doc as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    const range = pointDocument.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (range?.startContainer.nodeType === Node.TEXT_NODE) {
      return { text: range.startContainer.textContent ?? "", offset: range.startOffset };
    }

    const position = pointDocument.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (position?.offsetNode.nodeType === Node.TEXT_NODE) {
      return { text: position.offsetNode.textContent ?? "", offset: position.offset };
    }

    const text = (event.target as Element | null)?.textContent?.trim();
    return text ? { text, offset: Math.floor(text.length / 2) } : null;
  }
}
