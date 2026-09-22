import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { getAllergenMeta } from "@/lib/allergens.ts";
import { getTagMeta } from "@/lib/dietary-tags.ts";
import { SUPPORTED_LOCALES, SUPPORTED_LOCALES_ARRAY, isSupportedLocale, type SupportedLocale } from "@/i18n.ts";
import { localize, localizeCategory } from "@/lib/translations.ts";
import {
  type MenuItem,
  useTpvMenuSnapshot,
} from "@/lib/tpv-menu-integration.ts";

// Static translations for allergens and dietary tags
const LABEL_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: { "allergen.gluten":"Gluten","allergen.crustaceans":"Crustaceans","allergen.eggs":"Eggs","allergen.fish":"Fish","allergen.peanuts":"Peanuts","allergen.soy":"Soy","allergen.milk":"Milk","allergen.nuts":"Nuts","allergen.celery":"Celery","allergen.mustard":"Mustard","allergen.sesame":"Sesame","allergen.sulphites":"Sulphites","allergen.lupin":"Lupin","allergen.molluscs":"Molluscs","tag.vegetarian":"Vegetarian","tag.vegan":"Vegan","tag.gluten-free":"Gluten-Free","tag.spicy":"Spicy" },
  es: { "allergen.gluten":"Gluten","allergen.crustaceans":"Crustáceos","allergen.eggs":"Huevos","allergen.fish":"Pescado","allergen.peanuts":"Cacahuetes","allergen.soy":"Soja","allergen.milk":"Leche","allergen.nuts":"Frutos secos","allergen.celery":"Apio","allergen.mustard":"Mostaza","allergen.sesame":"Sésamo","allergen.sulphites":"Sulfitos","allergen.lupin":"Altramuces","allergen.molluscs":"Moluscos","tag.vegetarian":"Vegetariano","tag.vegan":"Vegano","tag.gluten-free":"Sin gluten","tag.spicy":"Picante" },
  fr: { "allergen.gluten":"Gluten","allergen.crustaceans":"Crustacés","allergen.eggs":"Œufs","allergen.fish":"Poisson","allergen.peanuts":"Arachides","allergen.soy":"Soja","allergen.milk":"Lait","allergen.nuts":"Fruits à coque","allergen.celery":"Céleri","allergen.mustard":"Moutarde","allergen.sesame":"Sésame","allergen.sulphites":"Sulfites","allergen.lupin":"Lupin","allergen.molluscs":"Mollusques","tag.vegetarian":"Végétarien","tag.vegan":"Végétalien","tag.gluten-free":"Sans gluten","tag.spicy":"Épicé" },
  de: { "allergen.gluten":"Gluten","allergen.crustaceans":"Krebstiere","allergen.eggs":"Eier","allergen.fish":"Fisch","allergen.peanuts":"Erdnüsse","allergen.soy":"Soja","allergen.milk":"Milch","allergen.nuts":"Schalenfrüchte","allergen.celery":"Sellerie","allergen.mustard":"Senf","allergen.sesame":"Sesam","allergen.sulphites":"Sulfite","allergen.lupin":"Lupinen","allergen.molluscs":"Weichtiere","tag.vegetarian":"Vegetarisch","tag.vegan":"Vegan","tag.gluten-free":"Glutenfrei","tag.spicy":"Scharf" },
  ca: { "allergen.gluten":"Gluten","allergen.crustaceans":"Crustacis","allergen.eggs":"Ous","allergen.fish":"Peix","allergen.peanuts":"Cacauets","allergen.soy":"Soja","allergen.milk":"Llet","allergen.nuts":"Fruits secs","allergen.celery":"Api","allergen.mustard":"Mostassa","allergen.sesame":"Sèsam","allergen.sulphites":"Sulfits","allergen.lupin":"Tramussos","allergen.molluscs":"Mol·luscos","tag.vegetarian":"Vegetarià","tag.vegan":"Vegà","tag.gluten-free":"Sense gluten","tag.spicy":"Picant" },
  it: { "allergen.gluten":"Glutine","allergen.crustaceans":"Crostacei","allergen.eggs":"Uova","allergen.fish":"Pesce","allergen.peanuts":"Arachidi","allergen.soy":"Soia","allergen.milk":"Latte","allergen.nuts":"Frutta a guscio","allergen.celery":"Sedano","allergen.mustard":"Senape","allergen.sesame":"Sesamo","allergen.sulphites":"Solfiti","allergen.lupin":"Lupini","allergen.molluscs":"Molluschi","tag.vegetarian":"Vegetariano","tag.vegan":"Vegano","tag.gluten-free":"Senza glutine","tag.spicy":"Piccante" },
  nl: { "allergen.gluten":"Gluten","allergen.crustaceans":"Schaaldieren","allergen.eggs":"Eieren","allergen.fish":"Vis","allergen.peanuts":"Pinda's","allergen.soy":"Soja","allergen.milk":"Melk","allergen.nuts":"Noten","allergen.celery":"Selderij","allergen.mustard":"Mosterd","allergen.sesame":"Sesam","allergen.sulphites":"Sulfieten","allergen.lupin":"Lupine","allergen.molluscs":"Weekdieren","tag.vegetarian":"Vegetarisch","tag.vegan":"Veganistisch","tag.gluten-free":"Glutenvrij","tag.spicy":"Pittig" },
  ro: { "allergen.gluten":"Gluten","allergen.crustaceans":"Crustacee","allergen.eggs":"Ouă","allergen.fish":"Pește","allergen.peanuts":"Arahide","allergen.soy":"Soia","allergen.milk":"Lapte","allergen.nuts":"Nuci","allergen.celery":"Țelină","allergen.mustard":"Muștar","allergen.sesame":"Susan","allergen.sulphites":"Sulfiți","allergen.lupin":"Lupin","allergen.molluscs":"Moluște","tag.vegetarian":"Vegetarian","tag.vegan":"Vegan","tag.gluten-free":"Fără gluten","tag.spicy":"Picant" },
};

function tLabel(key: string, locale: SupportedLocale): string {
  return LABEL_TRANSLATIONS[locale]?.[key] ?? LABEL_TRANSLATIONS["en"]?.[key] ?? key;
}

