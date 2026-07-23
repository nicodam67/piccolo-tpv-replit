/**
 * /menu — Public customer-facing menu page with QR table session support.
 *
 * URL patterns:
 *   /menu                    — Browse-only (no ordering until a delivery type is chosen)
 *   /menu?token=SESSION_TOKEN — Table QR scan: enables dine-in ordering for that table
 *
 * Features vs /carta:
 *   - Table session validation + dine-in order type
 *   - Tip selection
 *   - Payment intent flow (Stripe or simulator)
 *   - Server-side cart persistence
 *   - Real-time out-of-stock refresh via WebSocket
 */
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  ArrowLeft, X, Phone, Clock, ChevronDown, ChevronUp,
  LayoutGrid, LayoutList, AlignJustify, MapPin, Plus,
  ShoppingBag, Minus, Trash2, ArrowRight, CreditCard, Banknote,
  CheckCircle, Loader2, QrCode,
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
  accentColor: string;
  logoUrl: string;
}
interface TableSession {
  id: string;
  tableLabel: string;
  zoneLabel: string;
  token: string;
  status: string;
  expiresAt: string;
}
interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  formatId?: string;
  formatName?: string;
  notes?: string;
  image?: string;
}
interface OnlineConfig {
  takeawayEnabled: boolean;
  deliveryEnabled: boolean;
  tableOrderingEnabled: boolean;
  prepTimeMinutes: number;
  minOrder: string;
  deliveryFee: string;
  freeDeliveryFrom?: string | null;
  maxAdvanceHours: number;
  paused: boolean;
  pauseReason: string;
  tipEnabled: boolean;
  tipPercentages: number[];
  stripePublishableKey?: string;
}

type Layout = 'grid' | 'list' | 'compact';
type Step = 'cart' | 'type' | 'details' | 'tip' | 'payment' | 'success';

