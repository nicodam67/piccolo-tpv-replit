import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const SUPPORTED_LOCALES = {
  en: { code: "en", emoji: "🇬🇧", name: "English", nativeName: "English", dir: "ltr" },
  fr: { code: "fr", emoji: "🇫🇷", name: "French", nativeName: "Français", dir: "ltr" },
  de: { code: "de", emoji: "🇩🇪", name: "German", nativeName: "Deutsch", dir: "ltr" },
  ca: { code: "ca", emoji: "", flagUrl: "/flag-ca.svg", name: "Catalan", nativeName: "Català", dir: "ltr" },
  es: { code: "es", emoji: "🇪🇸", name: "Spanish", nativeName: "Español", dir: "ltr" },
  it: { code: "it", emoji: "🇮🇹", name: "Italian", nativeName: "Italiano", dir: "ltr" },
  nl: { code: "nl", emoji: "🇳🇱", name: "Dutch", nativeName: "Nederlands", dir: "ltr" },
  ro: { code: "ro", emoji: "🇷🇴", name: "Romanian", nativeName: "Română", dir: "ltr" },
} as const;

export const DEFAULT_LOCALE: keyof typeof SUPPORTED_LOCALES = "en";

export const SUPPORTED_LOCALES_ARRAY = Object.keys(SUPPORTED_LOCALES) as Array<
  keyof typeof SUPPORTED_LOCALES
>;
export type SupportedLocale = keyof typeof SUPPORTED_LOCALES;

export function isSupportedLocale(locale: string | undefined): locale is SupportedLocale {
  return !!locale && SUPPORTED_LOCALES_ARRAY.includes(locale as SupportedLocale);
}

export const SAVED_LOCALE =
  typeof window !== "undefined"
    ? (() => {
        try {
          const stored = localStorage.getItem("locale");
          return stored && isSupportedLocale(stored) ? stored : null;
        } catch {
          return null;
        }
      })()
    : null;

export const SAVED_OR_DEFAULT_LOCALE: SupportedLocale = SAVED_LOCALE ?? DEFAULT_LOCALE;

export function setLocaleInPath(
  locale: string,
  pathname: string,
  search: string = "",
  hash: string = "",
): string {
  const targetLocale = isSupportedLocale(locale) ? locale : SAVED_OR_DEFAULT_LOCALE;

  if (pathname === "/") {
    return `/${targetLocale}${search}${hash}`;
  }

  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];
  const firstSegmentLowercase = firstSegment?.toLowerCase();

  if (firstSegmentLowercase && isSupportedLocale(firstSegmentLowercase)) {
    segments[0] = targetLocale;
    return `/${segments.join("/")}${search}${hash}`;
  }

  return `/${targetLocale}${pathname}${search}${hash}`;
}

export async function changeLocale(lng: SupportedLocale) {
  try {
    await i18n.changeLanguage(lng);
    const localeMetadata = SUPPORTED_LOCALES[lng];
    document.documentElement.lang = lng;
    document.documentElement.dir = localeMetadata.dir ?? "ltr";
    try {
      localStorage.setItem("locale", lng);
    } catch {
      // fail silently
    }
  } catch (error) {
    console.error("Failed to change locale:", error);
    throw error;
  }
}

const translationModules = import.meta.glob<{ default: Record<string, string> }>(
  "./locales/*/*.json",
  { eager: true },
);

const resources: Record<string, Record<string, Record<string, string>>> = {};

for (const [path, module] of Object.entries(translationModules)) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (match) {
    const [, lng, ns] = match;
    if (!resources[lng]) {
      resources[lng] = {};
    }
    resources[lng][ns] = module.default;
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: SAVED_OR_DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES_ARRAY,
  defaultNS: "common",
  interpolation: { escapeValue: false },
  react: { useSuspense: true },
});

export default i18n;