type PanelStrings = {
  carta: string; hidePanel: string; showPanel: string; print: string; close: string;
  tabElements: string; tabColors: string; tabFonts: string; tabLanguage: string; tabPages: string;
  showHide: string; colorsTitle: string; resetColorsApp: string; resetColors: string;
  headingFont: string; bodyFont: string; restoreFonts: string; textSize: string;
  small: string; large: string; normal: string; printLanguage: string; langNote: string;
  colorBg: string; colorCategoryTitle: string; colorItemName: string; colorDesc: string; colorPrice: string; colorBorder: string;
  header: string; categoryDesc: string; dishName: string; dishDesc: string; price: string; halfPortion: string; quantity: string; tags: string; allergens: string; footer: string;
  preparingPrint: string; newPage: string;
  selectCategories: string; selectAll: string; selectNone: string;
};

const PANEL_TRANSLATIONS: Record<string, PanelStrings> = {
  es: {
    carta: "Carta", hidePanel: "◀ Ocultar panel", showPanel: "▶ Mostrar panel", print: "🖨 Imprimir", close: "✕ Cerrar",
    tabElements: "Elementos", tabColors: "Colores", tabFonts: "Fuentes", tabLanguage: "Idioma", tabPages: "Páginas",
    showHide: "Mostrar / ocultar", colorsTitle: "Colores", resetColorsApp: "↺ Restaurar colores del app", resetColors: "Restablecer colores",
    headingFont: "Fuente de títulos", bodyFont: "Fuente de texto", restoreFonts: "Restaurar fuentes del branding",
    textSize: "Tamaño del texto", small: "Pequeño", large: "Grande", normal: "Tamaño normal (100%)",
    printLanguage: "Idioma de impresión", langNote: "Alérgenos y etiquetas se mostrarán en el idioma seleccionado.",
    colorBg: "Fondo", colorCategoryTitle: "Título categoría", colorItemName: "Nombre del plato", colorDesc: "Descripción", colorPrice: "Precio", colorBorder: "Líneas / bordes",
    header: "Cabecera (nombre, eslogan, dirección)", categoryDesc: "Descripción de categoría", dishName: "Nombre del plato", dishDesc: "Descripción del plato",
    price: "Precio", halfPortion: "Media ración", quantity: "Cantidad / Volumen", tags: "Etiquetas dietéticas", allergens: "Alérgenos", footer: "Pie de página",
    preparingPrint: "Preparando la carta para imprimir…", newPage: "— nueva página —",
    selectCategories: "Seleccionar categorías", selectAll: "Todas", selectNone: "Ninguna",
  },
  en: {
    carta: "Menu", hidePanel: "◀ Hide panel", showPanel: "▶ Show panel", print: "🖨 Print", close: "✕ Close",
    tabElements: "Elements", tabColors: "Colors", tabFonts: "Fonts", tabLanguage: "Language", tabPages: "Pages",
    showHide: "Show / hide", colorsTitle: "Colors", resetColorsApp: "↺ Restore app colors", resetColors: "Reset colors",
    headingFont: "Heading font", bodyFont: "Body font", restoreFonts: "Restore branding fonts",
    textSize: "Text size", small: "Small", large: "Large", normal: "Normal size (100%)",
    printLanguage: "Print language", langNote: "Allergens and tags will be shown in the selected language.",
    colorBg: "Background", colorCategoryTitle: "Category title", colorItemName: "Dish name", colorDesc: "Description", colorPrice: "Price", colorBorder: "Lines / borders",
    header: "Header (name, slogan, address)", categoryDesc: "Category description", dishName: "Dish name", dishDesc: "Dish description",
    price: "Price", halfPortion: "Half portion", quantity: "Quantity / Volume", tags: "Dietary tags", allergens: "Allergens", footer: "Footer",
    preparingPrint: "Preparing menu for printing…", newPage: "— new page —",
    selectCategories: "Select categories", selectAll: "All", selectNone: "None",
  },
  fr: {
    carta: "Carte", hidePanel: "◀ Masquer", showPanel: "▶ Afficher", print: "🖨 Imprimer", close: "✕ Fermer",
    tabElements: "Éléments", tabColors: "Couleurs", tabFonts: "Polices", tabLanguage: "Langue", tabPages: "Pages",
    showHide: "Afficher / masquer", colorsTitle: "Couleurs", resetColorsApp: "↺ Restaurer couleurs app", resetColors: "Réinitialiser",
    headingFont: "Police des titres", bodyFont: "Police du texte", restoreFonts: "Restaurer polices",
    textSize: "Taille du texte", small: "Petit", large: "Grand", normal: "Taille normale (100%)",
    printLanguage: "Langue d'impression", langNote: "Les allergènes et étiquettes s'afficheront dans la langue sélectionnée.",
    colorBg: "Fond", colorCategoryTitle: "Titre catégorie", colorItemName: "Nom du plat", colorDesc: "Description", colorPrice: "Prix", colorBorder: "Lignes / bordures",
    header: "En-tête (nom, slogan, adresse)", categoryDesc: "Description catégorie", dishName: "Nom du plat", dishDesc: "Description du plat",
    price: "Prix", halfPortion: "Demi-portion", quantity: "Quantité / Volume", tags: "Étiquettes", allergens: "Allergènes", footer: "Pied de page",
    preparingPrint: "Préparation de la carte…", newPage: "— nouvelle page —",
    selectCategories: "Sélectionner catégories", selectAll: "Toutes", selectNone: "Aucune",
  },
  de: {
    carta: "Speisekarte", hidePanel: "◀ Panel ausblenden", showPanel: "▶ Panel anzeigen", print: "🖨 Drucken", close: "✕ Schließen",
    tabElements: "Elemente", tabColors: "Farben", tabFonts: "Schriften", tabLanguage: "Sprache", tabPages: "Seiten",
    showHide: "Anzeigen / ausblenden", colorsTitle: "Farben", resetColorsApp: "↺ App-Farben wiederherstellen", resetColors: "Farben zurücksetzen",
    headingFont: "Überschrift-Schrift", bodyFont: "Text-Schrift", restoreFonts: "Schriften wiederherstellen",
    textSize: "Textgröße", small: "Klein", large: "Groß", normal: "Normalgröße (100%)",
    printLanguage: "Drucksprache", langNote: "Allergene und Tags werden in der gewählten Sprache angezeigt.",
    colorBg: "Hintergrund", colorCategoryTitle: "Kategorietitel", colorItemName: "Gerichtname", colorDesc: "Beschreibung", colorPrice: "Preis", colorBorder: "Linien / Rahmen",
    header: "Kopfzeile (Name, Slogan, Adresse)", categoryDesc: "Kategoriebeschreibung", dishName: "Gerichtname", dishDesc: "Gerichtbeschreibung",
    price: "Preis", halfPortion: "Halbe Portion", quantity: "Menge / Volumen", tags: "Ernährungsetiketten", allergens: "Allergene", footer: "Fußzeile",
    preparingPrint: "Speisekarte wird vorbereitet…", newPage: "— neue Seite —",
    selectCategories: "Kategorien auswählen", selectAll: "Alle", selectNone: "Keine",
  },
  ca: {
    carta: "Carta", hidePanel: "◀ Ocultar panell", showPanel: "▶ Mostrar panell", print: "🖨 Imprimir", close: "✕ Tancar",
    tabElements: "Elements", tabColors: "Colors", tabFonts: "Fonts", tabLanguage: "Idioma", tabPages: "Pàgines",
    showHide: "Mostrar / ocultar", colorsTitle: "Colors", resetColorsApp: "↺ Restaurar colors de l'app", resetColors: "Restablir colors",
    headingFont: "Font de títols", bodyFont: "Font de text", restoreFonts: "Restaurar fonts del branding",
    textSize: "Mida del text", small: "Petit", large: "Gran", normal: "Mida normal (100%)",
    printLanguage: "Idioma d'impressió", langNote: "Els al·lèrgens i etiquetes es mostraran en l'idioma seleccionat.",
    colorBg: "Fons", colorCategoryTitle: "Títol categoria", colorItemName: "Nom del plat", colorDesc: "Descripció", colorPrice: "Preu", colorBorder: "Línies / vores",
    header: "Capçalera (nom, eslògan, adreça)", categoryDesc: "Descripció de categoria", dishName: "Nom del plat", dishDesc: "Descripció del plat",
    price: "Preu", halfPortion: "Mitja ració", quantity: "Quantitat / Volum", tags: "Etiquetes dietètiques", allergens: "Al·lèrgens", footer: "Peu de pàgina",
    preparingPrint: "Preparant la carta per imprimir…", newPage: "— nova pàgina —",
    selectCategories: "Seleccionar categories", selectAll: "Totes", selectNone: "Cap",
  },
  it: {
    carta: "Menù", hidePanel: "◀ Nascondi pannello", showPanel: "▶ Mostra pannello", print: "🖨 Stampa", close: "✕ Chiudi",
    tabElements: "Elementi", tabColors: "Colori", tabFonts: "Caratteri", tabLanguage: "Lingua", tabPages: "Pagine",
    showHide: "Mostra / nascondi", colorsTitle: "Colori", resetColorsApp: "↺ Ripristina colori app", resetColors: "Ripristina colori",
    headingFont: "Font titoli", bodyFont: "Font testo", restoreFonts: "Ripristina font branding",
    textSize: "Dimensione testo", small: "Piccolo", large: "Grande", normal: "Dimensione normale (100%)",
    printLanguage: "Lingua di stampa", langNote: "Allergeni ed etichette saranno mostrati nella lingua selezionata.",
    colorBg: "Sfondo", colorCategoryTitle: "Titolo categoria", colorItemName: "Nome piatto", colorDesc: "Descrizione", colorPrice: "Prezzo", colorBorder: "Linee / bordi",
    header: "Intestazione (nome, slogan, indirizzo)", categoryDesc: "Descrizione categoria", dishName: "Nome piatto", dishDesc: "Descrizione piatto",
    price: "Prezzo", halfPortion: "Mezza porzione", quantity: "Quantità / Volume", tags: "Etichette dietetiche", allergens: "Allergeni", footer: "Piè di pagina",
    preparingPrint: "Preparazione menu per la stampa…", newPage: "— nuova pagina —",
    selectCategories: "Seleziona categorie", selectAll: "Tutte", selectNone: "Nessuna",
  },
  nl: {
    carta: "Menu", hidePanel: "◀ Verberg paneel", showPanel: "▶ Toon paneel", print: "🖨 Afdrukken", close: "✕ Sluiten",
    tabElements: "Elementen", tabColors: "Kleuren", tabFonts: "Lettertypen", tabLanguage: "Taal", tabPages: "Pagina's",
    showHide: "Tonen / verbergen", colorsTitle: "Kleuren", resetColorsApp: "↺ App-kleuren herstellen", resetColors: "Kleuren resetten",
    headingFont: "Koptekstlettertype", bodyFont: "Tekstlettertype", restoreFonts: "Branding-lettertypen herstellen",
    textSize: "Tekstgrootte", small: "Klein", large: "Groot", normal: "Normale grootte (100%)",
    printLanguage: "Afdruktaal", langNote: "Allergenen en labels worden weergegeven in de geselecteerde taal.",
    colorBg: "Achtergrond", colorCategoryTitle: "Categorietitel", colorItemName: "Gerechtnaam", colorDesc: "Beschrijving", colorPrice: "Prijs", colorBorder: "Lijnen / randen",
    header: "Koptekst (naam, slogan, adres)", categoryDesc: "Categoriebeschrijving", dishName: "Gerechtnaam", dishDesc: "Gerecht beschrijving",
    price: "Prijs", halfPortion: "Halve portie", quantity: "Hoeveelheid / Volume", tags: "Dieetetiketten", allergens: "Allergenen", footer: "Voettekst",
    preparingPrint: "Menu voorbereiden voor afdrukken…", newPage: "— nieuwe pagina —",
    selectCategories: "Categorieën selecteren", selectAll: "Alle", selectNone: "Geen",
  },
  ro: {
    carta: "Meniu", hidePanel: "◀ Ascunde panoul", showPanel: "▶ Afișează panoul", print: "🖨 Tipărire", close: "✕ Închide",
    tabElements: "Elemente", tabColors: "Culori", tabFonts: "Fonturi", tabLanguage: "Limbă", tabPages: "Pagini",
    showHide: "Afișează / ascunde", colorsTitle: "Culori", resetColorsApp: "↺ Restaurare culori app", resetColors: "Resetare culori",
    headingFont: "Font titluri", bodyFont: "Font text", restoreFonts: "Restaurare fonturi branding",
    textSize: "Dimensiune text", small: "Mic", large: "Mare", normal: "Dimensiune normală (100%)",
    printLanguage: "Limba de tipărire", langNote: "Alergenii și etichetele vor fi afișate în limba selectată.",
    colorBg: "Fundal", colorCategoryTitle: "Titlu categorie", colorItemName: "Nume fel", colorDesc: "Descriere", colorPrice: "Preț", colorBorder: "Linii / borduri",
    header: "Antet (nume, slogan, adresă)", categoryDesc: "Descriere categorie", dishName: "Nume fel", dishDesc: "Descriere fel",
    price: "Preț", halfPortion: "Jumătate de porție", quantity: "Cantitate / Volum", tags: "Etichete dietetice", allergens: "Alergeni", footer: "Subsol",
    preparingPrint: "Pregătire meniu pentru tipărire…", newPage: "— pagină nouă —",
    selectCategories: "Selectați categorii", selectAll: "Toate", selectNone: "Niciuna",
  },
};

