/**
 * /carta/categoria/:categoryId — Página de categoría QR
 * Fiel al original: header sticky, filtros, grid/list/compact, modal de detalle, subcategorías.
 */
import { useEffect, useState, useMemo } from 'react';
import { useLocation, useRoute } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Search, ChevronRight, X, ImageIcon } from 'lucide-react';
import { EU_ALLERGENS, parseAllergens } from '../lib/allergens';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ── Types ──────────────────────────────────────────────────────────────────────

interface PublicProduct {
  id: string;
  name: string;
  description?: string | null;
  price: string;
  allergens?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  outOfStock?: boolean;
  halfPortionPrice?: string | null;
  quantity?: string | null;
  isVegetariano?: boolean;
  isVegano?: boolean;
  isSinGluten?: boolean;
  isPicante?: boolean;
  subcategoryId?: string | null;
  translations?: Record<string, { name?: string; description?: string }>;
}

interface PublicSubcategory {
  id: string;
  name: string;
  sortOrder: number;
}

interface PublicCategory {
  id: string;
  name: string;
  products: PublicProduct[];
  subcategories?: PublicSubcategory[];
  translations?: Record<string, { name?: string; description?: string }>;
}

interface CardSettings {
  showImage: boolean;
  showDescription: boolean;
  showTags: boolean;
  showAllergens: boolean;
  showPrice: boolean;
  showHalfPortion: boolean;
  showQuantity: boolean;
  layout: 'grid' | 'list' | 'compact';
}

interface PublicBranding {
  restaurantName: string;
  themeColors: Record<string, string> | null;
  themeFonts: { heading?: string; body?: string } | null;
  cardSettings: Partial<CardSettings> | null;
  schedule: unknown[] | null;
}

const DIETARY_FILTERS = [
  { key: 'isVegetariano' as const, label: '🥦 Vegetariano' },
  { key: 'isVegano' as const,      label: '🌿 Vegano' },
  { key: 'isSinGluten' as const,  label: '🚫🌾 Sin gluten' },
  { key: 'isPicante' as const,    label: '🌶️ Picante' },
];
type DietaryKey = 'isVegetariano' | 'isVegano' | 'isSinGluten' | 'isPicante';

const SUPPORTED_LOCALES = ['es', 'en', 'fr', 'de', 'ca', 'it', 'nl', 'ro'] as const;
type Locale = typeof SUPPORTED_LOCALES[number];

function localeName(item: { name: string; translations?: Record<string, { name?: string }> }, locale: string) {
  if (locale === 'es') return item.name;
  return item.translations?.[locale]?.name || item.name;
}

function localeDescription(item: { description?: string | null; translations?: Record<string, { description?: string }> }, locale: string) {
  if (locale === 'es') return item.description;
  return item.translations?.[locale]?.description || item.description;
}

const TAG_STYLES: Record<DietaryKey, { bg: string; text: string; label: string }> = {
  isVegetariano: { bg: '#dcfce7', text: '#166534', label: '🥦 Vegetariano' },
  isVegano:      { bg: '#d1fae5', text: '#065f46', label: '🌿 Vegano' },
  isSinGluten:  { bg: '#fef9c3', text: '#854d0e', label: '🚫🌾 Sin gluten' },
  isPicante:    { bg: '#fee2e2', text: '#991b1b', label: '🌶️ Picante' },
};

// ── Item detail modal ──────────────────────────────────────────────────────────

