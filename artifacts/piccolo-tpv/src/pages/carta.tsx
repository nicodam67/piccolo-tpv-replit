/**
 * /carta — Carta pública QR
 * Fiel al programa original: hero, grid de categorías, filtros alérgenos/etiquetas,
 * botones flotantes llamada + horario, selector de idioma, footer completo.
 * Conecta con /api/public/branding y /api/public/menu (sin auth requerida).
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Clock, ChevronRight, X, MapPin } from 'lucide-react';
import { EU_ALLERGENS, parseAllergens } from '../lib/allergens';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ── Types ──────────────────────────────────────────────────────────────────────

interface CartaProduct {
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
  translations?: Record<string, { name?: string; description?: string }>;
}

interface CartaCategory {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  products: CartaProduct[];
  translations?: Record<string, { name?: string; description?: string }>;
}

interface PublicBranding {
  restaurantName: string;
  tagline: string;
  heroImageUrl: string;
  heroVideoUrl: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  phone: string;
  establishedYear?: number | null;
  logoUrl: string;
  themeColors: Record<string, string> | null;
  themeFonts: { heading?: string; body?: string; headingColor?: string; bodyColor?: string } | null;
  cardSettings: {
    showImage?: boolean; showDescription?: boolean; showTags?: boolean;
    showAllergens?: boolean; showPrice?: boolean; showHalfPortion?: boolean;
    showQuantity?: boolean; layout?: string;
  } | null;
  schedule: Array<{
    day: string;
    shift1: { open: boolean; openTime: string; closeTime: string };
    shift2: { open: boolean; openTime: string; closeTime: string };
  }> | null;
}

const DIETARY_FILTERS = [
  { key: 'isVegetariano', label: '🥦 Vegetariano', id: 'vegetariano' },
  { key: 'isVegano',      label: '🌿 Vegano',       id: 'vegano' },
  { key: 'isSinGluten',  label: '🚫🌾 Sin gluten', id: 'singluten' },
  { key: 'isPicante',    label: '🌶️ Picante',      id: 'picante' },
] as const;
type DietaryKey = typeof DIETARY_FILTERS[number]['key'];

const SUPPORTED_LOCALES = ['es', 'en', 'fr', 'de', 'ca', 'it', 'nl', 'ro'] as const;
type Locale = typeof SUPPORTED_LOCALES[number];
const LOCALE_FLAG: Record<Locale, string> = {
  es: '🇪🇸', en: '🇬🇧', fr: '🇫🇷', de: '🇩🇪', ca: '🏴', it: '🇮🇹', nl: '🇳🇱', ro: '🇷🇴'
};

const DAY_LABELS: Record<string, string> = {
  monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves',
  friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo',
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves',
  fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
};

// ── Data helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

function localizeName(item: { name: string; translations?: Record<string, { name?: string; description?: string }> }, locale: string): string {
  if (locale === 'es') return item.name;
  return item.translations?.[locale]?.name || item.name;
}

// Default display font — loaded unconditionally so the carta looks right
// even before the admin has configured custom fonts.
const CARTA_DEFAULT_FONT = 'Cinzel';

function applyTheme(branding: PublicBranding) {
  const root = document.documentElement;
  const c = branding.themeColors ?? {};
  if (c.primary) root.style.setProperty('--color-qr-primary', c.primary);
  if (c.background) root.style.setProperty('--color-qr-bg', c.background);
  if (c.accent) root.style.setProperty('--color-qr-accent', c.accent);
  // Load Google Fonts
  const f = branding.themeFonts ?? {};
  if (f.heading && !f.heading.includes('__custom')) {
    loadFont(f.heading);
  }
  if (f.body && !f.body.includes('__custom')) {
    loadFont(f.body);
  }
}

// Ensure default display font is always loaded
loadFont(CARTA_DEFAULT_FONT);

function loadFont(name: string) {
  const id = `gf-${name.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@400;500;700&display=swap`;
  document.head.appendChild(link);
}

// ── Schedule modal ─────────────────────────────────────────────────────────────

function ScheduleModal({
  schedule,
  accentColor,
  onClose,
}: {
  schedule: PublicBranding['schedule'];
  accentColor: string;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <motion.div
          className="relative w-full max-w-sm bg-white rounded-t-3xl p-6 pb-10"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
              <Clock size={18} style={{ color: accentColor }} />
            </div>
            <h2 className="font-bold text-lg flex-1">Horario</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100">
              <X size={16} />
            </button>
          </div>
          {!schedule || schedule.length === 0 ? (
            <p className="text-sm text-gray-500">Sin horario publicado.</p>
          ) : (
            <div className="space-y-2">
              {schedule.map((entry) => {
                const dayLabel = DAY_LABELS[entry.day] ?? entry.day;
                const s1 = entry.shift1;
                const s2 = entry.shift2;
                return (
                  <div key={entry.day} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <span className="text-sm font-semibold">{dayLabel}</span>
                    <div className="text-right text-xs font-mono text-gray-600 space-y-0.5">
                      {s1.open ? <div>{s1.openTime} – {s1.closeTime}</div> : <div className="text-gray-400">Cerrado</div>}
                      {s2.open && <div className="text-gray-400">{s2.openTime} – {s2.closeTime}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Locale switcher ────────────────────────────────────────────────────────────

function LocaleSwitcher({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors"
      >
        <span>{LOCALE_FLAG[locale]}</span>
        <span className="uppercase">{locale}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 min-w-[130px]"
          >
            {SUPPORTED_LOCALES.map((l) => (
              <button
                key={l}
                onClick={() => { onChange(l); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors ${l === locale ? 'bg-gray-50 font-bold' : ''}`}
              >
                <span>{LOCALE_FLAG[l]}</span>
                <span className="capitalize">{l}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-gray-200 animate-pulse rounded-xl ${className ?? ''}`} />;
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Carta() {
  const [, navigate] = useLocation();
  const [categories, setCategories] = useState<CartaCategory[] | null>(null);
  const [branding, setBranding] = useState<PublicBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [configurationUnavailable, setConfigurationUnavailable] = useState(false);
  const [activeAllergen, setActiveAllergen] = useState<string | null>(null);
  const [activeDiet, setActiveDiet] = useState<DietaryKey | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>(() => {
    const stored = localStorage.getItem('qr-locale');
    return (SUPPORTED_LOCALES.includes(stored as Locale) ? stored : 'es') as Locale;
  });

  useEffect(() => {
    Promise.all([
      apiFetch<CartaCategory[]>('/api/public/menu'),
      apiFetch<PublicBranding>('/api/public/branding').catch(() => null),
    ]).then(([cats, brand]) => {
      setCategories(cats);
      if (brand) {
        setBranding(brand);
        applyTheme(brand);
      }
    }).catch(() => setConfigurationUnavailable(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem('qr-locale', locale);
  }, [locale]);

  const accentColor = branding?.themeColors?.accent ?? branding?.themeColors?.primary ?? '#8B1A1A';
  const headingFont = branding?.themeFonts?.heading
    ? `"${branding.themeFonts.heading}", "${CARTA_DEFAULT_FONT}", serif`
    : `"${CARTA_DEFAULT_FONT}", serif`;
  const bodyFont    = branding?.themeFonts?.body    ? `"${branding.themeFonts.body}", sans-serif` : undefined;

  const heroImageUrl = branding?.heroImageUrl || null;   // no fallback: evita flash de imagen placeholder
  const heroVideoUrl = branding?.heroVideoUrl || null;

  const sortedCategories = useMemo(() => {
    if (!categories) return [];
    return [...categories].sort((a, b) => 0);
  }, [categories]);

  function countItems(cat: CartaCategory): number {
    let items = cat.products ?? [];
    if (activeAllergen) {
      items = items.filter((p) => !parseAllergens(p.allergens).includes(activeAllergen));
    }
    if (activeDiet) {
      items = items.filter((p) => p[activeDiet]);
    }
    return items.length;
  }

  function goToCategory(catId: string) {
    const params = new URLSearchParams();
    if (activeAllergen) params.set('allergen', activeAllergen);
    if (activeDiet) params.set('diet', activeDiet);
    const qs = params.toString();
    navigate(`${BASE}/carta/categoria/${catId}${qs ? `?${qs}` : ''}`);
  }

  const hasFilters = activeAllergen || activeDiet;

  const footerAddress = [
    branding?.address,
    [branding?.postalCode, branding?.city].filter(Boolean).join(' '),
    [branding?.province, branding?.country].filter(Boolean).join(' · '),
  ].filter(Boolean).join(', ');

  const mapsUrl = footerAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(footerAddress)}`
    : null;

  if (configurationUnavailable) {
    return (
      <main className="min-h-screen grid place-items-center bg-[#faf8f4] p-8 text-center text-stone-800">
        <div>
          <h1 className="text-3xl font-bold mb-3">Carta no disponible</h1>
          <p>La carta todavía no está configurada. Contacta con el establecimiento.</p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: branding?.themeColors?.background ?? '#faf8f4' }}>
      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden" style={{ minHeight: 300 }}>
        {heroVideoUrl ? (
          <video
            src={heroVideoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'brightness(0.35)' }}
            autoPlay loop muted playsInline
          />
        ) : heroImageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImageUrl})`, filter: 'brightness(0.35)' }}
          />
        ) : (
          // Sin imagen configurada (o mientras carga el branding): fondo oscuro neutro
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(160deg, #1a0a0a 0%, #2d1515 100%)' }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center justify-center py-20 px-4 text-center">
          {/* Locale switcher */}
          <div className="absolute top-4 right-4">
            <LocaleSwitcher locale={locale} onChange={setLocale} />
          </div>
          {/* Established year */}
          {branding?.establishedYear && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-sm tracking-[0.25em] uppercase mb-3"
              style={{ fontFamily: headingFont, color: branding?.themeColors?.heroEstablishedColor ?? accentColor }}
            >
              Fund. {branding.establishedYear}
            </motion.p>
          )}
          {/* Restaurant name */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold text-balance mb-4 tracking-wide"
            style={{ fontFamily: headingFont, color: branding?.themeColors?.heroTitleColor ?? '#ffffff' }}
          >
            {loading ? '…' : (branding?.restaurantName || '')}
          </motion.h1>
          {/* Separator */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="h-px w-24 mx-auto mb-4"
            style={{ background: accentColor }}
          />
          {/* Tagline */}
          {branding?.tagline && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="text-lg max-w-md"
              style={{ fontFamily: bodyFont, fontWeight: 400, color: branding?.themeColors?.heroTaglineColor ?? 'rgba(255,255,255,0.7)' }}
            >
              {branding.tagline}
            </motion.p>
          )}
        </div>
      </header>

      {/* ── Sticky filters ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        {/* Dietary tags */}
        <div className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto scrollbar-none">
          {DIETARY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveDiet((prev) => prev === f.key ? null : f.key)}
              className="shrink-0 text-xs px-3 py-1 rounded-full border transition-all cursor-pointer font-medium"
              style={activeDiet === f.key
                ? { borderColor: '#1a1a1a', background: '#1a1a1a', color: '#ffffff' }
                : { borderColor: '#d1d5db', color: '#6b7280' }
              }
            >
              {f.label}
            </button>
          ))}
          {hasFilters && (
            <button
              onClick={() => { setActiveDiet(null); setActiveAllergen(null); }}
              className="shrink-0 text-xs px-3 py-1 rounded-full border transition-all cursor-pointer"
              style={{ borderColor: '#ef4444', color: '#ef4444' }}
            >
              Borrar filtros
            </button>
          )}
        </div>
        {/* Allergens */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none border-t border-gray-100 pt-2">
          <span className="shrink-0 text-xs text-gray-500 font-semibold uppercase tracking-wider self-center mr-1">
            Contiene alérgenos:
          </span>
          {EU_ALLERGENS.map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveAllergen((prev) => prev === a.id ? null : a.id)}
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
      </div>

      {/* ── Categories grid ────────────────────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-4 py-10">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : sortedCategories.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <p className="text-lg" style={{ fontFamily: headingFont }}>No hay categorías disponibles</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sortedCategories.map((cat, i) => {
              const displayName = localizeName(cat, locale);
              const count = countItems(cat);
              return (
                <motion.button
                  key={cat.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.07 }}
                  onClick={() => goToCategory(cat.id)}
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
                      {cat.icon && <span className="mr-2">{cat.icon}</span>}
                      {displayName}
                    </h2>
                    {count > 0 && hasFilters && (
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
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 py-10 text-center text-sm">
        <p className="font-medium mb-1" style={{ fontFamily: headingFont, color: branding?.themeColors?.infoTextColor ?? '#6b7280' }}>
          {branding?.restaurantName ?? ''}
        </p>
        {(branding?.address || branding?.city) && (
          <div className="mb-2 space-y-0.5" style={{ color: branding?.themeColors?.infoTextColor ?? '#6b7280' }}>
            {branding?.address && <p>{branding.address}</p>}
            {(branding?.postalCode || branding?.city) && (
              <p>{[branding?.postalCode, branding?.city].filter(Boolean).join(' ')}</p>
            )}
            {(branding?.province || branding?.country) && (
              <p>{[branding?.province, branding?.country].filter(Boolean).join(' · ')}</p>
            )}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: accentColor, color: '#ffffff' }}
              >
                <MapPin size={12} />
                Ver en Google Maps
              </a>
            )}
          </div>
        )}
        {branding?.phone && (
          <p className="mb-2" style={{ color: branding?.themeColors?.infoTextColor ?? '#6b7280' }}>
            <a href={`tel:${branding.phone}`} className="hover:underline">{branding.phone}</a>
          </p>
        )}
        <p className="mt-2 text-xs" style={{ color: '#9ca3af' }}>
          &copy; {new Date().getFullYear()} {branding?.restaurantName ?? ''}. Todos los derechos reservados.
        </p>
      </footer>

      {/* ── Floating call button ────────────────────────────────────────────────── */}
      {branding?.phone && (
        <a
          href={`tel:${branding.phone}`}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-sm font-medium cursor-pointer transition-transform hover:scale-105 active:scale-95"
          style={{
            background: branding?.themeColors?.callButtonBg ?? '#f59e0b',
            color: branding?.themeColors?.callButtonText ?? '#ffffff',
          }}
        >
          <Phone className="w-4 h-4" />
          <span>Llamar</span>
        </a>
      )}

      {/* ── Floating schedule button ────────────────────────────────────────────── */}
      {branding?.schedule && branding.schedule.length > 0 && (
        <button
          onClick={() => setScheduleOpen(true)}
          className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-sm font-medium cursor-pointer transition-transform hover:scale-105 active:scale-95"
          style={{
            background: branding?.themeColors?.scheduleButtonBg ?? '#f0ece4',
            color: branding?.themeColors?.scheduleButtonText ?? '#1a1a1a',
            border: '1px solid #e5e7eb',
          }}
        >
          <Clock className="w-4 h-4" />
          <span>Horario</span>
        </button>
      )}

      {/* ── Schedule modal ───────────────────────────────────────────────────────── */}
      {scheduleOpen && (
        <ScheduleModal
          schedule={branding?.schedule ?? null}
          accentColor={accentColor}
          onClose={() => setScheduleOpen(false)}
        />
      )}
    </div>
  );
}
