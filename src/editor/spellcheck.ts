import { StateEffect, StateField, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";

type SegmentToken = {
  text: string;
  from: number;
  to: number;
  known: boolean;
  knownPrefix: boolean;
};

type TextAnalysis = {
  provider: string;
  normalizedChanged: boolean;
  tokens: SegmentToken[];
};

export type SpellingIssue = {
  documentKey: string;
  revision: number;
  docIdentity: Text;
  from: number;
  to: number;
  sourceText: string;
  word: string;
  knownPrefix: boolean;
};

const setSpellingIssues = StateEffect.define<SpellingIssue[]>();
const spellingField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setSpellingIssues)) continue;
      const decorations = effect.value.map(issue => Decoration.mark({
        class: "cm-spelling-unknown",
        attributes: { title: `${issue.word} is not in the selected language dictionary` }
      }).range(issue.from, issue.to));
      return Decoration.set(decorations, true);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field)
});

export class SpellcheckController {
  private enabled = true;
  private timer: number | null = null;
  private revision = 0;
  private documentKey = "";
  private popupGeneration = 0;
  private readonly warnedFailures = new Set<string>();
  private userDictionary = new Set<string>();
  public issues: SpellingIssue[] = [];
  private suggestionCache = new Map<string, string[]>();
  private readonly popup = document.createElement("div");

  constructor(private readonly getEditor: () => EditorView) {
    this.popup.className = "spellcheck-suggestions hidden";
    document.body.appendChild(this.popup);
  }

  public extension(): Extension {
    return spellingField;
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.invalidate(true);
    if (enabled) this.schedule();
  }

  public setUserDictionary(words: readonly string[]): void {
    const next = new Set(words);
    if (next.size === this.userDictionary.size
      && [...next].every(word => this.userDictionary.has(word))) return;
    this.userDictionary = next;
    this.invalidate(true);
    this.schedule();
  }

  /** Must be called before replacing the editor state for another document. */
  public activateDocument(documentKey: string): void {
    this.documentKey = documentKey;
    this.invalidate(true);
  }

  /** Invalidates async work immediately; debounce scheduling happens afterwards. */
  public documentChanged(): void {
    this.invalidate(false);
    this.schedule();
  }

  public selectionChanged(): void {
    this.popupGeneration++;
    this.hidePopup();
  }