function ItemModal({
  item,
  cs,
  locale,
  accentColor,
  headingFont,
  onClose,
}: {
  item: PublicProduct;
  cs: CardSettings;
  locale: string;
  accentColor: string;
  headingFont?: string;
  onClose: () => void;
}) {
  const name = localeName(item, locale);
  const desc = localeDescription(item, locale);
  const allergenIds = parseAllergens(item.allergens);
  const tags = Object.entries(TAG_STYLES).filter(([k]) => item[k as DietaryKey]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        className="relative w-full max-w-lg bg-white rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[85vh] flex flex-col"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {cs.showImage && item.imageUrl && (
          <div className="relative h-52 shrink-0">
            <img src={item.imageUrl} alt={name} className="w-full h-full object-cover" />
            <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto p-6 flex-1">
          {(!cs.showImage || !item.imageUrl) && (
            <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200">
              <X size={16} />
            </button>
          )}
          <h2 className="text-2xl font-semibold mb-2" style={{ fontFamily: headingFont }}>{name}</h2>
          {cs.showPrice && (
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xl font-bold" style={{ color: accentColor }}>€{Number(item.price).toFixed(2)}</span>
              {cs.showHalfPortion && item.halfPortionPrice && (
                <span className="text-sm text-gray-500">Media ración: €{Number(item.halfPortionPrice).toFixed(2)}</span>
              )}
            </div>
          )}
          {cs.showQuantity && item.quantity && (
            <p className="text-xs text-gray-400 mb-2">{item.quantity}</p>
          )}
          {cs.showDescription && desc && (
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">{desc}</p>
          )}
          {cs.showTags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {tags.map(([k, s]) => (
                <span key={k} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: s.bg, color: s.text }}>
                  {s.label}
                </span>
              ))}
            </div>
          )}
          {cs.showAllergens && allergenIds.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Alérgenos</p>
              <div className="flex flex-wrap gap-1.5">
                {allergenIds.map((id) => {
                  const meta = EU_ALLERGENS.find((a) => a.id === id);
                  if (!meta) return null;
                  return (
                    <span key={id} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      {meta.icon} {meta.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Menu item card ─────────────────────────────────────────────────────────────

function MenuItemCard({
  item,
  cs,
  locale,
  accentColor,
  headingFont,
  bodyFont,
  layout,
  index,
  onClick,
}: {
  item: PublicProduct;
  cs: CardSettings;
  locale: string;
  accentColor: string;
  headingFont?: string;
  bodyFont?: string;
  layout: 'grid' | 'list' | 'compact';
  index: number;
  onClick: () => void;
}) {
  const name = localeName(item, locale);
  const desc = localeDescription(item, locale);
  const allergenIds = parseAllergens(item.allergens);
  const tags = (['isVegetariano', 'isVegano', 'isSinGluten', 'isPicante'] as const).filter((k) => item[k]);

  if (layout === 'compact') {
    return (
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: index * 0.03 }}
        onClick={onClick}
        className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-gray-100 cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block" style={{ fontFamily: headingFont }}>{name}</span>
          {tags.length > 0 && cs.showTags && (
            <div className="flex gap-1 mt-0.5">
              {tags.map((k) => <span key={k} className="text-xs">{TAG_STYLES[k].label.split(' ')[0]}</span>)}
            </div>
          )}
        </div>
        {cs.showPrice && (
          <span className="text-sm font-semibold shrink-0" style={{ color: accentColor }}>€{Number(item.price).toFixed(2)}</span>
        )}
      </motion.button>
    );
  }

  if (layout === 'list') {
    return (
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.04 }}
        onClick={onClick}
        className="w-full text-left flex gap-3 rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow-md p-3 transition-shadow cursor-pointer"
      >
        {cs.showImage && item.imageUrl && (
          <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-gray-100">
            <img src={item.imageUrl} alt={name} className="w-full h-full object-cover" />
          </div>
        )}
        {cs.showImage && !item.imageUrl && (
          <div className="w-16 h-16 rounded-lg shrink-0 bg-gray-100 flex items-center justify-center">
            <ImageIcon size={20} className="text-gray-300" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold mb-0.5" style={{ fontFamily: headingFont }}>{name}</h3>
          {cs.showDescription && desc && (
            <p className="text-xs text-gray-500 line-clamp-2" style={{ fontFamily: bodyFont }}>{desc}</p>
          )}
          {cs.showTags && tags.length > 0 && (
            <div className="flex gap-1 mt-1">
              {tags.map((k) => (
                <span key={k} className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: TAG_STYLES[k].bg, color: TAG_STYLES[k].text }}>
                  {TAG_STYLES[k].label.split(' ')[0]}
                </span>
              ))}
            </div>
          )}
        </div>
        {cs.showPrice && (
          <div className="text-right shrink-0">
            <span className="text-sm font-bold" style={{ color: accentColor }}>€{Number(item.price).toFixed(2)}</span>
            {cs.showHalfPortion && item.halfPortionPrice && (
              <p className="text-xs text-gray-400">½ €{Number(item.halfPortionPrice).toFixed(2)}</p>
            )}
          </div>
        )}
      </motion.button>
    );
  }

  // Grid layout
  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md overflow-hidden cursor-pointer transition-shadow"
    >
      {cs.showImage && (
        <div className="h-40 bg-gray-100">
          {item.imageUrl
            ? <img src={item.imageUrl} alt={name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={32} className="text-gray-200" /></div>
          }
        </div>
      )}
      <div className="p-4">
        <h3 className="text-base font-semibold mb-1 leading-tight" style={{ fontFamily: headingFont }}>{name}</h3>
        {cs.showDescription && desc && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-2" style={{ fontFamily: bodyFont }}>{desc}</p>
        )}
        {cs.showTags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map((k) => (
              <span key={k} className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: TAG_STYLES[k].bg, color: TAG_STYLES[k].text }}>
                {TAG_STYLES[k].label}
              </span>
            ))}
          </div>
        )}
        {cs.showAllergens && allergenIds.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {allergenIds.map((id) => {
              const meta = EU_ALLERGENS.find((a) => a.id === id);
              return meta ? (
                <span key={id} title={meta.label} className="text-xs">{meta.icon}</span>
              ) : null;
            })}
          </div>
        )}
        <div className="flex items-center justify-between mt-auto">
          {cs.showPrice && (
            <span className="text-base font-bold" style={{ color: accentColor }}>€{Number(item.price).toFixed(2)}</span>
          )}
          {cs.showHalfPortion && item.halfPortionPrice && (
            <span className="text-xs text-gray-400">½ €{Number(item.halfPortionPrice).toFixed(2)}</span>
          )}
          <span className="text-xs" style={{ color: accentColor + '99' }}>Toca para detalles →</span>
        </div>
      </div>
    </motion.button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function CartaCategoria() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute(`${BASE}/carta/categoria/:categoryId`);
  const categoryId = params?.categoryId ?? '';

  const [categories, setCategories] = useState<PublicCategory[] | null>(null);
  const [branding, setBranding] = useState<PublicBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeAllergen, setActiveAllergen] = useState<string | null>(null);
  const [activeDiet, setActiveDiet] = useState<DietaryKey | null>(null);
  const [selectedItem, setSelectedItem] = useState<PublicProduct | null>(null);
  // Subcategory drill-down: null = show subcategory list (if any), string = show products of that subcat
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null);
  const [locale] = useState<Locale>(() => {
    const stored = localStorage.getItem('qr-locale');
    return (SUPPORTED_LOCALES.includes(stored as Locale) ? stored : 'es') as Locale;
  });

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/api/public/menu`).then((r) => r.json()),
      fetch(`${BASE}/api/public/branding`).then((r) => r.json()).catch(() => null),
    ]).then(([cats, brand]) => {
      setCategories(Array.isArray(cats) ? cats : []);
      setBranding(brand);
    }).finally(() => setLoading(false));
  }, []);

  const category = useMemo(() => categories?.find((c) => c.id === categoryId), [categories, categoryId]);

  const accentColor = branding?.themeColors?.accent ?? branding?.themeColors?.primary ?? '#c8963e';
  const headingFont = branding?.themeFonts?.heading ? `"${branding.themeFonts.heading}", serif` : undefined;
  const bodyFont = branding?.themeFonts?.body ? `"${branding.themeFonts.body}", sans-serif` : undefined;

  const csRaw = branding?.cardSettings;
  const cs: CardSettings = {
    showImage: csRaw?.showImage ?? true,
    showDescription: csRaw?.showDescription ?? true,
    showTags: csRaw?.showTags ?? true,
    showAllergens: csRaw?.showAllergens ?? true,
    showPrice: csRaw?.showPrice ?? true,
    showHalfPortion: csRaw?.showHalfPortion ?? true,
    showQuantity: csRaw?.showQuantity ?? true,
    layout: (csRaw?.layout as 'grid' | 'list' | 'compact') ?? 'grid',
  };

  // Subcategories from the category
  const subcats = useMemo(() => category?.subcategories ?? [], [category]);
  // Are we showing the subcategory list (not yet drilled in)?
  const isSubcatListView = subcats.length > 0 && selectedSubcategoryId === null;
  // Current subcategory name (when drilled in)
  const selectedSubcat = useMemo(
    () => subcats.find((s) => s.id === selectedSubcategoryId) ?? null,
    [subcats, selectedSubcategoryId],
  );

  const displayedItems = useMemo(() => {
    if (!category || isSubcatListView) return [];
    let items = [...(category.products ?? [])];
    // When drilled into a subcategory, only show its products
    if (selectedSubcategoryId) {
      items = items.filter((p) => p.subcategoryId === selectedSubcategoryId);
    }
    if (activeAllergen) {
      items = items.filter((p) => !parseAllergens(p.allergens).includes(activeAllergen));
    }
    if (activeDiet) {
      items = items.filter((p) => p[activeDiet]);
    }
    return items;
  }, [category, activeAllergen, activeDiet, selectedSubcategoryId, isSubcatListView]);

  const catName = category ? localeName(category, locale) : '';
  const hasFilters = activeAllergen || activeDiet;

  return (
    <div className="min-h-screen" style={{ background: branding?.themeColors?.background ?? '#faf8f4' }}>
      {/* ── Header ──────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => {
              if (selectedSubcategoryId) {
                // Go back to subcategory list
                setSelectedSubcategoryId(null);
                setActiveDiet(null);
                setActiveAllergen(null);
              } else {
                navigate(`${BASE}/carta`);
              }
            }}
            className="shrink-0 p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <ArrowLeft size={20} style={{ color: branding?.themeColors?.categoryCardText ?? '#8B1A1A' }} />
          </button>
          <h1
            className="text-xl font-semibold truncate flex-1 uppercase tracking-wide"
            style={{ fontFamily: headingFont, color: branding?.themeColors?.categoryCardText ?? '#8B1A1A' }}
          >
            {loading ? '…' : selectedSubcat ? selectedSubcat.name : catName}
          </h1>
        </div>

        {/* Dietary & allergen filters — only shown when viewing products, not the subcategory list */}
        {!isSubcatListView && (
          <>
            <div className="flex gap-2 px-4 pb-2 overflow-x-auto scrollbar-none">
              {DIETARY_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setActiveDiet((p) => p === f.key ? null : f.key)}
                  className="shrink-0 text-xs px-3 py-1 rounded-full border transition-all cursor-pointer font-medium"
                  style={activeDiet === f.key
                    ? { borderColor: '#1a1a1a', background: '#1a1a1a', color: '#fff' }
                    : { borderColor: '#d1d5db', color: '#6b7280' }
                  }
                >
                  {f.label}
                </button>
              ))}
              {hasFilters && (
                <button onClick={() => { setActiveDiet(null); setActiveAllergen(null); }}
                  className="shrink-0 text-xs px-3 py-1 rounded-full border cursor-pointer"
                  style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                  Borrar
                </button>
              )}
            </div>

            <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none border-t border-gray-100 pt-2">
              <span className="shrink-0 text-xs text-gray-500 font-semibold uppercase tracking-wider self-center mr-1">Contiene alérgenos:</span>
              {EU_ALLERGENS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setActiveAllergen((p) => p === a.id ? null : a.id)}
                  className="shrink-0 text-xs px-3 py-1 rounded-full border transition-all cursor-pointer font-medium gap-1 flex items-center"
                  style={activeAllergen === a.id
                    ? { borderColor: '#d97706', background: '#fef3c7', color: '#92400e' }
                    : { borderColor: '#d1d5db', color: '#6b7280' }
                  }
                >
                  <span>{a.icon}</span>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </header>

      {/* ── Items ───────────────────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-gray-200 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : isSubcatListView ? (
          /* ── Subcategory cards (same design as main category list) ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subcats.map((sub, i) => {
              const count = (category?.products ?? []).filter((p) => p.subcategoryId === sub.id).length;
              return (
                <motion.button
                  key={sub.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.07 }}
                  onClick={() => setSelectedSubcategoryId(sub.id)}
                  className="group text-left rounded-2xl border shadow-sm hover:shadow-md transition-all cursor-pointer p-5 flex items-center justify-between gap-4"
                  style={{
                    background: branding?.themeColors?.categoryCardBg ?? '#ffffff',
                    borderColor: branding?.themeColors?.categoryCardBorder ?? '#e5e7eb',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <h2
                      className="text-lg font-semibold truncate mb-0.5 tracking-wide uppercase"
                      style={{ fontFamily: headingFont, color: branding?.themeColors?.categoryCardText ?? '#8B1A1A' }}
                    >
                      {sub.name}
                    </h2>
                    {count > 0 && (
                      <p className="text-sm" style={{ color: (branding?.themeColors?.categoryCardText ?? '#8B1A1A') + '80' }}>
                        {count} {count === 1 ? 'plato' : 'platos'}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    className="w-5 h-5 shrink-0 transition-colors"
                    style={{ color: branding?.themeColors?.categoryArrowColor ?? '#15803d' }}
                  />
                </motion.button>
              );
            })}
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
            <Search size={32} className="opacity-30" />
            <p className="text-lg" style={{ fontFamily: headingFont }}>
              {hasFilters ? 'Ningún plato coincide con los filtros' : 'No hay platos disponibles'}
            </p>
            {hasFilters && (
              <button onClick={() => { setActiveDiet(null); setActiveAllergen(null); }}
                className="text-sm underline cursor-pointer">
                Borrar filtros
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeDiet}-${activeAllergen}-${selectedSubcategoryId}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              {(() => {
                const gridClass = cs.layout === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'
                  : cs.layout === 'list' ? 'flex flex-col gap-3'
                  : 'flex flex-col gap-1';

                return (
                  <div className={gridClass}>
                    {displayedItems.map((item, i) => (
                      <MenuItemCard
                        key={item.id}
                        item={item}
                        cs={cs}
                        locale={locale}
                        accentColor={accentColor}
                        headingFont={headingFont}
                        bodyFont={bodyFont}
                        layout={cs.layout}
                        index={i}
                        onClick={() => setSelectedItem(item)}
                      />
                    ))}
                  </div>
                );
              })()}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* ── Item detail modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedItem && (
          <ItemModal
            item={selectedItem}
            cs={cs}
            locale={locale}
            accentColor={accentColor}
            headingFont={headingFont}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
