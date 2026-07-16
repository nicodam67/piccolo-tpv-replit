/**
 * QR Carta — public-facing menu page
 * Accessible without authentication at /carta
 * Full redesign: hero, 2-level nav, dietary filters, 3 layouts, detail modal,
 * floating buttons, opening-hours dialog. Animations via Framer Motion.
 */
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, X, Phone, Clock, ChevronDown, ChevronUp,
  LayoutGrid, LayoutList, AlignJustify, MapPin,
} from 'lucide-react';
import { EU_ALLERGENS, parseAllergens } from '../lib/allergens';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ── Types ─────────────────────────────────────────────────────────────────────

interface CartaFormat { id: string; name: string; price: string }
interface CartaProduct {
  id: string;
  name: string;
  description?: string | null;
  price: string;
  allergens?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  outOfStock?: boolean;
  formats?: CartaFormat[];
  halfPortionPrice?: string | null;
  quantity?: string | null;
  isVegetariano?: boolean;
  isVegano?: boolean;
  isSinGluten?: boolean;
  isPicante?: boolean;
}
interface CartaCategory {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  products: CartaProduct[];
}
interface Branding {
  nombreComercial: string;
  tagline: string;
  heroImageUrl: string;
  heroVideoUrl: string;
  address: string;
  phone: string;
  foundedYear?: number | null;
  openingHours?: Record<string, { open: string; close: string; open2?: string; close2?: string }> | null;
  cardLayout: string;
  accentColor: string;
  logoUrl: string;
}

type Layout = 'grid' | 'list' | 'compact';

const DAY_LABELS: Record<string, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves',
  fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
};
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchMenu(): Promise<CartaCategory[]> {
  const res = await fetch(`${BASE}/api/public/menu`);
  if (!res.ok) throw new Error('Error cargando la carta');
  return res.json();
}

async function fetchBranding(): Promise<Branding> {
  const res = await fetch(`${BASE}/api/public/branding`);
  if (!res.ok) return { nombreComercial: '', tagline: '', heroImageUrl: '', heroVideoUrl: '', address: '', phone: '', cardLayout: 'grid', accentColor: '#ef4444', logoUrl: '' };
  return res.json();
}

// ── Dietary filter pills ──────────────────────────────────────────────────────

const DIETARY_FILTERS = [
  { key: 'isVegetariano', label: '🥦 Vegetariano' },
  { key: 'isVegano', label: '🌿 Vegano' },
  { key: 'isSinGluten', label: '🚫🌾 Sin gluten' },
  { key: 'isPicante', label: '🌶️ Picante' },
] as const;
type DietaryKey = typeof DIETARY_FILTERS[number]['key'];

// ── Opening hours dialog ──────────────────────────────────────────────────────