  public schedule(): void {
    if (!this.enabled || !this.documentKey) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.analyze();
    }, 160);
  }

  public issueAt(position: number): SpellingIssue | null {
    return this.issues
      .filter(issue => position >= issue.from && position < issue.to && this.isCurrentIssue(issue, false))
      .sort((a, b) => (a.to - a.from) - (b.to - b.from))[0] ?? null;
  }

  public async suggestions(issue: SpellingIssue): Promise<string[]> {
    if (!this.isCurrentIssue(issue)) return [];
    const request = ++this.popupGeneration;
    const cached = this.suggestionCache.get(issue.word);
    if (cached) return this.popupRequestIsCurrent(request, issue) ? cached : [];
    try {
      const suggestions = await invoke<string[]>("spelling_suggestions", { word: issue.word, limit: 5 });
      if (!this.popupRequestIsCurrent(request, issue)) return [];
      this.suggestionCache.set(issue.word, suggestions);
      return suggestions;
    } catch (error) {
      if (request === this.popupGeneration) this.hidePopup();
      this.warnOnce("spelling_suggestions", error);
      return [];
    }
  }

  public replace(issue: SpellingIssue, replacement: string): void {
    if (!this.isCurrentIssue(issue)) {
      this.hidePopup();
      this.schedule();
      return;
    }
    const editor = this.getEditor();
    editor.dispatch({
      changes: { from: issue.from, to: issue.to, insert: replacement },
      selection: { anchor: issue.from + replacement.length },
      userEvent: "input.complete"
    });
    editor.focus();
    this.hidePopup();
  }

  public clear(): void {
    this.invalidate(true);
  }

  private invalidate(clearIssues: boolean): void {
    this.revision++;
    this.popupGeneration++;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.hidePopup();
    if (!clearIssues) return;
    this.issues = [];
    const editor = this.getEditor();
    if (editor) editor.dispatch({ effects: setSpellingIssues.of([]) });
  }

  private async analyze(): Promise<void> {
    const editor = this.getEditor();
    const docIdentity = editor.state.doc;
    const text = docIdentity.toString();
    const documentKey = this.documentKey;
    const revision = this.revision;
    if (!/[\u1780-\u17ff]/u.test(text)) {
      if (this.analysisIsCurrent(documentKey, revision, docIdentity)) this.clearIssuesOnly(editor);
      return;
    }
    let analysis: TextAnalysis | null;
    try {
      analysis = await invoke<TextAnalysis | null>("analyze_text", { text });
    } catch (error) {
      if (this.analysisIsCurrent(documentKey, revision, docIdentity)) {
        this.popupGeneration++;
        this.hidePopup();
      }
      this.warnOnce("analyze_text", error);
      return;
    }
    if (!this.analysisIsCurrent(documentKey, revision, docIdentity) || !analysis) return;
    const cursor = editor.state.selection.main.head;
    this.issues = analysis.tokens
      .filter(token => !token.known && !this.userDictionary.has(token.text) && /[\u1780-\u17ff]/u.test(token.text))
      .map(token => ({
        documentKey,
        revision,
        docIdentity,
        from: token.from,
        to: token.to,
        sourceText: docIdentity.sliceString(token.from, token.to),
        word: token.text,
        knownPrefix: token.knownPrefix
      }));
    const visible = this.issues.filter(issue => !(issue.knownPrefix && cursor === issue.to));
    editor.dispatch({ effects: setSpellingIssues.of(visible) });
    const current = visible.find(issue => cursor >= issue.from && cursor < issue.to);
    if (current) await this.showSuggestions(current);
    else this.hidePopup();
  }

  private async showSuggestions(issue: SpellingIssue): Promise<void> {
    const suggestions = await this.suggestions(issue);
    if (!suggestions.length || !this.enabled || !this.isCurrentIssue(issue)) return;
    const editor = this.getEditor();
    const coordinates = editor.coordsAtPos(issue.to);
    if (!coordinates) return;
    this.popup.replaceChildren(...suggestions.map(suggestion => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = suggestion;
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => this.replace(issue, suggestion));
      return button;
    }));
    this.popup.style.left = `${Math.min(coordinates.left, window.innerWidth - 260)}px`;
    this.popup.style.top = `${Math.min(coordinates.bottom + 4, window.innerHeight - 180)}px`;
    this.popup.classList.remove("hidden");
  }

  private analysisIsCurrent(documentKey: string, revision: number, docIdentity: Text): boolean {
    const editor = this.getEditor();
    return this.enabled && this.documentKey === documentKey && this.revision === revision
      && editor.state.doc === docIdentity;
  }

  private popupRequestIsCurrent(request: number, issue: SpellingIssue): boolean {
    return request === this.popupGeneration && this.isCurrentIssue(issue);
  }

  private isCurrentIssue(issue: SpellingIssue, verifyText = true): boolean {
    const editor = this.getEditor();
    return this.enabled && issue.documentKey === this.documentKey && issue.revision === this.revision
      && issue.docIdentity === editor.state.doc
      && (!verifyText || editor.state.doc.sliceString(issue.from, issue.to) === issue.sourceText);
  }

  private clearIssuesOnly(editor: EditorView): void {
    this.issues = [];
    this.popupGeneration++;
    this.hidePopup();
    editor.dispatch({ effects: setSpellingIssues.of([]) });
  }

  private warnOnce(command: string, error: unknown): void {
    const key = `${command}:${String(error)}`;
    if (this.warnedFailures.has(key)) return;
    this.warnedFailures.add(key);
    console.warn(`Spellcheck ${command} failed:`, error);
  }

  private hidePopup(): void {
    this.popup.classList.add("hidden");
    this.popup.replaceChildren();
  }
}