const DAY_LABELS: Record<string, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves',
  fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
};
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DIETARY_FILTERS = [
  { key: 'isVegetariano', label: '🥦 Vegetariano' },
  { key: 'isVegano', label: '🌿 Vegano' },
  { key: 'isSinGluten', label: '🚫🌾 Sin gluten' },
  { key: 'isPicante', label: '🌶️ Picante' },
] as const;
type DietaryKey = typeof DIETARY_FILTERS[number]['key'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function cartTotal(cart: CartItem[]) {
  return cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}

function useSearchParam(key: string): string | null {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  return useMemo(() => new URLSearchParams(search).get(key), [search]);
}

// ── ItemDetailModal ───────────────────────────────────────────────────────────

function ItemDetailModal({ product: p, accentColor, onClose, onAddToCart }: {
  product: CartaProduct; accentColor: string; onClose: () => void;
  onAddToCart?: (product: CartaProduct, formatId?: string, formatName?: string) => void;
}) {
  const [selectedFormat, setSelectedFormat] = useState<CartaFormat | null>(
    p.formats && p.formats.length > 0 ? p.formats[0] : null
  );
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    if (!onAddToCart) return;
    onAddToCart(p, selectedFormat?.id, selectedFormat?.name);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };
  const allergenCodes = parseAllergens(p.allergens);

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-end justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <motion.div
          className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl overflow-hidden max-h-[90vh] flex flex-col"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.3 }}
          onDragEnd={(_e, info) => { if (info.offset.y > 120) onClose(); }}
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-zinc-700" />
          </div>
          <button onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-xl bg-black/20 text-white hover:bg-black/40">
            <X size={14} />
          </button>

          <div className="flex-1 overflow-y-auto">
            {(p.imageUrl || p.videoUrl) && (
              <div className="w-full aspect-video bg-gray-100 dark:bg-zinc-800 overflow-hidden">
                {p.videoUrl
                  ? <video src={p.videoUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
                  : <img src={p.imageUrl!} alt={p.name} className="w-full h-full object-cover" />}
              </div>
            )}
            <div className="p-5 pb-10 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-black text-xl leading-tight flex-1">{p.name}</h2>
                <div className="text-right shrink-0">
                  <div className="font-black text-xl" style={{ color: accentColor }}>
                    {p.formats && p.formats.length > 0
                      ? `desde ${Math.min(...p.formats.map(f => parseFloat(f.price))).toFixed(2)}€`
                      : `${parseFloat(p.price).toFixed(2)}€`}
                  </div>
                  {p.halfPortionPrice && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      Media ración: {parseFloat(p.halfPortionPrice).toFixed(2)}€
                    </div>
                  )}
                </div>
              </div>

              {p.quantity && <p className="text-sm text-gray-500 font-medium">{p.quantity}</p>}
              {p.outOfStock && <span className="inline-block text-xs font-black text-red-500 uppercase tracking-widest">⛔ Agotado</span>}
              {p.description && <p className="text-sm text-gray-600 dark:text-zinc-300 leading-relaxed">{p.description}</p>}

              {p.formats && p.formats.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Formatos</p>
                  <div className="flex flex-wrap gap-2">
                    {p.formats.map(f => (
                      <button key={f.id} onClick={() => setSelectedFormat(f)}
                        className={`px-3 py-1.5 rounded-xl text-sm transition-all ${selectedFormat?.id === f.id ? '' : 'bg-gray-100 dark:bg-zinc-800'}`}
                        style={selectedFormat?.id === f.id
                          ? { backgroundColor: `${accentColor}20`, color: accentColor, outline: `2px solid ${accentColor}` }
                          : {}}>
                        <span className="font-semibold">{f.name}</span>
                        <span className="text-gray-500 ml-1.5">{parseFloat(f.price).toFixed(2)}€</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {allergenCodes.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Alérgenos</p>
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

              {onAddToCart && !p.outOfStock && (
                <button onClick={handleAdd}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white text-base transition-all"
                  style={{ backgroundColor: added ? '#22c55e' : accentColor }}>
                  {added
                    ? <><span>✓</span> Añadido</>
                    : <><Plus size={18} /> Añadir
                      {selectedFormat ? ` — ${parseFloat(selectedFormat.price).toFixed(2)}€` : ` — ${parseFloat(p.price).toFixed(2)}€`}
                    </>}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── ProductCard ───────────────────────────────────────────────────────────────

function ProductCard({ product: p, layout, accentColor, onOpen, excluded }: {
  product: CartaProduct; layout: Layout; accentColor: string; onOpen: () => void; excluded: boolean;
}) {
  if (excluded) return null;
  const allergenCodes = parseAllergens(p.allergens);
  const dietBadges = [
    p.isVegetariano && '🥦', p.isVegano && '🌿',
    p.isSinGluten && '🌾', p.isPicante && '🌶️',
  ].filter(Boolean);
  const priceStr = p.formats && p.formats.length > 0
    ? `desde ${Math.min(...p.formats.map(f => parseFloat(f.price))).toFixed(2)}€`
    : `${parseFloat(p.price).toFixed(2)}€`;

  if (layout === 'compact') {
    return (
      <motion.button onClick={onOpen}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-zinc-800 text-left hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors ${p.outOfStock ? 'opacity-50' : ''}`}
        whileTap={{ scale: 0.98 }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate">{p.name}</span>
            {dietBadges.map((b, i) => <span key={i} className="text-xs">{b}</span>)}
          </div>
        </div>
        <span className="font-black text-sm shrink-0" style={{ color: accentColor }}>{priceStr}</span>
      </motion.button>
    );
  }

  if (layout === 'list') {
    return (
      <motion.button onClick={onOpen}
        className={`w-full flex gap-3 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 text-left hover:shadow-md transition-all ${p.outOfStock ? 'opacity-50' : ''}`}
        whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}>
        {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-20 h-20 rounded-xl object-cover shrink-0" />}
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-sm leading-tight">{p.name}</h3>
              {p.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.description}</p>}
            </div>
            <span className="font-black text-base shrink-0" style={{ color: accentColor }}>{priceStr}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {dietBadges.map((b, i) => <span key={i} className="text-xs">{b}</span>)}
            {allergenCodes.slice(0, 4).map(code => {
              const a = EU_ALLERGENS.find(x => x.code === code)!;
              return (
                <span key={code} className="font-black px-1.5 py-0.5 rounded text-[9px]"
                  style={{ color: a.color, background: a.bg }}>{a.short}</span>
              );
            })}
          </div>
        </div>
      </motion.button>
    );
  }

  return (
    <motion.button onClick={onOpen}
      className={`flex flex-col bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-zinc-800 text-left hover:shadow-lg transition-all ${p.outOfStock ? 'opacity-50' : ''}`}
      whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
      {p.imageUrl
        ? <div className="aspect-video w-full overflow-hidden bg-gray-100"><img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /></div>
        : <div className="aspect-video w-full bg-gradient-to-br from-gray-100 to-gray-50 dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center">
            <span className="text-3xl opacity-30">🍽</span>
          </div>}
      <div className="p-3 flex-1 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-1">
          <h3 className="font-bold text-sm leading-tight flex-1">{p.name}</h3>
          <div className="font-black text-sm shrink-0" style={{ color: accentColor }}>{priceStr}</div>
        </div>
        {p.description && <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">{p.description}</p>}
        <div className="flex items-center gap-1.5 mt-auto pt-1 flex-wrap">
          {dietBadges.map((b, i) => <span key={i} className="text-xs">{b}</span>)}
          {allergenCodes.slice(0, 3).map(code => {
            const a = EU_ALLERGENS.find(x => x.code === code)!;
            return <span key={code} className="font-black px-1 py-0.5 rounded text-[9px]"
              style={{ color: a.color, background: a.bg }}>{a.short}</span>;
          })}
        </div>
      </div>
    </motion.button>
  );
}

// ── CategoryCard ──────────────────────────────────────────────────────────────

function CategoryCard({ cat, onClick, accentColor }: { cat: CartaCategory; onClick: () => void; accentColor: string }) {
  const bg = cat.color ?? accentColor;
  return (
    <motion.button onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl text-white text-center aspect-square shadow-lg"
      style={{ background: `linear-gradient(135deg, ${bg}cc, ${bg})` }}
      whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.96 }}
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {cat.icon && <span className="text-3xl leading-none">{cat.icon}</span>}
      <span className="font-black text-sm leading-tight drop-shadow">{cat.name}</span>
      <span className="text-[11px] opacity-75">{cat.products.length} platos</span>
    </motion.button>
  );
}

// ── AllergenFilter ────────────────────────────────────────────────────────────

function AllergenFilter({ excluded, onToggle }: { excluded: Set<string>; onToggle: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const count = excluded.size;
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${count > 0 ? 'bg-red-50 dark:bg-red-900/20 text-red-600 border-red-200' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 border-transparent'}`}>
        🚫 Alérgenos{count > 0 ? ` (${count})` : ''}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="absolute top-full left-0 mt-2 z-30 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-2xl p-3 min-w-[220px]"
            initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }} transition={{ duration: 0.15 }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 px-1">Ocultar platos que contienen:</p>
            <div className="grid grid-cols-2 gap-1">
              {EU_ALLERGENS.map(a => (
                <button key={a.code} onClick={() => onToggle(a.code)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-xs transition-all ${excluded.has(a.code) ? 'font-black' : 'text-gray-600 hover:bg-gray-50'}`}
                  style={excluded.has(a.code) ? { color: a.color, background: a.bg } : {}}>
                  <span className="font-black px-1 py-0.5 rounded text-[9px]" style={{ color: a.color, background: a.bg }}>{a.short}</span>
                  <span className="truncate">{a.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── TipSelector ───────────────────────────────────────────────────────────────

function TipSelector({ baseAmount, tipPct, setTipPct, tipPercentages, accentColor }: {
  baseAmount: number;
  tipPct: number | null;
  setTipPct: (pct: number | null) => void;
  tipPercentages: number[];
  accentColor: string;
}) {
  const tipAmt = tipPct ? (baseAmount * tipPct / 100) : 0;
  return (
    <div className="bg-white/5 rounded-2xl p-4 space-y-3">
      <p className="text-white/50 text-xs uppercase tracking-widest font-bold">¿Deseas dejar propina? 🙏</p>
      <div className="flex gap-2 flex-wrap">
        {tipPercentages.map(pct => (
          <button key={pct} onClick={() => setTipPct(tipPct === pct ? null : pct)}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
            style={tipPct === pct
              ? { backgroundColor: accentColor, color: 'white' }
              : { backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
            {pct}%
          </button>
        ))}
        <button onClick={() => setTipPct(null)}
          className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
          style={tipPct === null
            ? { backgroundColor: accentColor, color: 'white' }
            : { backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
          Sin propina
        </button>
      </div>
      {tipPct && (
        <p className="text-emerald-400 text-sm font-semibold">
          +{tipAmt.toFixed(2)}€ de propina · Total: {(baseAmount + tipAmt).toFixed(2)}€
        </p>
      )}
    </div>
  );
}

// ── CheckoutPanel ─────────────────────────────────────────────────────────────

function CheckoutPanel({ cart, onUpdateQty, onRemove, onClear, accentColor, session, cfg }: {
  cart: CartItem[];
  onUpdateQty: (productId: string, formatId: string | undefined, delta: number) => void;
  onRemove: (productId: string, formatId: string | undefined) => void;
  onClear: () => void;
  accentColor: string;
  session: TableSession | null;
  cfg: OnlineConfig | null;
}) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('cart');
  const [deliveryType, setDeliveryType] = useState<'dine_in' | 'takeaway' | 'delivery'>(
    session ? 'dine_in' : 'takeaway'
  );
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [tipPct, setTipPct] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'on_arrival' | 'on_delivery'>('on_arrival');
  const [ordering, setOrdering] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const subtotal = cartTotal(cart);
  const tipAmt = tipPct ? (subtotal * tipPct / 100) : 0;
  const grand = subtotal + tipAmt;
  const tipPcts = cfg?.tipPercentages ?? [5, 10, 15, 20];

  const placeOrder = async () => {
    setOrdering(true);
    try {
      const body: Record<string, unknown> = {
        deliveryType,
        channel: session ? 'qr_table' : 'web',
        items: cart.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          formatId: i.formatId,
          notes: i.notes ?? '',
        })),
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        scheduledAt: 'asap',
        paymentMethod,
        tipAmount: tipAmt,
        idempotencyKey,
        tableSessionToken: session?.token ?? undefined,
      };

      const res = await fetch(`${BASE}/api/public/orders/online-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? 'Error al realizar el pedido');
        return;
      }

      const data = await res.json();
      setOrderNumber(data.orderNumber);

      // If online payment, create payment intent
      if (paymentMethod === 'online') {
        const piRes = await fetch(`${BASE}/api/public/payment/intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: data.orderId }),
        });
        if (piRes.ok) {
          const pi = await piRes.json();
          if (pi.provider === 'simulator') {
            // Auto-confirm simulator payment after 2 seconds
            setTimeout(async () => {
              await fetch(`${BASE}/api/public/payment/webhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'simulator.payment.confirm',
                  orderId: data.orderId,
                  attemptId: pi.attemptId,
                  approve: true,
                }),
              });
            }, 2000);
          }
        }
      }

      setStep('success');
      onClear();
      // Regenerate key so a subsequent checkout in the same session is not
      // accidentally treated as a duplicate by the idempotency guard.
      setIdempotencyKey(crypto.randomUUID());
    } catch { alert('Error de conexión. Inténtalo de nuevo.'); }
    finally { setOrdering(false); }
  };

  if (cart.length === 0 && step !== 'success') return null;

  const INPUT = 'w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/50 text-sm';
  const LABEL = 'block text-xs uppercase tracking-widest text-white/50 font-bold mb-1';

  const prevStep = (): Step => {
    if (step === 'type') return 'cart';
    if (step === 'details') return 'type';
    if (step === 'tip') return 'details';
    if (step === 'payment') return 'tip';
    return 'cart';
  };

  return (
    <>
      {cart.length > 0 && step === 'cart' && !open && (
        <motion.button onClick={() => { setOpen(true); setStep('cart'); }}
          className="fixed bottom-6 left-4 right-4 z-40 flex items-center justify-between px-5 py-4 rounded-2xl text-white font-bold shadow-2xl"
          style={{ backgroundColor: accentColor }}
          initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
          whileTap={{ scale: 0.97 }}>
          <span className="flex items-center gap-2">
            <ShoppingBag size={20} />
            Ver carrito ({cart.reduce((s, i) => s + i.quantity, 0)})
          </span>
          <span className="font-black text-lg">{subtotal.toFixed(2)}€</span>
        </motion.button>
      )}

      <AnimatePresence>
        {(open || step === 'success') && (
          <motion.div className="fixed inset-0 z-50 flex flex-col"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md"
              onClick={() => { if (step !== 'success') { setOpen(false); setStep('cart'); } }} />
            <motion.div
              className="relative mt-auto w-full max-w-lg mx-auto rounded-t-3xl overflow-hidden max-h-[92vh] flex flex-col"
              style={{ background: 'linear-gradient(to bottom, #1a1a2e, #16213e)' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={e => e.stopPropagation()}>

              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-3 shrink-0 border-b border-white/10">
                {step !== 'cart' && step !== 'success' && (
                  <button onClick={() => setStep(prevStep())}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
                    <ArrowLeft size={15} className="text-white" />
                  </button>
                )}
                <div className="flex-1">
                  <h3 className="text-white font-black text-base">
                    {step === 'cart' ? '🛒 Tu pedido' :
                     step === 'type' ? '¿Cómo quieres recibirlo?' :
                     step === 'details' ? 'Tus datos' :
                     step === 'tip' ? 'Propina y pago' :
                     step === 'payment' ? 'Confirmar pedido' :
                     '¡Pedido realizado!'}
                  </h3>
                  {step !== 'cart' && step !== 'success' && (
                    <div className="flex gap-1 mt-1">
                      {(['type', 'details', 'tip', 'payment'] as Step[]).map((s, i) => (
                        <div key={s} className="h-1 rounded-full flex-1 transition-all"
                          style={{ backgroundColor: ['type', 'details', 'tip', 'payment'].indexOf(step) >= i ? accentColor : 'rgba(255,255,255,0.15)' }} />
                      ))}
                    </div>
                  )}
                </div>
                {step !== 'success' && (
                  <button onClick={() => { setOpen(false); setStep('cart'); }}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
                    <X size={15} className="text-white" />
                  </button>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {/* ── Cart ── */}
                {step === 'cart' && (
                  <div className="px-5 py-4 space-y-3">
                    {session && (
                      <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-xl px-3 py-2">
                        <QrCode size={14} className="text-emerald-400 shrink-0" />
                        <span className="text-emerald-400 text-xs font-semibold">
                          Mesa {session.tableLabel}{session.zoneLabel ? ` · ${session.zoneLabel}` : ''}
                        </span>
                      </div>
                    )}
                    {cart.map(item => (
                      <div key={`${item.productId}-${item.formatId}`} className="flex items-center gap-3">
                        {item.image && <img src={item.image} alt={item.productName} className="w-12 h-12 rounded-xl object-cover shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{item.productName}</p>
                          {item.formatName && <p className="text-white/50 text-xs">{item.formatName}</p>}
                          <p className="text-white/70 text-xs font-mono">{item.unitPrice.toFixed(2)}€ c/u</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => onUpdateQty(item.productId, item.formatId, -1)}
                            className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
                            <Minus size={12} className="text-white" />
                          </button>
                          <span className="text-white font-bold w-5 text-center text-sm">{item.quantity}</span>
                          <button onClick={() => onUpdateQty(item.productId, item.formatId, 1)}
                            className="w-7 h-7 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: `${accentColor}40` }}>
                            <Plus size={12} className="text-white" />
                          </button>
                          <button onClick={() => onRemove(item.productId, item.formatId)}
                            className="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center hover:bg-red-500/40">
                            <Trash2 size={12} className="text-red-400" />
                          </button>
                        </div>
                        <span className="text-white font-black text-sm w-14 text-right shrink-0">
                          {(item.unitPrice * item.quantity).toFixed(2)}€
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-white/10 pt-3 flex justify-between text-white font-black text-lg">
                      <span>Total</span>
                      <span>{subtotal.toFixed(2)}€</span>
                    </div>
                  </div>
                )}

                {/* ── Type ── */}
                {step === 'type' && (
                  <div className="px-5 py-6 space-y-4">
                    {cfg?.paused
                      ? <div className="bg-amber-500/20 border border-amber-500/30 rounded-2xl p-4 text-center">
                          <p className="text-amber-400 font-bold">Servicio pausado temporalmente</p>
                          {cfg.pauseReason && <p className="text-amber-400/70 text-sm mt-1">{cfg.pauseReason}</p>}
                        </div>
                      : <>
                          {session && (
                            <button onClick={() => setDeliveryType('dine_in')}
                              className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all ${deliveryType === 'dine_in' ? '' : 'border-white/10'}`}
                              style={deliveryType === 'dine_in' ? { borderColor: accentColor, background: `${accentColor}20` } : {}}>
                              <span className="text-3xl">🍽️</span>
                              <div className="text-left">
                                <p className="text-white font-black text-base">Consumir en mesa</p>
                                <p className="text-white/50 text-sm">Mesa {session.tableLabel}</p>
                              </div>
                              {deliveryType === 'dine_in' && <CheckCircle size={20} className="ml-auto text-emerald-400" />}
                            </button>
                          )}
                          {cfg?.takeawayEnabled && (
                            <button onClick={() => setDeliveryType('takeaway')}
                              className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all ${deliveryType === 'takeaway' ? '' : 'border-white/10'}`}
                              style={deliveryType === 'takeaway' ? { borderColor: accentColor, background: `${accentColor}20` } : {}}>
                              <span className="text-3xl">🏪</span>
                              <div className="text-left">
                                <p className="text-white font-black text-base">Recoger en barra</p>
                                <p className="text-white/50 text-sm">~{cfg.prepTimeMinutes} min</p>
                              </div>
                              {deliveryType === 'takeaway' && <CheckCircle size={20} className="ml-auto text-emerald-400" />}
                            </button>
                          )}
                          {cfg?.deliveryEnabled && (
                            <button onClick={() => setDeliveryType('delivery')}
                              className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all border-white/10`}>
                              <span className="text-3xl">🛵</span>
                              <div className="text-left">
                                <p className="text-white font-black text-base">A domicilio</p>
                                <p className="text-white/50 text-sm">+{parseFloat(cfg.deliveryFee).toFixed(2)}€</p>
                              </div>
                              {deliveryType === 'delivery' && <CheckCircle size={20} className="ml-auto text-emerald-400" />}
                            </button>
                          )}
                          {!session && !cfg?.takeawayEnabled && !cfg?.deliveryEnabled && (
                            <div className="text-center py-10 text-white/50">No hay opciones de pedido disponibles.</div>
                          )}
                        </>
                    }
                  </div>
                )}

                {/* ── Details ── */}
                {step === 'details' && (
                  <div className="px-5 py-4 space-y-4">
                    <div>
                      <label className={LABEL}>Nombre</label>
                      <input className={INPUT} placeholder="Tu nombre" value={clientName} onChange={e => setClientName(e.target.value)} />
                    </div>
                    <div>
                      <label className={LABEL}>Teléfono (opcional)</label>
                      <input className={INPUT} type="tel" placeholder="612 345 678" value={clientPhone} onChange={e => setClientPhone(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* ── Tip ── */}
                {step === 'tip' && (
                  <div className="px-5 py-4 space-y-4">
                    {cfg?.tipEnabled && (
                      <TipSelector
                        baseAmount={subtotal}
                        tipPct={tipPct}
                        setTipPct={setTipPct}
                        tipPercentages={tipPcts}
                        accentColor={accentColor}
                      />
                    )}

                    {/* Payment method */}
                    <p className="text-white/50 text-xs uppercase tracking-widest font-bold">Forma de pago</p>
                    <div className="space-y-2">
                      <button onClick={() => setPaymentMethod('on_arrival')}
                        className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${paymentMethod === 'on_arrival' ? 'border-amber-400' : 'border-white/10'}`}>
                        <Banknote size={18} className="text-amber-400 shrink-0" />
                        <div className="text-left">
                          <p className="text-white font-bold">💵 Pago al final</p>
                          <p className="text-white/50 text-xs">Pagas cuando acabes</p>
                        </div>
                        {paymentMethod === 'on_arrival' && <CheckCircle size={16} className="ml-auto text-emerald-400" />}
                      </button>
                      <button onClick={() => setPaymentMethod('online')}
                        className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${paymentMethod === 'online' ? 'border-violet-400' : 'border-white/10'}`}
                        style={paymentMethod === 'online' ? { background: 'rgba(139,92,246,0.15)' } : {}}>
                        <CreditCard size={18} className="text-violet-400 shrink-0" />
                        <div className="text-left">
                          <p className="text-white font-bold">💳 Tarjeta online</p>
                          <p className="text-white/50 text-xs">Pago seguro ahora</p>
                        </div>
                        {paymentMethod === 'online' && <CheckCircle size={16} className="ml-auto text-emerald-400" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Payment (review + confirm) ── */}
                {step === 'payment' && (
                  <div className="px-5 py-4 space-y-4">
                    <div className="bg-white/5 rounded-2xl p-4 space-y-2">
                      <p className="text-white/50 text-xs uppercase tracking-widest font-bold">Resumen</p>
                      {cart.map(item => (
                        <div key={`${item.productId}-${item.formatId}`} className="flex justify-between text-sm text-white/80">
                          <span>{item.quantity}× {item.productName}{item.formatName ? ` (${item.formatName})` : ''}</span>
                          <span className="font-mono">{(item.unitPrice * item.quantity).toFixed(2)}€</span>
                        </div>
                      ))}
                      {tipAmt > 0 && (
                        <div className="flex justify-between text-sm text-emerald-400 border-t border-white/10 pt-2">
                          <span>Propina ({tipPct}%)</span>
                          <span className="font-mono">+{tipAmt.toFixed(2)}€</span>
                        </div>
                      )}
                      <div className="flex justify-between text-white font-black text-lg border-t border-white/10 pt-2">
                        <span>Total</span>
                        <span>{grand.toFixed(2)}€</span>
                      </div>
                    </div>
                    {paymentMethod === 'online' && (
                      <div className="bg-violet-500/15 border border-violet-500/30 rounded-xl px-4 py-3 text-sm text-violet-300 flex items-center gap-2">
                        <CreditCard size={14} /> Se procesará el pago seguro al confirmar.
                      </div>
                    )}
                  </div>
                )}

                {/* ── Success ── */}
                {step === 'success' && (
                  <div className="px-5 py-10 text-center space-y-6">
                    <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center bg-emerald-500/20">
                      <CheckCircle size={40} className="text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="text-white font-black text-2xl mb-2">¡Pedido realizado!</h2>
                      <div className="text-3xl font-black font-mono mb-1" style={{ color: accentColor }}>{orderNumber}</div>
                      <p className="text-white/50 text-sm">El personal lo recibirá en breve</p>
                    </div>
                    <div className="space-y-3">
                      <button onClick={() => { setOpen(false); setStep('cart'); navigate(`/order-status/${orderNumber}`); }}
                        className="w-full py-4 rounded-2xl font-black text-white text-base"
                        style={{ backgroundColor: accentColor }}>
                        Ver estado del pedido →
                      </button>
                      <button onClick={() => { setOpen(false); setStep('cart'); }}
                        className="w-full py-3 rounded-2xl bg-white/10 text-white font-semibold text-sm hover:bg-white/20">
                        Volver a la carta
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              {step !== 'success' && (
                <div className="p-5 shrink-0 border-t border-white/10">
                  {step === 'cart' && (
                    <button onClick={() => setStep('type')}
                      className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2"
                      style={{ backgroundColor: accentColor }}>
                      Hacer pedido <ArrowRight size={18} />
                    </button>
                  )}
                  {step === 'type' && (
                    <button onClick={() => setStep('details')}
                      className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2"
                      style={{ backgroundColor: accentColor }}>
                      Continuar <ArrowRight size={18} />
                    </button>
                  )}
                  {step === 'details' && (
                    <button onClick={() => setStep('tip')} disabled={!clientName.trim()}
                      className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2 disabled:opacity-40"
                      style={{ backgroundColor: accentColor }}>
                      Continuar <ArrowRight size={18} />
                    </button>
                  )}
                  {step === 'tip' && (
                    <button onClick={() => setStep('payment')}
                      className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2"
                      style={{ backgroundColor: accentColor }}>
                      Revisar pedido <ArrowRight size={18} />
                    </button>
                  )}
                  {step === 'payment' && (
                    <button onClick={placeOrder} disabled={ordering}
                      className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ backgroundColor: accentColor }}>
                      {ordering ? <><Loader2 size={18} className="animate-spin" /> Enviando…</> : '✓ Confirmar pedido'}
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MenuPage() {
  const [menu, setMenu] = useState<CartaCategory[]>([]);
  const [branding, setBranding] = useState<Branding>({
    nombreComercial: '', tagline: '', heroImageUrl: '', heroVideoUrl: '',
    address: '', phone: '', accentColor: '#ef4444', logoUrl: '',
  });
  const [cfg, setCfg] = useState<OnlineConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<TableSession | null>(null);
  const [sessionError, setSessionError] = useState('');

  const sessionToken = useSearchParam('token');
  const signedTableTicket = useSearchParam('ticket');
  const [activeSessionToken, setActiveSessionToken] = useState<string | null>(sessionToken);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>('grid');
  const layoutInitialised = useRef(false);
  const saveCartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dietFilter, setDietFilter] = useState<DietaryKey | null>(null);
  const [excludedAllergens, setExcludedAllergens] = useState<Set<string>>(new Set());
  const toggleAllergen = useCallback((code: string) => {
    setExcludedAllergens(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }, []);
  const [selectedProduct, setSelectedProduct] = useState<CartaProduct | null>(null);

  const accentColor = branding.accentColor || '#ef4444';

  // ── Fetch all data ─────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const [menuRes, brandingRes, cfgRes] = await Promise.all([
      fetch(`${BASE}/api/public/menu`).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/public/branding`).then(r => r.ok ? r.json() : null),
      fetch(`${BASE}/api/public/online-config`).then(r => r.ok ? r.json() : null),
    ]);
    if (Array.isArray(menuRes)) setMenu(menuRes);
    if (brandingRes) setBranding(brandingRes);
    if (cfgRes) {
      const tipPcts = cfgRes.tipPercentages;
      setCfg({
        ...cfgRes,
        tipPercentages: Array.isArray(tipPcts) ? tipPcts : [5, 10, 15, 20],
        tableOrderingEnabled: cfgRes.tableOrderingEnabled ?? false,
        tipEnabled: cfgRes.tipEnabled ?? false,
      });
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  // Set layout from branding
  useEffect(() => {
    if (!layoutInitialised.current && (branding as any).cardLayout) {
      const bl = (branding as any).cardLayout;
      if (bl === 'list' || bl === 'grid' || bl === 'compact') setLayout(bl);
      layoutInitialised.current = true;
    }
  }, [branding]);

  // ── Validate table session from URL token ──────────────────────────────────

  useEffect(() => {
    if (sessionToken) {
      setActiveSessionToken(sessionToken);
      return;
    }
    if (!signedTableTicket) return;
    fetch(`${BASE}/api/public/table-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: signedTableTicket }),
    })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'QR inválido');
        setSession(data);
        setActiveSessionToken(data.token);
      })
      .catch(() => setSessionError('El QR de mesa no es válido o ha caducado.'));
  }, [sessionToken, signedTableTicket]);

  useEffect(() => {
    if (!activeSessionToken || signedTableTicket) return;
    fetch(`${BASE}/api/public/table-sessions/check?token=${encodeURIComponent(activeSessionToken)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setSessionError(data.error);
        else setSession(data);
      })
      .catch(() => setSessionError('No se pudo verificar la sesión de mesa.'));
  }, [activeSessionToken, signedTableTicket]);

  // ── Server-side cart persistence ───────────────────────────────────────────

  // Load persisted cart from server when session is first validated
  useEffect(() => {
    if (!session || !activeSessionToken) return;
    fetch(`${BASE}/api/public/cart?token=${encodeURIComponent(activeSessionToken)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.items && Array.isArray(data.items) && data.items.length > 0) {
          setCart(data.items as CartItem[]);
        }
      })
      .catch(() => {/* ignore network errors */});
  }, [session, activeSessionToken]);

  // Debounce-save cart to server whenever it changes (session only)
  useEffect(() => {
    if (!session || !activeSessionToken) return;
    if (saveCartTimer.current) clearTimeout(saveCartTimer.current);
    saveCartTimer.current = setTimeout(() => {
      fetch(`${BASE}/api/public/cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: activeSessionToken, items: cart, deliveryType: 'dine_in' }),
      }).catch(() => {/* silently ignore */});
    }, 600);
    return () => {
      if (saveCartTimer.current) clearTimeout(saveCartTimer.current);
    };
  }, [cart, session, activeSessionToken]);

  // ── Cart operations ────────────────────────────────────────────────────────

  const addToCart = useCallback((product: CartaProduct, formatId?: string, formatName?: string) => {
    const fmt = formatId ? product.formats?.find(f => f.id === formatId) : null;
    const unitPrice = fmt ? parseFloat(fmt.price) : parseFloat(product.price);

    setCart(prev => {
      const key = `${product.id}-${formatId ?? ''}`;
      const existing = prev.find(i => `${i.productId}-${i.formatId ?? ''}` === key);
      if (existing) {
        return prev.map(i => `${i.productId}-${i.formatId ?? ''}` === key
          ? { ...i, quantity: i.quantity + 1 }
          : i);
      }
      return [...prev, {
        productId: product.id, productName: product.name,
        quantity: 1, unitPrice, taxRate: 10,
        formatId, formatName, image: product.imageUrl ?? undefined,
      }];
    });
    setSelectedProduct(null);
  }, []);

  const updateQty = useCallback((productId: string, formatId: string | undefined, delta: number) => {
    setCart(prev => {
      const key = `${productId}-${formatId ?? ''}`;
      const updated = prev.map(i => `${i.productId}-${i.formatId ?? ''}` === key
        ? { ...i, quantity: i.quantity + delta }
        : i).filter(i => i.quantity > 0);
      return updated;
    });
  }, []);

  const removeItem = useCallback((productId: string, formatId: string | undefined) => {
    setCart(prev => prev.filter(i => !(i.productId === productId && i.formatId === formatId)));
  }, []);

  // ── Computed menu data ─────────────────────────────────────────────────────

  const categoryMap = useMemo(() => Object.fromEntries(menu.map(c => [c.id, c])), [menu]);
  const currentCategory = activeCategory ? (categoryMap[activeCategory] ?? null) : null;

  const filteredProducts = useMemo(() => {
    if (!currentCategory) return [];
    let ps = currentCategory.products;
    if (dietFilter) ps = ps.filter(p => p[dietFilter]);
    if (excludedAllergens.size > 0) {
      ps = ps.filter(p => {
        const codes = parseAllergens(p.allergens);
        return !codes.some(c => excludedAllergens.has(c));
      });
    }
    return ps;
  }, [currentCategory, dietFilter, excludedAllergens]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <Loader2 size={32} className="text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 pb-32">
      {/* Session banner */}
      {session && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-xl px-3 py-2">
            <QrCode size={14} className="text-emerald-500 shrink-0" />
            <span className="text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
              Mesa {session.tableLabel}{session.zoneLabel ? ` · ${session.zoneLabel}` : ''} · Pedido activado
            </span>
          </div>
        </div>
      )}
      {sessionError && (
        <div className="px-4 pt-3">
          <div className="bg-amber-500/15 border border-amber-500/30 rounded-xl px-3 py-2">
            <span className="text-amber-700 dark:text-amber-400 text-xs font-semibold">⚠️ {sessionError}</span>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="relative w-full min-h-[45vw] max-h-[320px] overflow-hidden flex items-end">
        {branding.heroVideoUrl
          ? <video src={branding.heroVideoUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay muted loop playsInline />
          : branding.heroImageUrl
          ? <img src={branding.heroImageUrl} alt={branding.nombreComercial} className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accentColor}80, ${accentColor})` }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="relative px-5 pb-5 pt-16 w-full">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            {branding.nombreComercial && (
              <h1 className="text-white font-black text-2xl leading-tight drop-shadow-lg">{branding.nombreComercial}</h1>
            )}
            {branding.tagline && (
              <p className="text-white/80 text-sm mt-1 drop-shadow">{branding.tagline}</p>
            )}
          </motion.div>
        </div>
      </div>

      {/* Navigation */}
      <div className="sticky top-0 z-20 bg-white dark:bg-zinc-950 border-b border-gray-100 dark:border-zinc-800 shadow-sm">
        {activeCategory && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-zinc-800">
            <button onClick={() => { setActiveCategory(null); setDietFilter(null); }}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
              <ArrowLeft size={16} />
            </button>
            <span className="font-black text-sm flex-1 truncate">
              {currentCategory?.icon} {currentCategory?.name}
            </span>
            <div className="flex items-center gap-1">
              {(['grid', 'list', 'compact'] as Layout[]).map((l, i) => {
                const Icon = [LayoutGrid, LayoutList, AlignJustify][i];
                return (
                  <button key={l} onClick={() => setLayout(l)}
                    className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${layout === l ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    style={layout === l ? { backgroundColor: `${accentColor}20`, color: accentColor } : {}}>
                    <Icon size={14} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeCategory && (
          <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <AllergenFilter excluded={excludedAllergens} onToggle={toggleAllergen} />
            {DIETARY_FILTERS.map(({ key, label }) => (
              <button key={key} onClick={() => setDietFilter(dietFilter === key ? null : key)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${dietFilter === key ? 'text-white border-transparent' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 border-transparent'}`}
                style={dietFilter === key ? { backgroundColor: accentColor } : {}}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 pt-5">
        {!activeCategory ? (
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-4">
              {menu.length} {menu.length === 1 ? 'categoría' : 'categorías'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {menu.map(cat => (
                <CategoryCard key={cat.id} cat={cat} accentColor={accentColor}
                  onClick={() => { setActiveCategory(cat.id); setDietFilter(null); }} />
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-4">
              {filteredProducts.length} platos
            </p>
            {layout === 'compact' ? (
              <div className="border-t border-gray-100 dark:border-zinc-800">
                {filteredProducts.map(p => (
                  <ProductCard key={p.id} product={p} layout={layout} accentColor={accentColor}
                    excluded={false} onOpen={() => setSelectedProduct(p)} />
                ))}
              </div>
            ) : (
              <div className={layout === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 gap-3'
                : 'flex flex-col gap-3'}>
                {filteredProducts.map(p => (
                  <ProductCard key={p.id} product={p} layout={layout} accentColor={accentColor}
                    excluded={false} onOpen={() => setSelectedProduct(p)} />
                ))}
              </div>
            )}
            {filteredProducts.length === 0 && (
              <div className="text-center py-12 text-gray-400 dark:text-zinc-600">
                <p className="text-2xl mb-2">🔍</p>
                <p className="font-semibold text-sm">Sin resultados con estos filtros</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {(branding.address || branding.phone) && (
        <div className="mt-8 py-6 px-4 bg-gray-50 dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 space-y-2">
          {branding.address && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(branding.address)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              <MapPin size={14} />{branding.address}
            </a>
          )}
          {branding.phone && (
            <a href={`tel:${branding.phone}`}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              <Phone size={14} />{branding.phone}
            </a>
          )}
          <p className="text-[10px] text-gray-400 dark:text-zinc-600 pt-2">
            Alérgenos según Regl. UE 1169/2011 · {branding.nombreComercial || 'Restaurante'}
          </p>
        </div>
      )}

      {/* Product detail modal */}
      {selectedProduct && (
        <ItemDetailModal
          product={selectedProduct}
          accentColor={accentColor}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={addToCart}
        />
      )}

      {/* Checkout panel */}
      <CheckoutPanel
        cart={cart}
        onUpdateQty={updateQty}
        onRemove={removeItem}
        onClear={() => setCart([])}
        accentColor={accentColor}
        session={session}
        cfg={cfg}
      />
    </div>
  );
}