function ScheduleDialog({ branding, accentColor, onClose }: { branding: Branding; accentColor: string; onClose: () => void }) {
  const hours = branding.openingHours;
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
          className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-t-3xl p-6 pb-10"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
              <Clock size={18} style={{ color: accentColor }} />
            </div>
            <h2 className="font-black text-lg">Horario de apertura</h2>
            <button onClick={onClose} className="ml-auto w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800">
              <X size={16} />
            </button>
          </div>
          {!hours || Object.keys(hours).length === 0 ? (
            <p className="text-sm text-gray-500">Sin horario publicado.</p>
          ) : (
            <div className="space-y-2">
              {DAY_ORDER.map(day => {
                const slot = hours[day];
                if (!slot) return (
                  <div key={day} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-zinc-800">
                    <span className="text-sm font-semibold text-gray-500">{DAY_LABELS[day]}</span>
                    <span className="text-xs text-gray-400">Cerrado</span>
                  </div>
                );
                return (
                  <div key={day} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-zinc-800">
                    <span className="text-sm font-semibold">{DAY_LABELS[day]}</span>
                    <div className="text-right">
                      <div className="text-xs font-mono">{slot.open} – {slot.close}</div>
                      {slot.open2 && <div className="text-xs font-mono text-gray-500">{slot.open2} – {slot.close2}</div>}
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

// ── Item detail bottom-sheet ──────────────────────────────────────────────────

function ItemDetailModal({ product: p, accentColor, onClose }: {
  product: CartaProduct; accentColor: string; onClose: () => void;
}) {
  const allergenCodes = parseAllergens(p.allergens);

  const dietTags = [
    p.isVegetariano && { label: '🥦 Vegetariano', color: '#22c55e' },
    p.isVegano && { label: '🌿 Vegano', color: '#16a34a' },
    p.isSinGluten && { label: '🚫🌾 Sin gluten', color: '#ca8a04' },
    p.isPicante && { label: '🌶️ Picante', color: '#ef4444' },
  ].filter(Boolean) as { label: string; color: string }[];

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
          className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl overflow-hidden max-h-[90vh] flex flex-col"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.3 }}
          onDragEnd={(_e, info) => { if (info.offset.y > 120) onClose(); }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-zinc-700" />
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-xl bg-black/20 text-white hover:bg-black/40"
          >
            <X size={14} />
          </button>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            {/* Hero image */}
            {(p.imageUrl || p.videoUrl) && (
              <div className="w-full aspect-video bg-gray-100 dark:bg-zinc-800 overflow-hidden">
                {p.videoUrl ? (
                  <video src={p.videoUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
                ) : (
                  <img src={p.imageUrl!} alt={p.name} className="w-full h-full object-cover" />
                )}
              </div>
            )}

            <div className="p-5 pb-10 space-y-4">
              {/* Name + price */}
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-black text-xl leading-tight flex-1">{p.name}</h2>
                <div className="text-right shrink-0">
                  <div className="font-black text-xl" style={{ color: accentColor }}>
                    {p.formats && p.formats.length > 0
                      ? `desde ${Math.min(...p.formats.map(f => parseFloat(f.price))).toFixed(2)}€`
                      : `${parseFloat(p.price).toFixed(2)}€`
                    }
                  </div>
                  {p.halfPortionPrice && (
                    <div className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                      Media ración: {parseFloat(p.halfPortionPrice).toFixed(2)}€
                    </div>
                  )}
                </div>
              </div>

              {/* Quantity / volume */}
              {p.quantity && (
                <p className="text-sm text-gray-500 dark:text-zinc-400 font-medium">{p.quantity}</p>
              )}

              {/* Out of stock */}
              {p.outOfStock && (
                <span className="inline-block text-xs font-black text-red-500 uppercase tracking-widest">⛔ Agotado</span>
              )}

              {/* Description */}
              {p.description && (
                <p className="text-sm text-gray-600 dark:text-zinc-300 leading-relaxed">{p.description}</p>
              )}

              {/* Formats */}
              {p.formats && p.formats.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-2">Formatos</p>
                  <div className="flex flex-wrap gap-2">
                    {p.formats.map(f => (
                      <div key={f.id} className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-zinc-800 text-sm">
                        <span className="font-semibold">{f.name}</span>
                        <span className="text-gray-500 dark:text-zinc-400 ml-1.5">{parseFloat(f.price).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dietary tags */}
              {dietTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {dietTags.map(t => (
                    <span key={t.label} className="px-3 py-1 rounded-full text-xs font-bold border"
                      style={{ color: t.color, borderColor: `${t.color}40`, backgroundColor: `${t.color}10` }}>
                      {t.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Allergens */}
              {allergenCodes.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-2">Alérgenos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allergenCodes.map(code => {
                      const a = EU_ALLERGENS.find(x => x.code === code)!;
                      return (
                        <span key={code} title={a.label}
                          className="font-black px-2 py-1 rounded-lg text-xs"
                          style={{ color: a.color, background: a.bg, border: `1px solid ${a.color}40` }}>
                          {a.short} {a.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Product card — 3 layouts ──────────────────────────────────────────────────

function ProductCard({ product: p, layout, accentColor, onOpen, excluded }: {
  product: CartaProduct;
  layout: Layout;
  accentColor: string;
  onOpen: () => void;
  excluded: boolean;
}) {
  const allergenCodes = parseAllergens(p.allergens);

  if (excluded) return null;

  const dietBadges = [
    p.isVegetariano && '🥦',
    p.isVegano && '🌿',
    p.isSinGluten && '🌾',
    p.isPicante && '🌶️',
  ].filter(Boolean);

  const priceStr = p.formats && p.formats.length > 0
    ? `desde ${Math.min(...p.formats.map(f => parseFloat(f.price))).toFixed(2)}€`
    : `${parseFloat(p.price).toFixed(2)}€`;

  if (layout === 'compact') {
    return (
      <motion.button
        onClick={onOpen}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-zinc-800 text-left hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors ${p.outOfStock ? 'opacity-50' : ''}`}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate">{p.name}</span>
            {dietBadges.map((b, i) => <span key={i} className="text-xs">{b}</span>)}
          </div>
          {p.quantity && <span className="text-[11px] text-gray-400">{p.quantity}</span>}
        </div>
        <div className="shrink-0 text-right">
          <span className="font-black text-sm" style={{ color: accentColor }}>{priceStr}</span>
          {p.halfPortionPrice && (
            <div className="text-[10px] text-gray-400">½ {parseFloat(p.halfPortionPrice).toFixed(2)}€</div>
          )}
        </div>
      </motion.button>
    );
  }

  if (layout === 'list') {
    return (
      <motion.button
        onClick={onOpen}
        className={`w-full flex gap-3 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 text-left hover:shadow-md transition-all ${p.outOfStock ? 'opacity-50' : ''}`}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
      >
        {p.imageUrl && (
          <img src={p.imageUrl} alt={p.name}
            className="w-20 h-20 rounded-xl object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-sm leading-tight">{p.name}</h3>
              {p.quantity && <span className="text-[11px] text-gray-400">{p.quantity}</span>}
              {p.description && (
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{p.description}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <span className="font-black text-base" style={{ color: accentColor }}>{priceStr}</span>
              {p.halfPortionPrice && (
                <div className="text-[10px] text-gray-400">½ {parseFloat(p.halfPortionPrice).toFixed(2)}€</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {dietBadges.map((b, i) => <span key={i} className="text-xs">{b}</span>)}
            {allergenCodes.slice(0, 4).map(code => {
              const a = EU_ALLERGENS.find(x => x.code === code)!;
              return (
                <span key={code} title={a.label}
                  className="font-black px-1.5 py-0.5 rounded text-[9px]"
                  style={{ color: a.color, background: a.bg }}>
                  {a.short}
                </span>
              );
            })}
          </div>
        </div>
      </motion.button>
    );
  }

  // Grid layout (default)
  return (
    <motion.button
      onClick={onOpen}
      className={`flex flex-col bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-zinc-800 text-left hover:shadow-lg transition-all ${p.outOfStock ? 'opacity-50' : ''}`}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
    >
      {p.imageUrl ? (
        <div className="aspect-video w-full overflow-hidden bg-gray-100 dark:bg-zinc-800">
          <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-video w-full bg-gradient-to-br from-gray-100 to-gray-50 dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center">
          <span className="text-3xl opacity-30">🍽</span>
        </div>
      )}
      <div className="p-3 flex-1 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-1">
          <h3 className="font-bold text-sm leading-tight flex-1">{p.name}</h3>
          <div className="shrink-0 text-right">
            <div className="font-black text-sm" style={{ color: accentColor }}>{priceStr}</div>
            {p.halfPortionPrice && (
              <div className="text-[10px] text-gray-400">½ {parseFloat(p.halfPortionPrice).toFixed(2)}€</div>
            )}
          </div>
        </div>
        {p.quantity && <span className="text-[10px] text-gray-400">{p.quantity}</span>}
        {p.description && (
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">{p.description}</p>
        )}
        <div className="flex items-center gap-1.5 mt-auto pt-1 flex-wrap">
          {dietBadges.map((b, i) => <span key={i} className="text-xs">{b}</span>)}
          {allergenCodes.slice(0, 3).map(code => {
            const a = EU_ALLERGENS.find(x => x.code === code)!;
            return (
              <span key={code} title={a.label}
                className="font-black px-1 py-0.5 rounded text-[9px]"
                style={{ color: a.color, background: a.bg }}>
                {a.short}
              </span>
            );
          })}
        </div>
      </div>
    </motion.button>
  );
}

// ── Category grid card ────────────────────────────────────────────────────────

function CategoryCard({ cat, onClick, accentColor }: {
  cat: CartaCategory; onClick: () => void; accentColor: string;
}) {
  const bg = cat.color ?? accentColor;
  return (
    <motion.button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl text-white text-center aspect-square shadow-lg"
      style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg})` }}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.96 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {cat.icon && <span className="text-3xl leading-none">{cat.icon}</span>}
      <span className="font-black text-sm leading-tight drop-shadow">{cat.name}</span>
      <span className="text-[11px] opacity-75">{cat.products.length} platos</span>
    </motion.button>
  );
}

// ── Hero section ──────────────────────────────────────────────────────────────

function Hero({ branding }: { branding: Branding }) {
  const { nombreComercial, tagline, heroImageUrl, heroVideoUrl, foundedYear, accentColor } = branding;

  return (
    <div className="relative w-full min-h-[55vw] max-h-[400px] overflow-hidden flex items-end">
      {/* Background media */}
      {heroVideoUrl ? (
        <video
          src={heroVideoUrl}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay muted loop playsInline
        />
      ) : heroImageUrl ? (
        <img src={heroImageUrl} alt={nombreComercial}
          className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accentColor}80, ${accentColor})` }} />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

      {/* Content */}
      <div className="relative px-5 pb-6 pt-16 w-full">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {nombreComercial && (
            <h1 className="text-white font-black text-2xl sm:text-3xl leading-tight drop-shadow-lg">
              {nombreComercial}
            </h1>
          )}
          {tagline && (
            <p className="text-white/85 text-sm mt-1 font-medium drop-shadow">
              {tagline}
            </p>
          )}
          {foundedYear && (
            <p className="text-white/50 text-[11px] mt-0.5 font-mono">
              Desde {foundedYear}
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// ── Allergen exclusion dropdown ───────────────────────────────────────────────

function AllergenFilter({ excluded, onToggle }: {
  excluded: Set<string>;
  onToggle: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = excluded.size;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${count > 0 ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border-transparent'}`}
      >
        🚫 Alérgenos{count > 0 ? ` (${count})` : ''}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute top-full left-0 mt-2 z-30 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-2xl p-3 min-w-[220px]"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-2 px-1">
              Ocultar platos que contienen:
            </p>
            <div className="grid grid-cols-2 gap-1">
              {EU_ALLERGENS.map(a => (
                <button
                  key={a.code}
                  onClick={() => onToggle(a.code)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-xs transition-all ${excluded.has(a.code) ? 'font-black' : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
                  style={excluded.has(a.code) ? { color: a.color, background: a.bg } : {}}
                >
                  <span className="font-black px-1 py-0.5 rounded text-[9px]"
                    style={{ color: a.color, background: a.bg }}>{a.short}</span>
                  <span className="truncate">{a.label}</span>
                </button>
              ))}
            </div>
            {count > 0 && (
              <button
                onClick={() => EU_ALLERGENS.forEach(a => excluded.has(a.code) && onToggle(a.code))}
                className="mt-2 w-full text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 text-center"
              >
                Limpiar filtros
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Footer contact ────────────────────────────────────────────────────────────

function ContactFooter({ branding }: { branding: Branding }) {
  if (!branding.address && !branding.phone) return null;
  return (
    <div className="mt-8 py-6 px-4 bg-gray-50 dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 space-y-2">
      {branding.address && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(branding.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <MapPin size={14} />
          {branding.address}
        </a>
      )}
      {branding.phone && (
        <a
          href={`tel:${branding.phone}`}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <Phone size={14} />
          {branding.phone}
        </a>
      )}
      <p className="text-[10px] text-gray-400 dark:text-zinc-600 pt-2">
        Alérgenos según Regl. UE 1169/2011 · {branding.nombreComercial || 'Restaurante'}
        {branding.foundedYear ? ` © ${branding.foundedYear}` : ''}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CartaPage() {
  const [menu, setMenu] = useState<CartaCategory[]>([]);
  const [branding, setBranding] = useState<Branding>({
    nombreComercial: '', tagline: '', heroImageUrl: '', heroVideoUrl: '',
    address: '', phone: '', cardLayout: 'grid', accentColor: '#ef4444', logoUrl: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Navigation: null = category index, string = category id
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Layout: from branding on first load, user can override; persists across bg refreshes
  const [layout, setLayout] = useState<Layout>('grid');
  const layoutInitialised = useRef(false);

  // Dietary filters
  const [dietFilter, setDietFilter] = useState<DietaryKey | null>(null);

  // Allergen exclusion
  const [excludedAllergens, setExcludedAllergens] = useState<Set<string>>(new Set());
  const toggleAllergen = useCallback((code: string) => {
    setExcludedAllergens(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }, []);

  // Modals
  const [selectedProduct, setSelectedProduct] = useState<CartaProduct | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = (initial: boolean) => {
      if (initial) setLoading(true);
      Promise.all([fetchMenu(), fetchBranding()])
        .then(([menuData, brandingData]) => {
          if (cancelled) return;
          setMenu(menuData);
          setBranding(brandingData);
          // Only set layout from branding on first load; preserve any user override on refresh
          if (!layoutInitialised.current) {
            setLayout((brandingData.cardLayout as Layout) ?? 'grid');
            layoutInitialised.current = true;
          }
        })
        .catch(e => { if (!cancelled && initial) setError(e.message); })
        .finally(() => { if (!cancelled && initial) setLoading(false); });
    };
    load(true);
    const interval = setInterval(() => load(false), 5 * 60 * 1000);
    const onVisibility = () => { if (!document.hidden) load(false); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; clearInterval(interval); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  const accentColor = branding.accentColor ?? '#ef4444';

  // Active category products filtered
  const activeData = activeCategory ? menu.find(c => c.id === activeCategory) ?? null : null;

  const filteredProducts = useMemo(() => {
    if (!activeData) return [];
    return activeData.products.filter(p => {
      // Dietary filter
      if (dietFilter && !(p as any)[dietFilter]) return false;
      // Allergen exclusion
      if (excludedAllergens.size > 0) {
        const codes = parseAllergens(p.allergens);
        if (codes.some(c => excludedAllergens.has(c))) return false;
      }
      return true;
    });
  }, [activeData, dietFilter, excludedAllergens]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
        <motion.div
          className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-700"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  const LAYOUT_OPTS: { value: Layout; icon: React.ReactNode; label: string }[] = [
    { value: 'grid', icon: <LayoutGrid size={14} />, label: 'Grid' },
    { value: 'list', icon: <LayoutList size={14} />, label: 'Lista' },
    { value: 'compact', icon: <AlignJustify size={14} />, label: 'Compacto' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-white">
      {/* Hero */}
      <Hero branding={branding} />

      {/* ── Category index view ── */}
      <AnimatePresence mode="wait">
        {!activeCategory && (
          <motion.div
            key="index"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            <div className="px-4 pt-6 pb-4">
              <h2 className="font-black text-lg mb-1">Nuestra Carta</h2>
              <p className="text-sm text-gray-500 dark:text-zinc-400">Elige una categoría</p>
            </div>

            {/* Category grid */}
            <div className="px-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {menu.map((cat, i) => (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <CategoryCard cat={cat} onClick={() => setActiveCategory(cat.id)} accentColor={accentColor} />
                </motion.div>
              ))}
            </div>

            <ContactFooter branding={branding} />
          </motion.div>
        )}

        {/* ── Category detail view ── */}
        {activeCategory && activeData && (
          <motion.div
            key={`cat-${activeCategory}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.25 }}
          >
            {/* Category top bar */}
            <div className="sticky top-0 z-20 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => { setActiveCategory(null); setDietFilter(null); }}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <ArrowLeft size={15} />
                </button>
                {activeData.icon && <span className="text-xl">{activeData.icon}</span>}
                <h2 className="font-black text-base flex-1 truncate">{activeData.name}</h2>

                {/* Layout selector */}
                <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-zinc-800 rounded-xl p-0.5">
                  {LAYOUT_OPTS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setLayout(opt.value)}
                      title={opt.label}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${layout === opt.value ? 'bg-white dark:bg-zinc-700 shadow text-gray-900 dark:text-white' : 'text-gray-400 dark:text-zinc-500'}`}
                    >
                      {opt.icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dietary + allergen filters */}
              <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
                {DIETARY_FILTERS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setDietFilter(prev => prev === f.key ? null : f.key)}
                    className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${dietFilter === f.key ? 'bg-primary/15 text-primary border-primary/30 dark:bg-white/10 dark:text-white dark:border-white/30' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border-transparent'}`}
                    style={dietFilter === f.key ? { backgroundColor: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}40` } : {}}
                  >
                    {f.label}
                  </button>
                ))}
                <AllergenFilter excluded={excludedAllergens} onToggle={toggleAllergen} />
              </div>
            </div>

            {/* Product list */}
            <div className={`px-4 py-4 ${layout === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 gap-3' : layout === 'list' ? 'space-y-3' : ''}`}>
              {filteredProducts.length === 0 && (
                <div className={`py-16 text-center text-gray-400 dark:text-zinc-500 ${layout === 'grid' ? 'col-span-full' : ''}`}>
                  <p className="text-sm">No hay platos que coincidan con los filtros activos.</p>
                  <button
                    onClick={() => { setDietFilter(null); setExcludedAllergens(new Set()); }}
                    className="mt-2 text-xs underline"
                    style={{ color: accentColor }}
                  >
                    Limpiar filtros
                  </button>
                </div>
              )}
              {filteredProducts.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <ProductCard
                    product={p}
                    layout={layout}
                    accentColor={accentColor}
                    onOpen={() => setSelectedProduct(p)}
                    excluded={false}
                  />
                </motion.div>
              ))}
            </div>

            <ContactFooter branding={branding} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating action buttons ── */}
      <div className="fixed bottom-6 right-4 flex flex-col gap-3 z-30">
        {branding.openingHours && Object.keys(branding.openingHours).length > 0 && (
          <motion.button
            onClick={() => setShowSchedule(true)}
            className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center text-white"
            style={{ backgroundColor: accentColor }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.93 }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.8, type: 'spring' }}
            title="Horario"
          >
            <Clock size={20} />
          </motion.button>
        )}
        {branding.phone && (
          <motion.a
            href={`tel:${branding.phone}`}
            className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center text-white"
            style={{ backgroundColor: '#22c55e' }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.93 }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.9, type: 'spring' }}
            title="Llamar"
          >
            <Phone size={20} />
          </motion.a>
        )}
      </div>

      {/* ── Item detail modal ── */}
      <AnimatePresence>
        {selectedProduct && (
          <ItemDetailModal
            product={selectedProduct}
            accentColor={accentColor}
            onClose={() => setSelectedProduct(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Schedule dialog ── */}
      <AnimatePresence>
        {showSchedule && (
          <ScheduleDialog
            branding={branding}
            accentColor={accentColor}
            onClose={() => setShowSchedule(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