function pt(locale: SupportedLocale): PanelStrings {
  return PANEL_TRANSLATIONS[locale] ?? PANEL_TRANSLATIONS.en;
}

function detectLocaleFromPath(): SupportedLocale {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const first = segments[0];
  if (first && isSupportedLocale(first)) return first;
  return "en";
}

const CUSTOM_FONT_URLS: Record<string, string> = {
  "Algerian__custom": "/fonts/Algerian__custom.ttf",
  "AvantGardeBk__custom": "/fonts/AvantGardeBk__custom.ttf",
  "AmericanTextBT__custom": "/fonts/AmericanTextBT__custom.ttf",
  "ZapfChanDm__custom": "/fonts/ZapfChanDm__custom.ttf",
  "ZapfChanMd__custom": "/fonts/ZapfChanMd__custom.ttf",
};
const CUSTOM_FONT_LABELS: Record<string, string> = {
  "Algerian__custom": "Algerian",
  "AvantGardeBk__custom": "Avant Garde Bk",
  "AmericanTextBT__custom": "American Text BT",
  "ZapfChanDm__custom": "Zapf Chancery Dm",
  "ZapfChanMd__custom": "Zapf Chancery Md",
};

const GOOGLE_FONTS = [
  "Playfair Display","Cormorant Garamond","EB Garamond","Libre Baskerville","Lora",
  "Merriweather","Crimson Text","Spectral","Cinzel","Josefin Sans","Raleway",
  "Montserrat","Lato","Open Sans","Source Sans 3","PT Serif","Roboto","Roboto Slab","Nunito","Oswald",
];

