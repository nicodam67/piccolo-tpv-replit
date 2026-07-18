import type { SupportedLocale } from "@/i18n.ts";

type TranslationMap = Record<string, { name?: string; description?: string }>;

type Translatable = {
  name: string;
  description?: string;
  translations?: TranslationMap;
};

/**
 * Returns the localized name and description for a menu item,
 * keeping the original name untranslated and only translating the description.
 */
export function localize(
  item: Translatable,
  locale: SupportedLocale,
): { name: string; description: string | undefined } {
  if (!item.translations) {
    return { name: item.name, description: item.description };
  }
  const t = item.translations[locale];
  return {
    name: item.name, // always keep original dish name untranslated
    description: t?.description?.trim() || item.description,
  };
}

/**
 * Returns the localized name and description for a category,
 * translating both name and description.
 */
export function localizeCategory(
  item: Translatable,
  locale: SupportedLocale,
): { name: string; description: string | undefined } {
  if (!item.translations) {
    return { name: item.name, description: item.description };
  }
  const t = item.translations[locale];
  return {
    name: t?.name?.trim() || item.name, // translate category name
    description: t?.description?.trim() || item.description,
  };
}
