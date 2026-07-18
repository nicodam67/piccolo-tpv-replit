/**
 * /carta/imprimir — Página de impresión de la carta
 * Fiel al print/page.tsx del programa original.
 * Panel lateral colapsable con 5 pestañas:
 *   Páginas | Elementos | Colores | Fuentes | Idioma
 * Vista previa + auto-dispara diálogo de impresión.
 */
import { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import type { PublicMenuCategory } from './qr-menu/lib';

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const LOCALES = ['es', 'en', 'fr', 'de', 'ca', 'it', 'nl', 'ro'] as const;
type Locale = typeof LOCALES[number];
const LOCALE_LABELS: Record<Locale, string> = {
  es: '🇪🇸 Español', en: '🇬🇧 English', fr: '🇫🇷 Français', de: '🇩🇪 Deutsch',
  ca: '🏴 Català', it: '🇮🇹 Italiano', nl: '🇳🇱 Nederlands', ro: '🇷🇴 Română',
};

// ── Multilingual labels ───────────────────────────────────────────────────────

type LabelSet = {
  heading: string; body: string;
  sm: string; lg: string; normal: string;
  printLang: string; langNote: string;
  header: string; catDesc: string; dishName: string; dishDesc: string;
  price: string; halfPortion: string; quantity: string; tags: string; allergens: string; footer: string;
  colorBg: string; colorCatTitle: string; colorItemName: string; colorDesc: string; colorPrice: string; colorBorder: string;
  resetColors: string; restoreFonts: string;
  selectAll: string; selectNone: string;
  full: string; half: string;
};

const LABELS: Record<Locale, LabelSet> = {
  es: {
    heading: 'Fuente de títulos', body: 'Fuente de texto', sm: 'Pequeño', lg: 'Grande', normal: 'Normal',
    printLang: 'Idioma de impresión', langNote: 'Los alérgenos y etiquetas se mostrarán en el idioma seleccionado.',
    header: 'Cabecera (nombre, eslogan, dirección)', catDesc: 'Descripción de categoría',
    dishName: 'Nombre del plato', dishDesc: 'Descripción del plato',
    price: 'Precio', halfPortion: 'Media ración', quantity: 'Cantidad / Volumen',
    tags: 'Etiquetas dietéticas', allergens: 'Alérgenos', footer: 'Pie de página',
    colorBg: 'Fondo', colorCatTitle: 'Título categoría', colorItemName: 'Nombre plato',
    colorDesc: 'Descripción', colorPrice: 'Precio', colorBorder: 'Líneas / bordes',
    resetColors: '↺ Restaurar colores', restoreFonts: 'Restaurar tipografías',
    selectAll: 'Todas', selectNone: 'Ninguna',
    full: 'Ración completa', half: '½',
  },
  en: {
    heading: 'Heading font', body: 'Body font', sm: 'Small', lg: 'Large', normal: 'Normal',
    printLang: 'Print language', langNote: 'Allergens and tags will be shown in the selected language.',
    header: 'Header (name, tagline, address)', catDesc: 'Category description',
    dishName: 'Dish name', dishDesc: 'Dish description',
    price: 'Price', halfPortion: 'Half portion', quantity: 'Quantity / Volume',
    tags: 'Dietary tags', allergens: 'Allergens', footer: 'Footer',
    colorBg: 'Background', colorCatTitle: 'Category title', colorItemName: 'Dish name',
    colorDesc: 'Description', colorPrice: 'Price', colorBorder: 'Lines / borders',
    resetColors: '↺ Reset colors', restoreFonts: 'Restore fonts',
    selectAll: 'All', selectNone: 'None',
    full: 'Full', half: '½',
  },
  fr: {
    heading: 'Police des titres', body: 'Police du texte', sm: 'Petit', lg: 'Grand', normal: 'Normal',
    printLang: 'Langue d\'impression', langNote: 'Les allergènes et étiquettes s\'afficheront dans la langue sélectionnée.',
    header: 'En-tête (nom, slogan, adresse)', catDesc: 'Description catégorie',
    dishName: 'Nom du plat', dishDesc: 'Description du plat',
    price: 'Prix', halfPortion: 'Demi-portion', quantity: 'Quantité / Volume',
    tags: 'Étiquettes', allergens: 'Allergènes', footer: 'Pied de page',
    colorBg: 'Fond', colorCatTitle: 'Titre catégorie', colorItemName: 'Nom du plat',
    colorDesc: 'Description', colorPrice: 'Prix', colorBorder: 'Lignes / bordures',
    resetColors: '↺ Réinitialiser', restoreFonts: 'Restaurer polices',
    selectAll: 'Toutes', selectNone: 'Aucune',
    full: 'Portion complète', half: '½',
  },
  de: {
    heading: 'Überschrift-Schrift', body: 'Text-Schrift', sm: 'Klein', lg: 'Groß', normal: 'Normal',
    printLang: 'Drucksprache', langNote: 'Allergene und Tags werden in der gewählten Sprache angezeigt.',
    header: 'Kopfzeile (Name, Slogan, Adresse)', catDesc: 'Kategoriebeschreibung',
    dishName: 'Gerichtname', dishDesc: 'Gerichtbeschreibung',
    price: 'Preis', halfPortion: 'Halbe Portion', quantity: 'Menge / Volumen',
    tags: 'Ernährungsetiketten', allergens: 'Allergene', footer: 'Fußzeile',
    colorBg: 'Hintergrund', colorCatTitle: 'Kategorietitel', colorItemName: 'Gerichtname',
    colorDesc: 'Beschreibung', colorPrice: 'Preis', colorBorder: 'Linien / Rahmen',
    resetColors: '↺ Farben zurücksetzen', restoreFonts: 'Schriften wiederherstellen',
    selectAll: 'Alle', selectNone: 'Keine',
    full: 'Volle Portion', half: '½',
  },
  ca: {
    heading: 'Tipografia títols', body: 'Tipografia text', sm: 'Petit', lg: 'Gran', normal: 'Normal',
    printLang: 'Idioma d\'impressió', langNote: 'Els al·lèrgens i etiquetes es mostraran en l\'idioma seleccionat.',
    header: 'Capçalera (nom, eslogan, adreça)', catDesc: 'Descripció categoria',
    dishName: 'Nom del plat', dishDesc: 'Descripció del plat',
    price: 'Preu', halfPortion: 'Mitja ració', quantity: 'Quantitat / Volum',
    tags: 'Etiquetes dietètiques', allergens: 'Al·lèrgens', footer: 'Peu de pàgina',
    colorBg: 'Fons', colorCatTitle: 'Títol categoria', colorItemName: 'Nom del plat',
    colorDesc: 'Descripció', colorPrice: 'Preu', colorBorder: 'Línies / vores',
    resetColors: '↺ Restaurar colors', restoreFonts: 'Restaurar tipografies',
    selectAll: 'Totes', selectNone: 'Cap',
    full: 'Ració completa', half: '½',
  },
  it: {
    heading: 'Font titoli', body: 'Font testo', sm: 'Piccolo', lg: 'Grande', normal: 'Normale',
    printLang: 'Lingua di stampa', langNote: 'Gli allergeni e le etichette verranno mostrati nella lingua selezionata.',
    header: 'Intestazione (nome, slogan, indirizzo)', catDesc: 'Descrizione categoria',
    dishName: 'Nome del piatto', dishDesc: 'Descrizione del piatto',
    price: 'Prezzo', halfPortion: 'Mezza porzione', quantity: 'Quantità / Volume',
    tags: 'Etichette dietetiche', allergens: 'Allergeni', footer: 'Piè di pagina',
    colorBg: 'Sfondo', colorCatTitle: 'Titolo categoria', colorItemName: 'Nome piatto',
    colorDesc: 'Descrizione', colorPrice: 'Prezzo', colorBorder: 'Linee / bordi',
    resetColors: '↺ Ripristina colori', restoreFonts: 'Ripristina font',
    selectAll: 'Tutte', selectNone: 'Nessuna',
    full: 'Porzione intera', half: '½',
  },
  nl: {
    heading: 'Koptekstlettertype', body: 'Tekstlettertype', sm: 'Klein', lg: 'Groot', normal: 'Normaal',
    printLang: 'Afdruktaal', langNote: 'Allergenen en tags worden weergegeven in de geselecteerde taal.',
    header: 'Koptekst (naam, slogan, adres)', catDesc: 'Categoriebeschrijving',
    dishName: 'Naam gerecht', dishDesc: 'Beschrijving gerecht',
    price: 'Prijs', halfPortion: 'Halve portie', quantity: 'Hoeveelheid / Volume',
    tags: 'Dieetlabels', allergens: 'Allergenen', footer: 'Voettekst',
    colorBg: 'Achtergrond', colorCatTitle: 'Categorietitel', colorItemName: 'Gerechtnaam',
    colorDesc: 'Beschrijving', colorPrice: 'Prijs', colorBorder: 'Lijnen / randen',
    resetColors: '↺ Kleuren resetten', restoreFonts: 'Lettertypen herstellen',
    selectAll: 'Alle', selectNone: 'Geen',
    full: 'Volle portie', half: '½',
  },
  ro: {
    heading: 'Font titluri', body: 'Font text', sm: 'Mic', lg: 'Mare', normal: 'Normal',
    printLang: 'Limba tipărire', langNote: 'Alergenii și etichetele vor fi afișate în limba selectată.',
    header: 'Antet (nume, slogan, adresă)', catDesc: 'Descriere categorie',
    dishName: 'Numele preparatului', dishDesc: 'Descrierea preparatului',
    price: 'Preț', halfPortion: 'Jumătate de porție', quantity: 'Cantitate / Volum',
    tags: 'Etichete dietetice', allergens: 'Alergeni', footer: 'Subsol',
    colorBg: 'Fundal', colorCatTitle: 'Titlu categorie', colorItemName: 'Nume preparat',
    colorDesc: 'Descriere', colorPrice: 'Preț', colorBorder: 'Linii / margini',
    resetColors: '↺ Resetare culori', restoreFonts: 'Restaurare fonturi',
    selectAll: 'Toate', selectNone: 'Niciunul',
    full: 'Porție completă', half: '½',
  },
};

// ── Allergen labels per locale ─────────────────────────────────────────────────

const ALLERGEN_LABELS: Record<string, Record<Locale, string>> = {
  gluten: { es: 'Gluten', en: 'Gluten', fr: 'Gluten', de: 'Gluten', ca: 'Gluten', it: 'Glutine', nl: 'Gluten', ro: 'Gluten' },
  crustaceos: { es: 'Crustáceos', en: 'Crustaceans', fr: 'Crustacés', de: 'Krebstiere', ca: 'Crustacis', it: 'Crostacei', nl: 'Schaaldieren', ro: 'Crustacee' },
  huevos: { es: 'Huevos', en: 'Eggs', fr: 'Œufs', de: 'Eier', ca: 'Ous', it: 'Uova', nl: 'Eieren', ro: 'Ouă' },
  pescado: { es: 'Pescado', en: 'Fish', fr: 'Poisson', de: 'Fisch', ca: 'Peix', it: 'Pesce', nl: 'Vis', ro: 'Pește' },
  cacahuetes: { es: 'Cacahuetes', en: 'Peanuts', fr: 'Arachides', de: 'Erdnüsse', ca: 'Cacauets', it: 'Arachidi', nl: 'Pinda\'s', ro: 'Arahide' },
  soja: { es: 'Soja', en: 'Soy', fr: 'Soja', de: 'Soja', ca: 'Soja', it: 'Soia', nl: 'Soja', ro: 'Soia' },
  leche: { es: 'Leche', en: 'Milk', fr: 'Lait', de: 'Milch', ca: 'Llet', it: 'Latte', nl: 'Melk', ro: 'Lapte' },
  frutos_cascara: { es: 'Frutos secos', en: 'Nuts', fr: 'Fruits à coques', de: 'Schalenfrüchte', ca: 'Fruits secs', it: 'Frutta a guscio', nl: 'Noten', ro: 'Fructe cu coajă' },
  apio: { es: 'Apio', en: 'Celery', fr: 'Céleri', de: 'Sellerie', ca: 'Api', it: 'Sedano', nl: 'Selderij', ro: 'Țelină' },
  mostaza: { es: 'Mostaza', en: 'Mustard', fr: 'Moutarde', de: 'Senf', ca: 'Mostassa', it: 'Senape', nl: 'Mosterd', ro: 'Muștar' },
  sesamo: { es: 'Sésamo', en: 'Sesame', fr: 'Sésame', de: 'Sesam', ca: 'Sèsam', it: 'Sesamo', nl: 'Sesam', ro: 'Susan' },
  sulfitos: { es: 'Sulfitos', en: 'Sulphites', fr: 'Sulfites', de: 'Sulfite', ca: 'Sulfits', it: 'Solfiti', nl: 'Sulfiet', ro: 'Sulfiți' },
  altramuces: { es: 'Altramuces', en: 'Lupin', fr: 'Lupin', de: 'Lupinen', ca: 'Tramussos', it: 'Lupino', nl: 'Lupine', ro: 'Lupin' },
  moluscos: { es: 'Moluscos', en: 'Molluscs', fr: 'Mollusques', de: 'Weichtiere', ca: 'Mol·luscs', it: 'Molluschi', nl: 'Weekdieren', ro: 'Moluște' },
};

const DIETARY_LABELS: Record<string, Record<Locale, string>> = {
  vegetariano: { es: '🥦 Vegetariano', en: '🥦 Vegetarian', fr: '🥦 Végétarien', de: '🥦 Vegetarisch', ca: '🥦 Vegetarià', it: '🥦 Vegetariano', nl: '🥦 Vegetarisch', ro: '🥦 Vegetarian' },
  vegano: { es: '🌿 Vegano', en: '🌿 Vegan', fr: '🌿 Végétalien', de: '🌿 Vegan', ca: '🌿 Vegà', it: '🌿 Vegano', nl: '🌿 Veganistisch', ro: '🌿 Vegan' },
  singluten: { es: '🚫🌾 Sin gluten', en: '🚫🌾 Gluten-Free', fr: '🚫🌾 Sans gluten', de: '🚫🌾 Glutenfrei', ca: '🚫🌾 Sense gluten', it: '🚫🌾 Senza glutine', nl: '🚫🌾 Glutenvrij', ro: '🚫🌾 Fără gluten' },
  picante: { es: '🌶️ Picante', en: '🌶️ Spicy', fr: '🌶️ Épicé', de: '🌶️ Scharf', ca: '🌶️ Picant', it: '🌶️ Piccante', nl: '🌶️ Pittig', ro: '🌶️ Picant' },
};

const ALLERGEN_ICONS: Record<string, string> = {
  gluten: '🌾', crustaceos: '🦞', huevos: '🥚', pescado: '🐟', cacahuetes: '🥜',
  soja: '🫘', leche: '🥛', frutos_cascara: '🌰', apio: '🥬', mostaza: '🌿',
  sesamo: '🌱', sulfitos: '🍷', altramuces: '🌻', moluscos: '🦑',
};

// Also accept legacy English IDs
const ALLERGEN_ID_MAP: Record<string, string> = {
  crustaceans: 'crustaceos', eggs: 'huevos', fish: 'pescado', peanuts: 'cacahuetes',
  soy: 'soja', milk: 'leche', nuts: 'frutos_cascara', celery: 'apio', mustard: 'mostaza',
  sesame: 'sesamo', sulphites: 'sulfitos', lupin: 'altramuces', molluscs: 'moluscos',
};

function normalizeAllergenId(id: string): string {
  return ALLERGEN_ID_MAP[id] ?? id;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ShowElements = {
  header: boolean; catDesc: boolean; dishName: boolean; dishDesc: boolean;
  price: boolean; halfPortion: boolean; quantity: boolean; tags: boolean;
  allergens: boolean; footer: boolean;
};

type PrintColors = {
  bg: string; catTitle: string; itemName: string; desc: string; price: string; border: string;
};

type PrintFonts = {
  heading: string; body: string; size: 'sm' | 'md' | 'lg';
};

type PanelTab = 'pages' | 'elements' | 'colors' | 'fonts' | 'language';

interface Branding {
  restaurantName?: string; tagline?: string; address?: string; city?: string;
  phone?: string; establishedYear?: string; logoUrl?: string;
  themeColors?: Record<string, string> | null;
  themeFonts?: { heading?: string; body?: string } | null;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_COLORS: PrintColors = {
  bg: '#ffffff', catTitle: '#1a1a1a', itemName: '#1a1a1a',
  desc: '#555555', price: '#1a1a1a', border: '#e5e7eb',
};

const DEFAULT_FONTS: PrintFonts = {
  heading: 'Playfair Display', body: 'Lato', size: 'md',
};

const DEFAULT_SHOW: ShowElements = {
  header: true, catDesc: true, dishName: true, dishDesc: true,
  price: true, halfPortion: true, quantity: true, tags: true,
  allergens: true, footer: true,
};

// ── Font loading ──────────────────────────────────────────────────────────────

function loadPrintFont(name: string) {
  if (!name || name.includes('__custom')) return;
  const id = `pf-${name.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

// ── Text helpers ──────────────────────────────────────────────────────────────

function locName(item: { name: string; translations?: Record<string, { name?: string; description?: string }> }, locale: string): string {
  if (locale === 'es') return item.name;
  return item.translations?.[locale]?.name || item.name;
}

function locDesc(item: { description?: string | null; translations?: Record<string, { name?: string; description?: string }> }, locale: string): string {
  if (locale === 'es') return item.description ?? '';
  return item.translations?.[locale]?.description || item.description || '';
}

function parseAllergens(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CartaImprimir() {
  const [categories, setCategories] = useState<PublicMenuCategory[]>([]);
  const [branding, setBranding] = useState<Branding>({});
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>('pages');
  const [locale, setLocale] = useState<Locale>('es');
  const [selectedCats, setSelectedCats] = useState<Set<string> | null>(null); // null = all
  const [show, setShow] = useState<ShowElements>(DEFAULT_SHOW);
  const [colors, setColors] = useState<PrintColors>(DEFAULT_COLORS);
  const [fonts, setFonts] = useState<PrintFonts>(DEFAULT_FONTS);
  const [didPrint, setDidPrint] = useState(false);

  const lbl = LABELS[locale];

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/api/public/menu`).then(r => r.json()),
      fetch(`${BASE}/api/public/branding`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([cats, brand]) => {
      const catList: PublicMenuCategory[] = Array.isArray(cats) ? cats : [];
      setCategories(catList);
      setSelectedCats(new Set(catList.map((c: PublicMenuCategory) => c.id)));
      if (brand) {
        setBranding(brand);
        // Apply branding defaults to colors
        const tc = brand.themeColors ?? {};
        if (tc.background || tc.primary || tc.accent) {
          setColors(prev => ({
            ...prev,
            ...(tc.background ? { bg: tc.background } : {}),
            ...(tc.primary ? { catTitle: tc.primary, itemName: tc.primary } : {}),
          }));
        }
        // Apply branding fonts
        if (brand.themeFonts?.heading || brand.themeFonts?.body) {
          setFonts(prev => ({
            ...prev,
            ...(brand.themeFonts?.heading ? { heading: brand.themeFonts.heading } : {}),
            ...(brand.themeFonts?.body ? { body: brand.themeFonts.body } : {}),
          }));
        }
      }
    }).finally(() => setLoading(false));
  }, []);

  // Load fonts
  useEffect(() => { loadPrintFont(fonts.heading); loadPrintFont(fonts.body); }, [fonts.heading, fonts.body]);

  // Auto-trigger print after data loads
  useEffect(() => {
    if (!loading && !didPrint) {
      const t = setTimeout(() => { window.print(); setDidPrint(true); }, 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [loading, didPrint]);

  const activeCats = useMemo(() => {
    if (!selectedCats) return categories;
    return categories.filter(c => selectedCats.has(c.id));
  }, [categories, selectedCats]);

  const fontSizes = { sm: '85%', md: '100%', lg: '115%' };
  const headingStyle: React.CSSProperties = { fontFamily: `"${fonts.heading}", serif` };
  const bodyStyle: React.CSSProperties = { fontFamily: `"${fonts.body}", sans-serif`, fontSize: fontSizes[fonts.size] };

  function toggleCat(id: string) {
    setSelectedCats(prev => {
      const s = new Set(prev ?? categories.map(c => c.id));
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function setAll(val: boolean) {
    setSelectedCats(val ? new Set(categories.map(c => c.id)) : new Set());
  }

  function toggleShow(key: keyof ShowElements) {
    setShow(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function restoreColors() {
    const tc = (branding.themeColors ?? {}) as Record<string, string>;
    setColors({
      bg: tc.background ?? DEFAULT_COLORS.bg,
      catTitle: tc.primary ?? DEFAULT_COLORS.catTitle,
      itemName: tc.primary ?? DEFAULT_COLORS.itemName,
      desc: DEFAULT_COLORS.desc,
      price: tc.primary ?? DEFAULT_COLORS.price,
      border: DEFAULT_COLORS.border,
    });
  }

  function restoreFonts() {
    setFonts({
      heading: (branding as any).themeFonts?.heading ?? DEFAULT_FONTS.heading,
      body: (branding as any).themeFonts?.body ?? DEFAULT_FONTS.body,
      size: 'md',
    });
  }

  const PANEL_TABS: { id: PanelTab; label: string }[] = [
    { id: 'pages', label: '📄 Páginas' },
    { id: 'elements', label: '📋 Elementos' },
    { id: 'colors', label: '🎨 Colores' },
    { id: 'fonts', label: '✍️ Fuentes' },
    { id: 'language', label: '🌐 Idioma' },
  ];

  const FONT_OPTIONS = ['Playfair Display', 'Lora', 'Merriweather', 'Cormorant Garamond', 'Lato', 'Raleway', 'Montserrat', 'Poppins', 'Cinzel', 'Dancing Script'];

  const SHOW_ELEMENTS: { key: keyof ShowElements; label: string }[] = [
    { key: 'header', label: lbl.header },
    { key: 'catDesc', label: lbl.catDesc },
    { key: 'dishName', label: lbl.dishName },
    { key: 'dishDesc', label: lbl.dishDesc },
    { key: 'price', label: lbl.price },
    { key: 'halfPortion', label: lbl.halfPortion },
    { key: 'quantity', label: lbl.quantity },
    { key: 'tags', label: lbl.tags },
    { key: 'allergens', label: lbl.allergens },
    { key: 'footer', label: lbl.footer },
  ];

  const footerAddress = [
    branding.address,
    [branding.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* ── Control panel ──────────────────────────────────────────────── */}
      <div
        className={`no-print shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ${panelOpen ? 'w-72' : 'w-10'} overflow-hidden`}
        style={{ minHeight: '100vh' }}
      >
        {panelOpen ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold text-sm text-gray-800">Opciones de impresión</span>
              <button onClick={() => setPanelOpen(false)} className="p-1 rounded hover:bg-gray-100 cursor-pointer">
                <ChevronLeft size={16} className="text-gray-500" />
              </button>
            </div>

            {/* Panel tab bar */}
            <div className="flex flex-col border-b">
              {PANEL_TABS.map(({ id, label }) => (
                <button
                  key={id} onClick={() => setPanelTab(id)}
                  className={`text-left px-4 py-2 text-xs font-medium cursor-pointer transition-colors ${panelTab === id ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Pages tab */}
              {panelTab === 'pages' && (
                <div className="space-y-2">
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => setAll(true)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 cursor-pointer">{lbl.selectAll}</button>
                    <button onClick={() => setAll(false)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 cursor-pointer">{lbl.selectNone}</button>
                  </div>
                  {categories.map(cat => (
                    <label key={cat.id} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedCats ? selectedCats.has(cat.id) : true}
                        onChange={() => toggleCat(cat.id)}
                        className="rounded"
                      />
                      <span className="text-xs text-gray-700">
                        {cat.icon && <span className="mr-1">{cat.icon}</span>}
                        {locName(cat, locale)}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* Elements tab */}
              {panelTab === 'elements' && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 mb-2">Mostrar / ocultar</p>
                  {SHOW_ELEMENTS.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-gray-50">
                      <input type="checkbox" checked={show[key]} onChange={() => toggleShow(key)} className="rounded" />
                      <span className="text-xs text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Colors tab */}
              {panelTab === 'colors' && (
                <div className="space-y-3">
                  {([
                    { key: 'bg', label: lbl.colorBg },
                    { key: 'catTitle', label: lbl.colorCatTitle },
                    { key: 'itemName', label: lbl.colorItemName },
                    { key: 'desc', label: lbl.colorDesc },
                    { key: 'price', label: lbl.colorPrice },
                    { key: 'border', label: lbl.colorBorder },
                  ] as { key: keyof PrintColors; label: string }[]).map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-600">{label}</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color" value={colors[key]}
                          onChange={e => setColors(prev => ({ ...prev, [key]: e.target.value }))}
                          className="w-7 h-7 rounded cursor-pointer p-0.5 border border-gray-200"
                        />
                        <span className="text-xs font-mono text-gray-400">{colors[key]}</span>
                      </div>
                    </div>
                  ))}
                  <button onClick={restoreColors} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer mt-2">{lbl.resetColors}</button>
                </div>
              )}

              {/* Fonts tab */}
              {panelTab === 'fonts' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-600 block">{lbl.heading}</label>
                    <select
                      value={fonts.heading}
                      onChange={e => setFonts(prev => ({ ...prev, heading: e.target.value }))}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs cursor-pointer"
                    >
                      {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-600 block">{lbl.body}</label>
                    <select
                      value={fonts.body}
                      onChange={e => setFonts(prev => ({ ...prev, body: e.target.value }))}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs cursor-pointer"
                    >
                      {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-600 block">Tamaño del texto</label>
                    <div className="flex gap-1">
                      {(['sm', 'md', 'lg'] as const).map(s => (
                        <button key={s} onClick={() => setFonts(prev => ({ ...prev, size: s }))}
                          className={`flex-1 py-1.5 text-xs rounded border cursor-pointer ${fonts.size === s ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          {s === 'sm' ? lbl.sm : s === 'lg' ? lbl.lg : lbl.normal}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={restoreFonts} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">{lbl.restoreFonts}</button>
                </div>
              )}

              {/* Language tab */}
              {panelTab === 'language' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">{lbl.langNote}</p>
                  <div className="space-y-1.5">
                    {LOCALES.map(l => (
                      <label key={l} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-gray-50">
                        <input type="radio" name="locale" checked={locale === l} onChange={() => setLocale(l)} />
                        <span className="text-xs text-gray-700">{LOCALE_LABELS[l]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Print button */}
            <div className="p-4 border-t">
              <button
                onClick={() => window.print()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-white bg-gray-900 hover:bg-gray-700 cursor-pointer transition-colors"
              >
                <Printer size={15} />
                Imprimir carta
              </button>
              <a href={`${BASE}/carta`} className="block text-center mt-2 text-xs text-gray-400 hover:text-gray-600 cursor-pointer">← Volver a la carta</a>
            </div>
          </>
        ) : (
          <button onClick={() => setPanelOpen(true)} className="w-full h-full flex items-center justify-center cursor-pointer hover:bg-gray-50">
            <ChevronRight size={16} className="text-gray-400" />
          </button>
        )}
      </div>

      {/* ── Print preview ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto print-area">
        <div
          className="mx-auto p-8 max-w-3xl min-h-screen"
          style={{ background: colors.bg, fontFamily: bodyStyle.fontFamily, fontSize: bodyStyle.fontSize }}
        >
          {loading ? (
            <p className="text-gray-400 text-center py-20">Cargando menú…</p>
          ) : (
            <>
              {/* Header */}
              {show.header && (
                <div className="text-center mb-8 pb-6 border-b" style={{ borderColor: colors.border }}>
                  <h1 className="text-3xl font-bold mb-1" style={{ ...headingStyle, color: colors.catTitle }}>
                    {branding.restaurantName ?? ''}
                  </h1>
                  {branding.tagline && (
                    <p className="text-sm italic mt-1" style={{ color: colors.desc }}>{branding.tagline}</p>
                  )}
                  {footerAddress && (
                    <p className="text-xs mt-2" style={{ color: colors.desc }}>{footerAddress}</p>
                  )}
                  {branding.phone && (
                    <p className="text-xs" style={{ color: colors.desc }}>☎ {branding.phone}</p>
                  )}
                </div>
              )}

              {/* Categories */}
              {activeCats.map(cat => (
                <div key={cat.id} className="mb-8">
                  {/* Category title */}
                  <h2 className="text-xl font-bold mb-1 pb-2 border-b-2" style={{ ...headingStyle, color: colors.catTitle, borderColor: colors.border }}>
                    {cat.icon && <span className="mr-2">{cat.icon}</span>}
                    {locName(cat, locale)}
                  </h2>
                  {show.catDesc && locDesc(cat, locale) && (
                    <p className="text-sm italic mb-3" style={{ color: colors.desc }}>{locDesc(cat, locale)}</p>
                  )}

                  {/* Products */}
                  {cat.products?.map(item => (
                    <PrintItem
                      key={item.id} item={item} locale={locale} show={show}
                      colors={colors} headingStyle={headingStyle} lbl={lbl}
                    />
                  ))}

                  {/* Subcategories */}
                  {cat.subcategories?.map(sub => (
                    <div key={sub.id} className="mt-4">
                      <h3 className="text-base font-semibold mb-2 pl-2 border-l-2" style={{ ...headingStyle, color: colors.catTitle, borderColor: colors.border }}>
                        {locName(sub, locale)}
                      </h3>
                      {sub.products?.map(item => (
                        <PrintItem
                          key={item.id} item={item} locale={locale} show={show}
                          colors={colors} headingStyle={headingStyle} lbl={lbl}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ))}

              {/* Footer */}
              {show.footer && (
                <div className="text-center text-xs mt-8 pt-4 border-t" style={{ color: colors.desc, borderColor: colors.border }}>
                  {branding.restaurantName ?? ''}
                  {branding.establishedYear ? ` · Est. ${branding.establishedYear}` : ''}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── @media print styles ───────────────────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area { padding: 0 !important; }
          body { margin: 0; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  );
}

// ── PrintItem ─────────────────────────────────────────────────────────────────

interface QrItemLike {
  id: string;
  name: string;
  description?: string | null;
  price: string;
  halfPortionPrice?: string | null;
  quantity?: string | null;
  allergens?: string;
  isVegetariano?: boolean;
  isVegano?: boolean;
  isSinGluten?: boolean;
  isPicante?: boolean;
  translations?: Record<string, { name?: string; description?: string }>;
}

function PrintItem({ item, locale, show, colors, headingStyle, lbl }: {
  item: QrItemLike;
  locale: Locale;
  show: ShowElements;
  colors: PrintColors;
  headingStyle: React.CSSProperties;
  lbl: LabelSet;
}) {
  const allergenIds = parseAllergens(item.allergens).map(normalizeAllergenId);
  const tags: string[] = [];
  if (item.isVegetariano) tags.push('vegetariano');
  if (item.isVegano) tags.push('vegano');
  if (item.isSinGluten) tags.push('singluten');
  if (item.isPicante) tags.push('picante');

  const name = locName(item, locale);
  const desc = locDesc(item, locale);
  const price = Number(item.price);
  const halfPrice = item.halfPortionPrice ? Number(item.halfPortionPrice) : null;

  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b last:border-0" style={{ borderColor: colors.border }}>
      <div className="flex-1 min-w-0">
        {show.dishName && (
          <p className="font-medium text-sm" style={{ ...headingStyle, color: colors.itemName }}>{name}</p>
        )}
        {show.dishDesc && desc && (
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: colors.desc }}>{desc}</p>
        )}
        {show.quantity && item.quantity && (
          <p className="text-xs" style={{ color: colors.desc }}>{item.quantity}</p>
        )}
        {/* Tags */}
        {show.tags && tags.length > 0 && (
          <p className="text-xs mt-0.5" style={{ color: colors.desc }}>
            {tags.map(t => DIETARY_LABELS[t]?.[locale] ?? t).join(' · ')}
          </p>
        )}
        {/* Allergens */}
        {show.allergens && allergenIds.length > 0 && (
          <p className="text-xs mt-0.5" style={{ color: colors.desc }}>
            {allergenIds.map(id => {
              const icon = ALLERGEN_ICONS[id] ?? '';
              const label = ALLERGEN_LABELS[id]?.[locale] ?? id;
              return `${icon} ${label}`;
            }).join(' · ')}
          </p>
        )}
      </div>
      {/* Price */}
      {show.price && (
        <div className="text-right shrink-0">
          {halfPrice ? (
            <>
              <p className="text-xs" style={{ color: colors.price, opacity: 0.6 }}>{lbl.full}</p>
              <p className="font-semibold text-sm" style={{ ...headingStyle, color: colors.price }}>€{price.toFixed(2)}</p>
              {show.halfPortion && (
                <p className="text-xs" style={{ color: colors.price }}>{lbl.half} €{halfPrice.toFixed(2)}</p>
              )}
            </>
          ) : (
            <p className="font-semibold text-sm" style={{ ...headingStyle, color: colors.price }}>€{price.toFixed(2)}</p>
          )}
        </div>
      )}
    </div>
  );
}