function isCustomFont(value: string) { return value.endsWith("__custom"); }

function buildGoogleFontsUrl(fonts: string[]): string | null {
  const names = fonts.filter((f) => f && !isCustomFont(f));
  const unique = [...new Set(names)];
  if (unique.length === 0) return null;
  const families = unique.map((f) => f.replace(/ /g, "+") + ":wght@300;400;600;700");
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}

function buildFontFaceCSS(fonts: string[]): string {
  const seen = new Set<string>();
  return fonts
    .filter((f) => f && isCustomFont(f) && CUSTOM_FONT_URLS[f])
    .filter((f) => { if (seen.has(f)) return false; seen.add(f); return true; })
    .map((f) => `@font-face { font-family: "${f}"; src: url("${CUSTOM_FONT_URLS[f]}") format("truetype"); font-display: swap; }`)
    .join("\n");
}

function ff(name: string, fallback: string) { return `"${name}", ${fallback}`; }

type ShowOptions = {
  showName: boolean; showDescription: boolean; showPrice: boolean;
  showHalfPortion: boolean; showQuantity: boolean; showTags: boolean;
  showAllergens: boolean; showCategoryDesc: boolean; showHeader: boolean; showFooter: boolean;
};

const DEFAULT_SHOW: ShowOptions = {
  showName: true, showDescription: true, showPrice: true, showHalfPortion: true,
  showQuantity: true, showTags: true, showAllergens: true, showCategoryDesc: true,
  showHeader: false, showFooter: false,
};

const SHOW_FIELDS: { key: keyof ShowOptions; labelKey: string }[] = [
  { key: "showHeader", labelKey: "header" },
  { key: "showCategoryDesc", labelKey: "categoryDesc" },
  { key: "showName", labelKey: "dishName" },
  { key: "showDescription", labelKey: "dishDesc" },
  { key: "showPrice", labelKey: "price" },
  { key: "showHalfPortion", labelKey: "halfPortion" },
  { key: "showQuantity", labelKey: "quantity" },
  { key: "showTags", labelKey: "tags" },
  { key: "showAllergens", labelKey: "allergens" },
  { key: "showFooter", labelKey: "footer" },
];

type Colors = { bg: string; categoryTitle: string; itemName: string; description: string; price: string; border: string; };
const DEFAULT_COLORS: Colors = { bg: "#ffffff", categoryTitle: "#1a1a1a", itemName: "#1a1a1a", description: "#555555", price: "#1a1a1a", border: "#cccccc" };
const COLOR_FIELDS: { key: keyof Colors; labelKey: keyof PanelStrings }[] = [
  { key: "bg", labelKey: "colorBg" },
  { key: "categoryTitle", labelKey: "colorCategoryTitle" },
  { key: "itemName", labelKey: "colorItemName" },
  { key: "description", labelKey: "colorDesc" },
  { key: "price", labelKey: "colorPrice" },
  { key: "border", labelKey: "colorBorder" },
];

function buildFontOptions(brandingHeading: string, brandingBody: string) {
  const customOptions = Object.entries(CUSTOM_FONT_LABELS).map(([value, label]) => ({ value, label }));
  const googleOptions = GOOGLE_FONTS.map((f) => ({ value: f, label: f }));
  const all = [...googleOptions, ...customOptions];
  const brandingFonts = [brandingHeading, brandingBody].filter(Boolean);
  const extras = brandingFonts.filter((f) => !all.some((o) => o.value === f));
  const extrasOpts = extras.map((f) => ({ value: f, label: isCustomFont(f) ? (CUSTOM_FONT_LABELS[f] ?? f) : f }));
  return [...extrasOpts, ...all];
}

const PORTION_LABELS: Record<string, { full: string; half: string }> = {
  en: { full: "Full", half: "Half" },
  es: { full: "Entera", half: "Media" },
  fr: { full: "Entière", half: "Demie" },
  de: { full: "Ganz", half: "Halb" },
  ca: { full: "Entera", half: "Mitja" },
  it: { full: "Intera", half: "Mezza" },
  nl: { full: "Heel", half: "Half" },
  ro: { full: "Întreagă", half: "Jumătate" },
};

