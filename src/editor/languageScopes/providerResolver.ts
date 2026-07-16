import type { LanguageProviderCapabilities } from "../../languageSupport";
import type {
  EffectiveLanguageStyle,
  LanguageProviderResolution,
  ProviderAvailability,
} from "./types";

export interface LanguageCatalogEntry {
  id: string;
  locale: string;
  displayName: string;
  languageTag: string;
  scripts: string[];
  installed: boolean;
  bundled: boolean;
}

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  iw: "he",
  in: "id",
  ji: "yi",
};

export interface CanonicalLocale {
  language: string;
  region: string | null;
  tag: string;
}

export function canonicalLocale(language: string | null, region: string | null): CanonicalLocale | null {
  if (!language || !/^[A-Za-z]{2,3}$/.test(language)) return null;
  const canonicalLanguage = LANGUAGE_ALIASES[language.toLowerCase()] ?? language.toLowerCase();
  if (region !== null && !/^(?:[A-Za-z]{2}|\d{3})$/.test(region)) return null;
  const canonicalRegion = region?.toUpperCase() ?? null;
  return {
    language: canonicalLanguage,
    region: canonicalRegion,
    tag: canonicalRegion ? `${canonicalLanguage}-${canonicalRegion}` : canonicalLanguage,
  };
}

function providerLocale(tag: string): CanonicalLocale | null {
  const normalized = tag.replace(/_/g, "-");
  const [language, ...rest] = normalized.split("-");
  const region = rest.find((part) => /^(?:[A-Za-z]{2}|\d{3})$/.test(part)) ?? null;
  return canonicalLocale(language ?? null, region);
}

export class LanguageProviderIndex {
  private readonly installedById = new Map<string, LanguageProviderCapabilities>();
  private readonly catalogById = new Map<string, LanguageCatalogEntry>();
  private readonly installedByLanguage = new Map<string, LanguageProviderCapabilities[]>();
  private readonly catalogByLanguage = new Map<string, LanguageCatalogEntry[]>();
  private readonly enabled: Set<string> | null;

  constructor(
    installed: readonly LanguageProviderCapabilities[],
    catalog: readonly LanguageCatalogEntry[],
    enabledProviderIds: readonly string[] | null,
  ) {
    this.enabled = enabledProviderIds === null ? null : new Set(enabledProviderIds);
    for (const provider of installed) {
      this.installedById.set(provider.id, provider);
      const locale = providerLocale(provider.languageTag);
      if (locale) append(this.installedByLanguage, locale.language, provider);
    }
    for (const entry of catalog) {
      this.catalogById.set(entry.id, entry);
      const locale = providerLocale(entry.languageTag);
      if (locale) append(this.catalogByLanguage, locale.language, entry);
    }
  }

  provider(id: string): LanguageProviderCapabilities | null {
    return this.installedById.get(id) ?? null;
  }

  scriptsForProviderId(id: string | null): string[] {
    if (!id) return [];
    return (this.installedById.get(id)?.scripts ?? this.catalogById.get(id)?.scripts ?? [])
      .map(normalizeScript).filter(Boolean);
  }

  isEnabled(id: string): boolean {
    return this.enabled === null || this.enabled.has(id);
  }

  resolve(style: EffectiveLanguageStyle): LanguageProviderResolution {
    if (style.language.confidence === "dynamic" || style.region.confidence === "dynamic") {
      return resolution(style, "dynamic");
    }
    const locale = canonicalLocale(style.language.value, style.region.value);
    if (!locale) return resolution(style, "invalid");
    const installedMatch = bestLocaleMatch(this.installedByLanguage.get(locale.language) ?? [], locale);
    if (installedMatch.ambiguous) return resolution(style, "ambiguous", locale);
    const installed = installedMatch.value;
    if (installed) {
      return {
        requestedLanguage: locale.language,
        requestedRegion: locale.region,
        canonicalLocale: locale.tag,
        providerId: installed.id,
        availability: this.isEnabled(installed.id) ? "installed" : "disabled",
      };
    }
    const catalogMatch = bestLocaleMatch(this.catalogByLanguage.get(locale.language) ?? [], locale);
    if (catalogMatch.ambiguous) return resolution(style, "ambiguous", locale);
    const catalog = catalogMatch.value;
    return {
      requestedLanguage: locale.language,
      requestedRegion: locale.region,
      canonicalLocale: locale.tag,
      providerId: catalog?.id ?? null,
      availability: catalog ? "downloadable" : "unsupported",
    };
  }

  embeddedProviders(primaryScripts: readonly string[], ids: readonly string[]): LanguageProviderCapabilities[] {
    const ownedScripts = new Set(primaryScripts.map(normalizeScript));
    const selected: LanguageProviderCapabilities[] = [];
    for (const id of ids) {
      const provider = this.provider(id);
      if (!provider || !this.isEnabled(provider.id) || provider.supportsSpellcheck === false) continue;
      const scripts = provider.scripts.map(normalizeScript).filter(Boolean);
      if (!scripts.length || scripts.some((script) => ownedScripts.has(script))) continue;
      selected.push(provider);
      scripts.forEach((script) => ownedScripts.add(script));
    }
    return selected;
  }
}

function normalizeScript(script: string): string {
  return script.trim().toLowerCase();
}

function resolution(
  style: EffectiveLanguageStyle,
  availability: ProviderAvailability,
  locale: CanonicalLocale | null = null,
): LanguageProviderResolution {
  return {
    requestedLanguage: style.language.value,
    requestedRegion: style.region.value,
    canonicalLocale: locale?.tag ?? null,
    providerId: null,
    availability,
  };
}

function append<T>(map: Map<string, T[]>, key: string, value: T): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function bestLocaleMatch<T extends { languageTag: string }>(
  values: readonly T[],
  requested: CanonicalLocale,
): { value: T | null; ambiguous: boolean } {
  if (!values.length) return { value: null, ambiguous: false };
  if (requested.region) {
    const exact = values.filter((value) => providerLocale(value.languageTag)?.tag === requested.tag);
    if (exact.length !== 0) return { value: exact[0] ?? null, ambiguous: exact.length > 1 };
  }
  const languageOnly = values.filter((value) => providerLocale(value.languageTag)?.region === null);
  if (languageOnly.length !== 0) return { value: languageOnly[0] ?? null, ambiguous: languageOnly.length > 1 };
  return { value: values.length === 1 ? values[0] ?? null : null, ambiguous: values.length > 1 };
}
