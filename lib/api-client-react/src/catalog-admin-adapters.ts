import type {
  CatalogProductAllergensResponse,
  CatalogTranslations,
} from "./catalog-admin-generated/api.schemas";

export type LegacyTranslationForm = Record<string, { name?: string; description?: string }>;

export interface ProductAllergensView {
  cache: CatalogProductAllergensResponse["cache"];
  overrides: CatalogProductAllergensResponse["overrides"];
  needsReview: boolean;
}

/** Normalize backend allergen payload without collapsing cache/overrides semantics. */
export function parseProductAllergensResponse(
  data: CatalogProductAllergensResponse,
): ProductAllergensView {
  return {
    cache: data.cache ?? [],
    overrides: data.overrides ?? [],
    needsReview: Boolean(data.needsReview),
  };
}

/**
 * Legacy free-text allergens field used by productos.tsx.
 * Uses EU allergen codes from cache and overrides without translating identifiers.
 */
export function allergenCodesForLegacyTextField(data: CatalogProductAllergensResponse): string {
  const codes = new Set<string>();
  for (const row of [...(data.cache ?? []), ...(data.overrides ?? [])]) {
    if (row.allergenCode) codes.add(row.allergenCode);
  }
  return [...codes].join(", ");
}

/** Build JSONB translations for PATCH/POST omitting empty locales. */
export function pruneTranslations(form: LegacyTranslationForm): CatalogTranslations | undefined {
  const out: CatalogTranslations = {};
  for (const [locale, entry] of Object.entries(form)) {
    if (!entry?.name && !entry?.description) continue;
    out[locale] = {};
    if (entry.name) out[locale].name = entry.name;
    if (entry.description) out[locale].description = entry.description;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Merge a partial form edit into existing translations without dropping other locales. */
export function mergeTranslationsPatch(
  existing: CatalogTranslations | null | undefined,
  patch: LegacyTranslationForm,
): CatalogTranslations | undefined {
  const merged: CatalogTranslations = { ...(existing ?? {}) };
  for (const [locale, entry] of Object.entries(patch)) {
    const current = { ...(merged[locale] ?? {}) };
    if (entry.name !== undefined) {
      if (entry.name) current.name = entry.name;
      else delete current.name;
    }
    if (entry.description !== undefined) {
      if (entry.description) current.description = entry.description;
      else delete current.description;
    }
    if (current.name || current.description) merged[locale] = current;
    else delete merged[locale];
  }
  return Object.keys(merged).length ? merged : undefined;
}

export function translationsToLegacyForm(
  translations: CatalogTranslations | null | undefined,
  locales: string[],
): LegacyTranslationForm {
  return Object.fromEntries(
    locales.map((locale) => [
      locale,
      {
        name: translations?.[locale]?.name ?? "",
        description: translations?.[locale]?.description ?? "",
      },
    ]),
  );
}

/** Round-trip helper: backend → form → patch preserves untouched locales. */
export function buildTranslationsPatchFromFormEdit(
  existing: CatalogTranslations | null | undefined,
  locales: string[],
  editedLocale: string,
  fields: { name?: string; description?: string },
): CatalogTranslations | undefined {
  const form = translationsToLegacyForm(existing, locales);
  form[editedLocale] = { ...form[editedLocale], ...fields };
  return mergeTranslationsPatch(existing, form);
}
