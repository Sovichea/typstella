import { invoke } from "@tauri-apps/api/core";
import type { LanguageProviderCapabilities } from "../../languageSupport";
import type { CompletionLanguageSource } from "../../settings";
import { canonicalLocale } from "./providerResolver";
import type { ResolvedLanguageScopes } from "./types";

export interface PlatformInputLanguageStatus {
  languageTag: string | null;
  reliability: "reliable" | "unmapped" | "unsupported";
  source: string;
}

export interface CompletionProviderSelection {
  provider: LanguageProviderCapabilities;
  languageTag: string;
  source: "keyboard" | "scope" | "manual";
  generation: number;
}

export type InputLanguageAdapter = () => Promise<PlatformInputLanguageStatus>;

const nativeAdapter: InputLanguageAdapter = () => invoke("get_input_language");

export class InputLanguageService {
  private source: CompletionLanguageSource = "keyboard";
  private manualLanguage: string | null = null;
  private generation = 0;
  private cached: PlatformInputLanguageStatus | null = null;
  private lastRefreshAt = 0;

  constructor(
    private readonly getProviders: () => readonly LanguageProviderCapabilities[],
    private readonly getScopes: () => ResolvedLanguageScopes | null,
    private readonly adapter: InputLanguageAdapter = nativeAdapter,
  ) {}

  configure(source: CompletionLanguageSource, manualLanguage: string | null): void {
    if (source === this.source && manualLanguage === this.manualLanguage) return;
    this.source = source;
    this.manualLanguage = manualLanguage;
    this.generation += 1;
  }

  currentGeneration(): number {
    return this.generation;
  }

  async refresh(force = false): Promise<void> {
    const now = performance.now();
    if (!force && this.cached !== null && now - this.lastRefreshAt < 250) return;
    this.lastRefreshAt = now;
    const next = await this.adapter();
    if (next.languageTag !== this.cached?.languageTag || next.reliability !== this.cached?.reliability) {
      this.cached = next;
      this.generation += 1;
    }
  }

  async completionProvider(position: number): Promise<CompletionProviderSelection | null> {
    if (this.source === "keyboard") await this.refresh();
    const requested = this.requestedLanguage(position);
    if (!requested) return null;
    const provider = selectCompletionProvider(this.getProviders(), requested.languageTag);
    return provider ? { provider, ...requested, generation: this.generation } : null;
  }

  private requestedLanguage(position: number): Omit<CompletionProviderSelection, "provider" | "generation"> | null {
    const scope = this.scopeLanguage(position);
    if (this.source === "keyboard" && this.cached?.reliability === "reliable" && this.cached.languageTag) {
      return { languageTag: this.cached.languageTag, source: "keyboard" };
    }
    if (this.source === "manual" && this.manualLanguage) {
      return { languageTag: this.manualLanguage, source: "manual" };
    }
    if (scope) return { languageTag: scope, source: "scope" };
    if (this.manualLanguage) return { languageTag: this.manualLanguage, source: "manual" };
    return null;
  }

  private scopeLanguage(position: number): string | null {
    const scopes = this.getScopes();
    if (!scopes) return null;
    // Completion is requested with the cursor after the active token. Scope
    // ranges are half-open, so inspect the preceding source unit instead of
    // treating a cursor at range.toUtf16 as outside the language scope.
    const probe = Math.min(
      position > 0 ? position - 1 : position,
      Math.max(0, scopes.documentUtf16 - 1),
    );
    if (!scopes.proseRanges.some((range) => range.fromUtf16 <= probe && probe < range.toUtf16)) return null;
    const range = scopes.ranges.find((candidate) => candidate.fromUtf16 <= probe && probe < candidate.toUtf16);
    if (!range || range.style.language.confidence !== "static") return null;
    const locale = canonicalLocale(range.style.language.value,
      range.style.region.confidence === "static" ? range.style.region.value : null);
    return locale?.tag ?? null;
  }
}

export function selectCompletionProvider(
  providers: readonly LanguageProviderCapabilities[],
  languageTag: string,
): LanguageProviderCapabilities | null {
  const [language, region] = languageTag.replace(/_/g, "-").split("-");
  const requested = canonicalLocale(language ?? null, region ?? null);
  if (!requested) return null;
  const candidates = providers.filter((provider) => provider.supportsCompletion === true
    && canonicalLocale(provider.languageTag.split(/[-_]/)[0] ?? null, null)?.language === requested.language);
  const exact = candidates.filter((provider) =>
    provider.languageTag.replace(/_/g, "-").toLowerCase() === requested.tag.toLowerCase());
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;
  const languageOnly = candidates.filter((provider) =>
    !provider.languageTag.includes("-") && !provider.languageTag.includes("_"));
  if (languageOnly.length === 1) return languageOnly[0]!;
  return candidates.length === 1 ? candidates[0]! : null;
}