export default function PrintPage() {
  const { lng } = useParams<{ lng?: string }>();
  const { categories, items, branding } = useTpvMenuSnapshot();

  const [show, setShow] = useState<ShowOptions>(DEFAULT_SHOW);
  const [colors, setColors] = useState<Colors>(DEFAULT_COLORS);
  const [colorsInitialized, setColorsInitialized] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"elements" | "colors" | "fonts" | "language" | "pages">("pages");
  const [autoPrinted, setAutoPrinted] = useState(false);
  const [textScale, setTextScale] = useState(1.0);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string> | null>(null); // null = all

  const routeLocale = lng && isSupportedLocale(lng) ? lng : detectLocaleFromPath();
  const [printLocale, setPrintLocale] = useState<SupportedLocale>(routeLocale);

  const isLoading = categories === undefined || items === undefined || branding === undefined;

  const brandingHeading = branding?.themeFonts?.heading ?? "Playfair Display";
  const brandingBody = branding?.themeFonts?.body ?? "Lato";
  const [headingFont, setHeadingFont] = useState<string | null>(null);
  const [bodyFont, setBodyFont] = useState<string | null>(null);

  useEffect(() => {
    if (branding && headingFont === null) setHeadingFont(branding.themeFonts?.heading ?? "Playfair Display");
    if (branding && bodyFont === null) setBodyFont(branding.themeFonts?.body ?? "Lato");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding]);

  useEffect(() => {
    if (branding && !colorsInitialized) {
      const tc = branding.themeColors;
      const hc = branding.themeFonts?.headingColor;
      setColors({
        bg: tc?.background ?? DEFAULT_COLORS.bg,
        categoryTitle: hc ?? tc?.primary ?? DEFAULT_COLORS.categoryTitle,
        itemName: hc ?? tc?.primary ?? DEFAULT_COLORS.itemName,
        description: branding.themeFonts?.bodyColor ?? tc?.infoTextColor ?? DEFAULT_COLORS.description,
        price: hc ?? tc?.primary ?? DEFAULT_COLORS.price,
        border: tc?.accent ?? DEFAULT_COLORS.border,
      });
      setColorsInitialized(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding]);

  const activeHeading = headingFont ?? brandingHeading;
  const activeBody = bodyFont ?? brandingBody;
  const fontOptions = isLoading ? [] : buildFontOptions(brandingHeading, brandingBody);
  const allFonts = [activeHeading, activeBody];
  const googleFontsUrl = buildGoogleFontsUrl(allFonts);
  const fontFaceCSS = buildFontFaceCSS(allFonts);

  const printRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && !autoPrinted) {
      const t = setTimeout(() => { setAutoPrinted(true); window.print(); }, 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isLoading, autoPrinted]);

  const p = pt(printLocale);

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#888", fontFamily: "sans-serif", fontSize: 14 }}>
        {pt(routeLocale).preparingPrint}
      </div>
    );
  }

  const topCategories = [...categories]
    .filter((c) => !c.parentId && c.available !== false)
    .sort((a, b) => a.order - b.order);

  // Determine which categories to show
  const visibleCategories = selectedCategoryIds === null
    ? topCategories
    : topCategories.filter((c) => selectedCategoryIds.has(c._id));

  function getSubcategories(parentId: string) {
    return [...(categories ?? [])]
      .filter((c) => c.parentId === parentId && c.available !== false)
      .sort((a, b) => a.order - b.order);
  }

  function getItemsForCategory(catId: string) {
    return [...(items ?? [])]
      .filter((i) => i.categoryId === catId)
      .sort((a, b) => a.order - b.order);
  }

  const headingStyle: React.CSSProperties = { fontFamily: ff(activeHeading, "serif") };
  const bodyStyle: React.CSSProperties = { fontFamily: ff(activeBody, "sans-serif") };

  function toggleShow(key: keyof ShowOptions) { setShow((prev) => ({ ...prev, [key]: !prev[key] })); }
  function setColor(key: keyof Colors, value: string) { setColors((prev) => ({ ...prev, [key]: value })); }

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) => {
      const current = prev ?? new Set(topCategories.map((c) => c._id));
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      // If all selected, revert to null (all)
      if (next.size === topCategories.length) return null;
      return next;
    });
  }

  function selectAllCategories() { setSelectedCategoryIds(null); }
  function selectNoCategories() { setSelectedCategoryIds(new Set()); }

  const effectiveSelected = selectedCategoryIds ?? new Set(topCategories.map((c) => c._id));

  return (
    <>
      {googleFontsUrl && <link rel="stylesheet" href={googleFontsUrl} />}

      <style>{`
        ${fontFaceCSS}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #e8e8e6; font-family: ${ff(activeBody, "sans-serif")}; }

        .toolbar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 200;
          background: #111; color: #fff;
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 8px 16px; font-size: 13px;
        }
        .toolbar-title { font-weight: 700; font-size: 14px; margin-right: 4px; }
        .spacer { flex: 1; }
        .t-btn {
          padding: 5px 14px; border-radius: 6px; font-size: 12px;
          font-weight: 600; cursor: pointer; border: none; white-space: nowrap;
        }
        .btn-panel { background: #2d2d2d; color: #ccc; }
        .btn-print { background: #fff; color: #111; }
        .btn-close  { background: #3a3a3a; color: #bbb; }

        .side-panel {
          position: fixed; top: 48px; left: 0; bottom: 0; z-index: 150;
          width: 270px; background: #1a1a1a; color: #eee;
          overflow-y: auto; display: flex; flex-direction: column;
          border-right: 1px solid #333; transition: transform .2s ease;
        }
        .side-panel.hidden { transform: translateX(-270px); }

        .panel-tabs { display: flex; border-bottom: 1px solid #2a2a2a; flex-shrink: 0; flex-wrap: wrap; }
        .panel-tab {
          flex: 1; min-width: 0; padding: 9px 3px; font-size: 10px; font-weight: 600; text-align: center;
          cursor: pointer; border: none; background: transparent; color: #777;
          letter-spacing: .03em; text-transform: uppercase;
        }
        .panel-tab.active { color: #fff; border-bottom: 2px solid #fff; margin-bottom: -1px; }

        .panel-body { padding: 14px; flex: 1; overflow-y: auto; }
        .panel-section-title { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #666; margin-bottom: 8px; }

        .panel-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 0; border-bottom: 1px solid #242424; font-size: 12px; gap: 8px;
        }
        .panel-row:last-child { border-bottom: none; }
        .panel-row-label { flex: 1; min-width: 0; }

        .toggle-switch {
          width: 32px; height: 18px; border-radius: 9px; border: none;
          cursor: pointer; transition: background .15s; position: relative; flex-shrink: 0;
        }
        .toggle-switch.on { background: #4ade80; }
        .toggle-switch.off { background: #555; }
        .toggle-switch::after {
          content: ''; position: absolute; top: 2px; width: 14px; height: 14px;
          border-radius: 50%; background: #fff; transition: left .15s;
        }
        .toggle-switch.on::after { left: 16px; }
        .toggle-switch.off::after { left: 2px; }

        .color-swatch {
          width: 30px; height: 22px; border: 1.5px solid #444; border-radius: 5px;
          background: transparent; cursor: pointer; padding: 1px; flex-shrink: 0;
        }

        .font-select {
          width: 100%; background: #222; color: #eee; border: 1px solid #3a3a3a;
          border-radius: 6px; padding: 5px 8px; font-size: 12px; margin-bottom: 4px;
          cursor: pointer;
        }
        .font-select:focus { outline: 1px solid #555; }
        .font-preview { font-size: 13px; padding: 6px 8px; background: #222; border-radius: 5px; text-align: center; margin-bottom: 12px; opacity: .8; }

        .cat-checkbox-row {
          display: flex; align-items: center; gap: 8px; padding: 5px 0;
          border-bottom: 1px solid #242424; cursor: pointer; font-size: 12px;
        }
        .cat-checkbox-row:last-child { border-bottom: none; }
        .cat-cb {
          width: 14px; height: 14px; border: 1.5px solid #555; border-radius: 3px;
          background: transparent; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
        }
        .cat-cb.checked { background: #4ade80; border-color: #4ade80; }
        .cat-cb.checked::after { content: "✓"; font-size: 9px; color: #000; font-weight: 700; }

        .paper-wrap {
          margin-top: 48px;
          padding: 24px 24px 24px 294px;
          min-height: calc(100vh - 48px);
          transition: padding-left .2s;
        }
        .paper-wrap.no-panel { padding-left: 24px; }
        .print-root {
          max-width: 780px; margin: 0 auto;
          padding: 52px 60px;
          box-shadow: 0 4px 32px rgba(0,0,0,.18);
          border-radius: 4px;
        }

        /* HEADER */
        .print-header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid; margin-bottom: 28px; }
        .print-restaurant-name { font-size: 40px; font-weight: 700; letter-spacing: .04em; margin-bottom: 6px; line-height: 1.1; }
        .print-tagline { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px; opacity: .6; }
        .print-address { font-size: 11px; opacity: .5; }

        /* CATEGORY — each on its own page with space for complete items */
        .print-category { page-break-before: always; break-before: page; padding-top: 28px; padding-bottom: 24px; }
        .print-category:first-of-type { page-break-before: avoid; break-before: avoid; }
        .print-category:not(:first-of-type) {
          border-top: 3px dashed #aaa; margin-top: 12px; padding-top: 28px; position: relative;
        }
        .print-category:not(:first-of-type)::before {
          content: attr(data-page-label);
          display: block; text-align: center; font-size: 10px; color: #999;
          letter-spacing: .1em; text-transform: uppercase; margin-bottom: 16px;
        }
        .print-category-title { font-size: 28px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; text-align: center; padding-bottom: 12px; margin-bottom: 18px; border-bottom: 2px solid; }
        .print-subcategory-title { font-size: 13px; font-weight: 600; letter-spacing: .05em; padding: 6px 0 3px 0; }
        .print-category-desc { font-size: 11px; margin-bottom: 10px; font-style: italic; opacity: .7; text-align: center; }

        /* ITEM — keep whole item together (no page break inside) */
        .print-item {
          display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;
          padding: 7px 0; border-bottom: 1px dotted;
          page-break-inside: avoid; break-inside: avoid;
        }
        .print-item:last-child { border-bottom: none; }
        .print-item-left { flex: 1; min-width: 0; }
        .print-item-name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
        .print-item-desc { font-size: 11px; line-height: 1.4; opacity: .75; }
        .print-item-quantity { font-size: 10px; opacity: .45; margin-top: 1px; }
        .print-item-tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 3px; }
        .print-tag { font-size: 9px; padding: 1px 5px; border-radius: 20px; border: 1px solid; opacity: .7; }
        .print-allergen { font-size: 9px; padding: 1px 5px; border-radius: 20px; border: 1px solid rgba(176,80,0,.4); background: rgba(176,80,0,.07); color: #b05000; }
        .print-item-right { text-align: right; white-space: nowrap; flex-shrink: 0; padding-top: 1px; }
        .print-price { font-size: 13px; font-weight: 700; display: block; }
        .print-price-half { font-size: 11px; display: block; opacity: .65; }
        .print-price-label { font-size: 10px; display: block; }

        /* FOOTER */
        .print-footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid; text-align: center; font-size: 10px; opacity: .35; letter-spacing: .05em; }

        @media print {
          body { background: #fff; }
          .toolbar, .side-panel { display: none !important; }
          .paper-wrap { margin-top: 0; padding: 0 !important; }
          .print-root { box-shadow: none; border-radius: 0; padding: 20px 28px; }
          .print-category { page-break-before: always; break-before: page; }
          .print-category:first-of-type { page-break-before: avoid; break-before: avoid; }
          .print-category:not(:first-of-type) { border-top: none; margin-top: 0; }
          .print-category:not(:first-of-type)::before { display: none; }
          .print-item { page-break-inside: avoid; break-inside: avoid; }
          @page { margin: 12mm 14mm; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="toolbar">
        <span className="toolbar-title">🖨 {p.carta}</span>
        <div className="spacer" />
        <button className="t-btn btn-panel" onClick={() => setPanelOpen((o) => !o)}>
          {panelOpen ? p.hidePanel : p.showPanel}
        </button>
        <button className="t-btn btn-print" onClick={() => window.print()}>{p.print}</button>
        <button className="t-btn btn-close" onClick={() => window.close()}>{p.close}</button>
      </div>

      {/* Side panel */}
      <div className={`side-panel${panelOpen ? "" : " hidden"}`}>
        <div className="panel-tabs">
          <button className={`panel-tab${activeTab === "pages" ? " active" : ""}`} onClick={() => setActiveTab("pages")}>{p.tabPages}</button>
          <button className={`panel-tab${activeTab === "elements" ? " active" : ""}`} onClick={() => setActiveTab("elements")}>{p.tabElements}</button>
          <button className={`panel-tab${activeTab === "colors" ? " active" : ""}`} onClick={() => setActiveTab("colors")}>{p.tabColors}</button>
          <button className={`panel-tab${activeTab === "fonts" ? " active" : ""}`} onClick={() => setActiveTab("fonts")}>{p.tabFonts}</button>
          <button className={`panel-tab${activeTab === "language" ? " active" : ""}`} onClick={() => setActiveTab("language")}>{p.tabLanguage}</button>
        </div>

        <div className="panel-body">

          {/* PAGES TAB */}
          {activeTab === "pages" && (
            <>
              <div className="panel-section-title">{p.selectCategories}</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <button
                  className="t-btn"
                  style={{ background: "#2d2d2d", color: "#ccc", flex: 1, padding: "4px 6px", fontSize: 11 }}
                  onClick={selectAllCategories}
                >{p.selectAll}</button>
                <button
                  className="t-btn"
                  style={{ background: "#2d2d2d", color: "#ccc", flex: 1, padding: "4px 6px", fontSize: 11 }}
                  onClick={selectNoCategories}
                >{p.selectNone}</button>
              </div>
              {topCategories.map((cat) => {
                const isChecked = effectiveSelected.has(cat._id);
                const { name: catDisplayName } = localizeCategory(cat, printLocale);
                return (
                  <div
                    key={cat._id}
                    className="cat-checkbox-row"
                    onClick={() => toggleCategory(cat._id)}
                  >
                    <div className={`cat-cb${isChecked ? " checked" : ""}`} />
                    <span style={{ flex: 1 }}>{catDisplayName}</span>
                  </div>
                );
              })}
            </>
          )}

          {/* ELEMENTS TAB */}
          {activeTab === "elements" && (
            <>
              <div className="panel-section-title">{p.showHide}</div>
              {SHOW_FIELDS.map(({ key, labelKey }) => (
                <div key={key} className="panel-row">
                  <span className="panel-row-label">{p[labelKey as keyof PanelStrings]}</span>
                  <button className={`toggle-switch ${show[key] ? "on" : "off"}`} onClick={() => toggleShow(key)} />
                </div>
              ))}
            </>
          )}

          {/* COLORS TAB */}
          {activeTab === "colors" && (
            <>
              <div className="panel-section-title">{p.colorsTitle}</div>
              {COLOR_FIELDS.map(({ key, labelKey }) => (
                <div key={key} className="panel-row">
                  <span className="panel-row-label">{p[labelKey]}</span>
                  <input
                    type="color" className="color-swatch" value={colors[key]}
                    onChange={(e) => setColor(key, e.target.value)} title={p[labelKey]}
                  />
                </div>
              ))}
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <button
                  className="t-btn" style={{ background: "#2d2d2d", color: "#ccc", width: "100%" }}
                  onClick={() => {
                    if (branding) {
                      const tc = branding.themeColors;
                      const hc = branding.themeFonts?.headingColor;
                      setColors({
                        bg: tc?.background ?? DEFAULT_COLORS.bg,
                        categoryTitle: hc ?? tc?.primary ?? DEFAULT_COLORS.categoryTitle,
                        itemName: hc ?? tc?.primary ?? DEFAULT_COLORS.itemName,
                        description: branding.themeFonts?.bodyColor ?? tc?.infoTextColor ?? DEFAULT_COLORS.description,
                        price: hc ?? tc?.primary ?? DEFAULT_COLORS.price,
                        border: tc?.accent ?? DEFAULT_COLORS.border,
                      });
                    }
                  }}
                >{p.resetColorsApp}</button>
                <button className="t-btn" style={{ background: "#2d2d2d", color: "#ccc", width: "100%" }} onClick={() => setColors(DEFAULT_COLORS)}>
                  {p.resetColors}
                </button>
              </div>
            </>
          )}

          {/* FONTS TAB */}
          {activeTab === "fonts" && (
            <>
              <div className="panel-section-title">{p.headingFont}</div>
              <div className="font-preview" style={{ fontFamily: ff(activeHeading, "serif") }}>
                {activeHeading.replace("__custom", "")} — Aa
              </div>
              <select className="font-select" value={activeHeading} onChange={(e) => setHeadingFont(e.target.value)}>
                {fontOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <div style={{ height: 16 }} />

              <div className="panel-section-title">{p.bodyFont}</div>
              <div className="font-preview" style={{ fontFamily: ff(activeBody, "sans-serif") }}>
                {activeBody.replace("__custom", "")} — Aa
              </div>
              <select className="font-select" value={activeBody} onChange={(e) => setBodyFont(e.target.value)}>
                {fontOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <div style={{ marginTop: 14 }}>
                <button
                  className="t-btn" style={{ background: "#2d2d2d", color: "#ccc", width: "100%" }}
                  onClick={() => { setHeadingFont(brandingHeading); setBodyFont(brandingBody); }}
                >{p.restoreFonts}</button>
              </div>

              <div style={{ height: 16 }} />
              <div className="panel-section-title">{p.textSize}</div>
              <div className="panel-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aaa" }}>
                  <span>A</span><span style={{ fontSize: 15 }}>A</span>
                </div>
                <input
                  type="range" min={0.7} max={1.5} step={0.05} value={textScale}
                  onChange={(e) => setTextScale(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "#fff", cursor: "pointer" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#666" }}>
                  <span>{p.small}</span>
                  <span style={{ color: "#aaa" }}>{Math.round(textScale * 100)}%</span>
                  <span>{p.large}</span>
                </div>
                <button
                  className="t-btn"
                  style={{ background: "#2d2d2d", color: "#888", width: "100%", marginTop: 4, fontSize: 11 }}
                  onClick={() => setTextScale(1.0)}
                >{p.normal}</button>
              </div>
            </>
          )}

          {/* LANGUAGE TAB */}
          {activeTab === "language" && (
            <>
              <div className="panel-section-title">{p.printLanguage}</div>
              {SUPPORTED_LOCALES_ARRAY.map((code) => {
                const meta = SUPPORTED_LOCALES[code];
                const isActive = printLocale === code;
                return (
                  <div key={code} className="panel-row" style={{ cursor: "pointer" }} onClick={() => setPrintLocale(code)}>
                    <span className="panel-row-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {meta.emoji ? <span>{meta.emoji}</span> : (
                        "flagUrl" in meta && meta.flagUrl
                          ? <img src={meta.flagUrl as string} alt={meta.name} style={{ width: 18, height: 13, objectFit: "cover", borderRadius: 2 }} />
                          : null
                      )}
                      {meta.nativeName}
                    </span>
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%", border: "2px solid #555",
                      background: isActive ? "#4ade80" : "transparent", flexShrink: 0,
                    }} />
                  </div>
                );
              })}
              <div style={{ marginTop: 12, fontSize: 11, color: "#666", lineHeight: 1.5 }}>
                {p.langNote}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Paper */}
      <div className={`paper-wrap${panelOpen ? "" : " no-panel"}`}>
        <div
          ref={printRootRef}
          className="print-root"
          style={{ ...bodyStyle, backgroundColor: colors.bg, fontSize: `${textScale}em` }}
        >
          {show.showHeader && (
            <header className="print-header" style={{ borderColor: colors.border }}>
              <div className="print-restaurant-name" style={{ ...headingStyle, color: colors.categoryTitle }}>
                {branding?.restaurantName ?? "Carta del Restaurante"}
              </div>
              {branding?.tagline && (
                <div className="print-tagline" style={{ ...bodyStyle, color: colors.description }}>{branding.tagline}</div>
              )}
              {(branding?.address || branding?.city) && (
                <div className="print-address" style={{ ...bodyStyle, color: colors.description }}>
                  {[branding.address, branding.city, branding.province, branding.postalCode, branding.country].filter(Boolean).join(", ")}
                  {branding?.phone ? ` · Tel: ${branding.phone}` : ""}
                </div>
              )}
            </header>
          )}

          {visibleCategories.map((cat) => {
            const catItems = getItemsForCategory(cat._id);
            const subcats = getSubcategories(cat._id);
            const hasSubcats = subcats.length > 0;
            const hasDirectItems = catItems.length > 0;
            if (!hasDirectItems && !hasSubcats) return null;
            const { description: catDesc, name: catName } = localizeCategory(cat, printLocale);
            return (
              <section key={cat._id} className="print-category" data-page-label={p.newPage}>
                <div className="print-category-title" style={{ ...headingStyle, color: colors.categoryTitle, borderColor: colors.border }}>
                  {catName}
                </div>
                {show.showCategoryDesc && catDesc && (
                  <div className="print-category-desc" style={{ ...bodyStyle, color: colors.description }}>{catDesc}</div>
                )}
                {catItems.map((item) => (
                  <PrintItem
                    key={item._id} item={item} locale={printLocale}
                    headingStyle={headingStyle} bodyStyle={bodyStyle}
                    colors={colors} show={show}
                  />
                ))}
                {hasSubcats && subcats.map((sub) => {
                  const subItems = getItemsForCategory(sub._id);
                  if (subItems.length === 0) return null;
                  const { name: subName } = localizeCategory(sub, printLocale);
                  return (
                    <div key={sub._id} style={{ marginTop: 10, paddingLeft: 8 }}>
                      <div className="print-subcategory-title" style={{ ...headingStyle, color: colors.categoryTitle, borderBottom: `1px solid ${colors.border}`, paddingBottom: 2, marginBottom: 4 }}>
                        {subName}
                      </div>
                      {subItems.map((item) => (
                        <PrintItem
                          key={item._id} item={item} locale={printLocale}
                          headingStyle={headingStyle} bodyStyle={bodyStyle}
                          colors={colors} show={show}
                        />
                      ))}
                    </div>
                  );
                })}
              </section>
            );
          })}

          {show.showFooter && (
            <footer className="print-footer" style={{ ...bodyStyle, color: colors.description, borderColor: colors.border }}>
              {branding?.restaurantName ?? ""}
              {branding?.establishedYear ? ` · Est. ${branding.establishedYear}` : ""}
            </footer>
          )}
        </div>
      </div>
    </>
  );
}

function PrintItem({
  item, locale, headingStyle, bodyStyle, colors, show,
}: {
  item: MenuItem; locale: SupportedLocale;
  headingStyle: React.CSSProperties; bodyStyle: React.CSSProperties;
  colors: Colors; show: ShowOptions;
}) {
  const tags = item.tags ?? [];
  const allergens = item.allergens ?? [];
  const { description: itemDesc } = localize(item, locale);
  const portionLabels = PORTION_LABELS[locale] ?? PORTION_LABELS.es;

  return (
    <div className="print-item" style={{ borderColor: colors.border }}>
      <div className="print-item-left">
        {show.showName && (
          <div className="print-item-name" style={{ ...headingStyle, color: colors.itemName }}>{item.name}</div>
        )}
        {show.showDescription && itemDesc && (
          <div className="print-item-desc" style={{ ...bodyStyle, color: colors.description }}>{itemDesc}</div>
        )}
        {show.showQuantity && item.quantity && (
          <div className="print-item-quantity" style={{ color: colors.description }}>{item.quantity}</div>
        )}
        {(show.showTags || show.showAllergens) && (tags.length > 0 || allergens.length > 0) && (
          <div className="print-item-tags">
            {show.showTags && tags.map((tagId) => {
              const meta = getTagMeta(tagId);
              if (!meta) return null;
              return <span key={tagId} className="print-tag" style={{ borderColor: colors.border, color: colors.description }}>{meta.icon} {tLabel(`tag.${tagId}`, locale)}</span>;
            })}
            {show.showAllergens && allergens.map((id) => {
              const meta = getAllergenMeta(id);
              if (!meta) return null;
              return <span key={id} className="print-allergen">{meta.icon} {tLabel(`allergen.${id}`, locale)}</span>;
            })}
          </div>
        )}
      </div>
      {show.showPrice && (
        <div className="print-item-right">
          {item.halfPortionPrice !== undefined ? (
            <>
              <span className="print-price-label" style={{ color: colors.price, opacity: 0.55 }}>{portionLabels.full}</span>
              <span className="print-price" style={{ ...headingStyle, color: colors.price }}>€{item.price.toFixed(2)}</span>
              {show.showHalfPortion && (
                <span className="print-price-half" style={{ color: colors.price }}>{portionLabels.half} €{item.halfPortionPrice!.toFixed(2)}</span>
              )}
            </>
          ) : (
            <span className="print-price" style={{ ...headingStyle, color: colors.price }}>€{item.price.toFixed(2)}</span>
          )}
        </div>
      )}
    </div>
  );
}
