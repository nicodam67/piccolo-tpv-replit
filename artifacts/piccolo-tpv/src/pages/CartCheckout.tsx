/**
 * CartCheckout — Floating cart + multi-step checkout for the QR Carta
 * Used by carta.tsx
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag, X, Minus, Plus, Trash2, ArrowLeft, ArrowRight,
  MapPin, Clock, CreditCard, Banknote, CheckCircle, Loader2,
} from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export interface CartItem {
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

interface OnlineConfigPublic {
  takeawayEnabled: boolean;
  deliveryEnabled: boolean;
  schedule?: Record<string, { open: string; close: string; open2?: string; close2?: string }>;
  prepTimeMinutes: number;
  minOrder: string;
  minOrderDelivery: string;
  deliveryFee: string;
  freeDeliveryFrom?: string | null;
  maxAdvanceHours: number;
  paused: boolean;
  pauseReason: string;
  zones?: Array<{ id: string; name: string; deliveryFee: string; minOrder: string; estimatedMinutes: number }>;
}

interface Props {
  cart: CartItem[];
  onUpdateQty: (productId: string, formatId: string | undefined, delta: number) => void;
  onRemove: (productId: string, formatId: string | undefined) => void;
  onClear: () => void;
  accentColor: string;
}

type Step = 'cart' | 'type' | 'details' | 'time' | 'payment' | 'success';

function total(cart: CartItem[]) {
  return cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}

const INPUT = 'w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/50 text-sm';
const LABEL = 'block text-xs uppercase tracking-widest text-white/50 font-bold mb-1';

export function CartCheckout({ cart, onUpdateQty, onRemove, onClear, accentColor }: Props) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('cart');

  // Config
  const [cfg, setCfg] = useState<OnlineConfigPublic | null>(null);
  const [cfgLoading, setCfgLoading] = useState(false);

  // Form state
  const [deliveryType, setDeliveryType] = useState<'takeaway' | 'delivery'>('takeaway');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [consentRgpd, setConsentRgpd] = useState(false);
  const [address, setAddress] = useState({ street: '', number: '', floor: '', postalCode: '', city: '', notes: '' });
  const [zoneCheck, setZoneCheck] = useState<{ covered: boolean; zone?: { deliveryFee: string; estimatedMinutes: number } } | null>(null);
  const [checkingZone, setCheckingZone] = useState(false);
  const [scheduledType, setScheduledType] = useState<'asap' | 'scheduled'>('asap');
  const [scheduledAt, setScheduledAt] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'on_arrival' | 'on_delivery'>('online');
  const [ordering, setOrdering] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');

  const cartTotal = total(cart);
  const deliveryFee = zoneCheck?.zone?.deliveryFee
    ? parseFloat(zoneCheck.zone.deliveryFee)
    : (cfg ? parseFloat(cfg.deliveryFee) : 0);
  const grandTotal = cartTotal + (deliveryType === 'delivery' ? deliveryFee : 0);

  // Load config when opening checkout
  const loadCfg = async () => {
    if (cfg) return;
    setCfgLoading(true);
    try {
      const res = await fetch(`${BASE}/api/public/online-config`);
      setCfg(await res.json());
    } catch { /* ignore */ }
    finally { setCfgLoading(false); }
  };

  const checkZone = async () => {
    if (!address.postalCode.trim()) return;
    setCheckingZone(true);
    try {
      const res = await fetch(`${BASE}/api/public/check-zone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postalCode: address.postalCode.trim(), city: address.city.trim() }),
      });
      const data = await res.json();
      setZoneCheck(data);
    } catch { setZoneCheck({ covered: false }); }
    finally { setCheckingZone(false); }
  };

  const placeOrder = async () => {
    setOrdering(true);
    try {
      const body: Record<string, unknown> = {
        deliveryType,
        channel: 'qr',
        items: cart.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          formatId: i.formatId,
          notes: i.notes ?? '',
        })),
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        scheduledAt: scheduledType === 'asap' ? 'asap' : scheduledAt,
        paymentMethod,
        consentRgpd,
      };
      if (deliveryType === 'delivery') {
        body.deliveryAddress = {
          street: address.street,
          number: address.number,
          floor: address.floor,
          postalCode: address.postalCode,
          city: address.city,
          notes: address.notes,
        };
      }

      const res = await fetch(`${BASE}/api/public/orders/online`, {
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
      setStep('success');
      onClear();
    } catch { alert('Error de conexión. Inténtalo de nuevo.'); }
    finally { setOrdering(false); }
  };

  if (cart.length === 0 && step !== 'success') {
    return null;
  }

  const minNow = new Date(Date.now() + 30 * 60000).toISOString().slice(0, 16);
  const maxFuture = new Date(Date.now() + (cfg?.maxAdvanceHours ?? 48) * 3600000).toISOString().slice(0, 16);

  return (
    <>
      {/* Floating cart button */}
      {cart.length > 0 && step === 'cart' && !open && (
        <motion.button
          onClick={() => { setOpen(true); setStep('cart'); }}
          className="fixed bottom-6 left-4 right-4 z-40 flex items-center justify-between px-5 py-4 rounded-2xl text-white font-bold shadow-2xl"
          style={{ backgroundColor: accentColor }}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          whileTap={{ scale: 0.97 }}
        >
          <span className="flex items-center gap-2">
            <ShoppingBag size={20} />
            Ver carrito ({cart.reduce((s, i) => s + i.quantity, 0)})
          </span>
          <span className="font-black text-lg">{cartTotal.toFixed(2)}€</span>
        </motion.button>
      )}

      {/* Checkout overlay */}
      <AnimatePresence>
        {(open || step === 'success') && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => { if (step !== 'success') { setOpen(false); setStep('cart'); } }} />

            <motion.div
              className="relative mt-auto w-full max-w-lg mx-auto rounded-t-3xl overflow-hidden max-h-[92vh] flex flex-col"
              style={{ background: 'linear-gradient(to bottom, #1a1a2e, #16213e)' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-3 shrink-0 border-b border-white/10">
                {step !== 'cart' && step !== 'success' && (
                  <button onClick={() => setStep(step === 'type' ? 'cart' : step === 'details' ? 'type' : step === 'time' ? 'details' : step === 'payment' ? 'time' : 'cart')}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                    <ArrowLeft size={15} className="text-white" />
                  </button>
                )}
                <div className="flex-1">
                  <h3 className="text-white font-black text-base">
                    {step === 'cart' ? '🛒 Tu pedido' :
                     step === 'type' ? '¿Cómo quieres recibirlo?' :
                     step === 'details' ? 'Tus datos' :
                     step === 'time' ? '¿Cuándo?' :
                     step === 'payment' ? 'Confirmar y pagar' :
                     '¡Pedido realizado!'}
                  </h3>
                  {step !== 'cart' && step !== 'success' && (
                    <div className="flex gap-1 mt-1">
                      {(['type', 'details', 'time', 'payment'] as Step[]).map((s, i) => (
                        <div key={s} className="h-1 rounded-full flex-1 transition-all"
                          style={{ backgroundColor: ['type', 'details', 'time', 'payment'].indexOf(step) >= i ? accentColor : 'rgba(255,255,255,0.15)' }} />
                      ))}
                    </div>
                  )}
                </div>
                {step !== 'success' && (
                  <button onClick={() => { setOpen(false); setStep('cart'); }}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                    <X size={15} className="text-white" />
                  </button>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {/* ── Step: Cart ── */}
                {step === 'cart' && (
                  <div className="px-5 py-4 space-y-3">
                    {cart.map(item => (
                      <div key={`${item.productId}-${item.formatId}`} className="flex items-center gap-3">
                        {item.image && (
                          <img src={item.image} alt={item.productName} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                        )}
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
                      <span>{cartTotal.toFixed(2)}€</span>
                    </div>
                  </div>
                )}

                {/* ── Step: Type ── */}
                {step === 'type' && (
                  <div className="px-5 py-6 space-y-4">
                    {cfgLoading ? (
                      <div className="text-center py-10"><Loader2 size={28} className="text-white/50 animate-spin mx-auto" /></div>
                    ) : cfg?.paused ? (
                      <div className="bg-amber-500/20 border border-amber-500/30 rounded-2xl p-4 text-center">
                        <p className="text-amber-400 font-bold">Servicio pausado temporalmente</p>
                        {cfg.pauseReason && <p className="text-amber-400/70 text-sm mt-1">{cfg.pauseReason}</p>}
                      </div>
                    ) : (
                      <>
                        {cfg?.takeawayEnabled && (
                          <button
                            onClick={() => setDeliveryType('takeaway')}
                            className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all ${deliveryType === 'takeaway' ? 'border-amber-400' : 'border-white/10 hover:border-white/25'}`}
                            style={deliveryType === 'takeaway' ? { background: `${accentColor}20`, borderColor: accentColor } : {}}
                          >
                            <span className="text-3xl">🏪</span>
                            <div className="text-left">
                              <p className="text-white font-black text-base">Recoger en local</p>
                              <p className="text-white/50 text-sm">~{cfg?.prepTimeMinutes ?? 30} min · Sin coste de envío</p>
                            </div>
                            {deliveryType === 'takeaway' && <CheckCircle size={20} className="ml-auto text-emerald-400" />}
                          </button>
                        )}
                        {cfg?.deliveryEnabled && (
                          <button
                            onClick={() => setDeliveryType('delivery')}
                            className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all ${deliveryType === 'delivery' ? 'border-blue-400' : 'border-white/10 hover:border-white/25'}`}
                          >
                            <span className="text-3xl">🛵</span>
                            <div className="text-left">
                              <p className="text-white font-black text-base">A domicilio</p>
                              <p className="text-white/50 text-sm">
                                Coste de envío: {parseFloat(cfg?.deliveryFee ?? '0').toFixed(2)}€
                                {cfg?.freeDeliveryFrom && ` · Gratis desde ${parseFloat(cfg.freeDeliveryFrom).toFixed(2)}€`}
                              </p>
                            </div>
                            {deliveryType === 'delivery' && <CheckCircle size={20} className="ml-auto text-blue-400" />}
                          </button>
                        )}
                        {!cfg?.takeawayEnabled && !cfg?.deliveryEnabled && (
                          <div className="text-center py-10 text-white/50">
                            El servicio de pedidos online no está disponible en este momento.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ── Step: Details ── */}
                {step === 'details' && (
                  <div className="px-5 py-4 space-y-4">
                    <div>
                      <label className={LABEL}>Nombre completo *</label>
                      <input className={INPUT} placeholder="Tu nombre" value={clientName} onChange={e => setClientName(e.target.value)} />
                    </div>
                    <div>
                      <label className={LABEL}>Teléfono *</label>
                      <input className={INPUT} type="tel" placeholder="612 345 678" value={clientPhone} onChange={e => setClientPhone(e.target.value)} />
                    </div>

                    {deliveryType === 'delivery' && (
                      <div className="space-y-3 bg-white/5 rounded-2xl p-4">
                        <p className="text-white/70 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                          <MapPin size={13} /> Dirección de entrega
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={LABEL}>Calle *</label>
                            <input className={INPUT} placeholder="Calle Mayor" value={address.street} onChange={e => setAddress(p => ({ ...p, street: e.target.value }))} />
                          </div>
                          <div>
                            <label className={LABEL}>Número *</label>
                            <input className={INPUT} placeholder="24" value={address.number} onChange={e => setAddress(p => ({ ...p, number: e.target.value }))} />
                          </div>
                        </div>
                        <div>
                          <label className={LABEL}>Piso / Puerta</label>
                          <input className={INPUT} placeholder="3ºB" value={address.floor} onChange={e => setAddress(p => ({ ...p, floor: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={LABEL}>Código postal *</label>
                            <input className={INPUT} placeholder="28001" value={address.postalCode} onChange={e => setAddress(p => ({ ...p, postalCode: e.target.value }))} />
                          </div>
                          <div>
                            <label className={LABEL}>Ciudad *</label>
                            <input className={INPUT} placeholder="Madrid" value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} />
                          </div>
                        </div>
                        <div>
                          <label className={LABEL}>Notas de entrega</label>
                          <input className={INPUT} placeholder="Timbre no funciona, llamar al móvil" value={address.notes} onChange={e => setAddress(p => ({ ...p, notes: e.target.value }))} />
                        </div>
                        <button onClick={checkZone} disabled={checkingZone || !address.postalCode}
                          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-40">
                          <MapPin size={13} />
                          {checkingZone ? 'Comprobando…' : 'Comprobar zona de reparto'}
                        </button>
                        {zoneCheck && (
                          <div className={`rounded-xl px-3 py-2 text-sm ${zoneCheck.covered ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {zoneCheck.covered
                              ? `✓ Zona cubierta · Envío ${parseFloat(zoneCheck.zone?.deliveryFee ?? '0').toFixed(2)}€ · ~${zoneCheck.zone?.estimatedMinutes ?? 45} min`
                              : '✗ Lo sentimos, esta dirección no está en nuestra zona de reparto'}
                          </div>
                        )}
                      </div>
                    )}

                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={consentRgpd} onChange={e => setConsentRgpd(e.target.checked)}
                        className="mt-0.5 rounded" />
                      <span className="text-white/60 text-xs leading-relaxed">
                        Acepto el tratamiento de mis datos personales para gestionar mi pedido, de acuerdo con el RGPD (UE) 2016/679.
                      </span>
                    </label>
                  </div>
                )}

                {/* ── Step: Time ── */}
                {step === 'time' && (
                  <div className="px-5 py-6 space-y-4">
                    <button
                      onClick={() => setScheduledType('asap')}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${scheduledType === 'asap' ? '' : 'border-white/10'}`}
                      style={scheduledType === 'asap' ? { borderColor: accentColor, background: `${accentColor}15` } : {}}
                    >
                      <Clock size={20} className="text-white/70 shrink-0" />
                      <div className="text-left">
                        <p className="text-white font-bold">Lo antes posible</p>
                        <p className="text-white/50 text-sm">Tiempo estimado: ~{(cfg?.prepTimeMinutes ?? 30)} min</p>
                      </div>
                      {scheduledType === 'asap' && <CheckCircle size={18} className="ml-auto text-emerald-400" />}
                    </button>

                    <button
                      onClick={() => setScheduledType('scheduled')}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${scheduledType === 'scheduled' ? '' : 'border-white/10'}`}
                      style={scheduledType === 'scheduled' ? { borderColor: accentColor, background: `${accentColor}15` } : {}}
                    >
                      <Clock size={20} className="text-blue-400 shrink-0" />
                      <div className="text-left">
                        <p className="text-white font-bold">Programar hora</p>
                        <p className="text-white/50 text-sm">Hasta {cfg?.maxAdvanceHours ?? 48}h de antelación</p>
                      </div>
                      {scheduledType === 'scheduled' && <CheckCircle size={18} className="ml-auto text-emerald-400" />}
                    </button>

                    {scheduledType === 'scheduled' && (
                      <div>
                        <label className={LABEL}>Hora de recogida/entrega</label>
                        <input type="datetime-local" className={INPUT} min={minNow} max={maxFuture}
                          value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                      </div>
                    )}
                  </div>
                )}

                {/* ── Step: Payment ── */}
                {step === 'payment' && (
                  <div className="px-5 py-4 space-y-4">
                    {/* Order summary */}
                    <div className="bg-white/5 rounded-2xl p-4 space-y-2">
                      <p className="text-white/50 text-xs uppercase tracking-widest font-bold">Resumen</p>
                      {cart.map(item => (
                        <div key={`${item.productId}-${item.formatId}`} className="flex justify-between text-sm text-white/80">
                          <span>{item.quantity}× {item.productName}{item.formatName ? ` (${item.formatName})` : ''}</span>
                          <span className="font-mono">{(item.unitPrice * item.quantity).toFixed(2)}€</span>
                        </div>
                      ))}
                      {deliveryType === 'delivery' && deliveryFee > 0 && (
                        <div className="flex justify-between text-sm text-white/60 border-t border-white/10 pt-2">
                          <span>Gastos de envío</span>
                          <span className="font-mono">{deliveryFee.toFixed(2)}€</span>
                        </div>
                      )}
                      <div className="flex justify-between text-white font-black text-lg border-t border-white/10 pt-2">
                        <span>Total</span>
                        <span>{grandTotal.toFixed(2)}€</span>
                      </div>
                    </div>

                    {/* Payment methods */}
                    <p className="text-white/50 text-xs uppercase tracking-widest font-bold">Forma de pago</p>
                    <div className="space-y-2">
                      <button onClick={() => setPaymentMethod('online')}
                        className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${paymentMethod === 'online' ? 'border-violet-400' : 'border-white/10'}`}
                        style={paymentMethod === 'online' ? { background: 'rgba(139,92,246,0.15)' } : {}}>
                        <CreditCard size={18} className="text-violet-400 shrink-0" />
                        <div className="text-left">
                          <p className="text-white font-bold">💳 Tarjeta online</p>
                          <p className="text-white/50 text-xs">Pago seguro al hacer el pedido</p>
                        </div>
                        {paymentMethod === 'online' && <CheckCircle size={16} className="ml-auto text-emerald-400" />}
                      </button>

                      {deliveryType === 'takeaway' && (
                        <button onClick={() => setPaymentMethod('on_arrival')}
                          className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${paymentMethod === 'on_arrival' ? 'border-amber-400' : 'border-white/10'}`}>
                          <Banknote size={18} className="text-amber-400 shrink-0" />
                          <div className="text-left">
                            <p className="text-white font-bold">💵 Efectivo al recoger</p>
                            <p className="text-white/50 text-xs">Paga cuando recojas tu pedido</p>
                          </div>
                          {paymentMethod === 'on_arrival' && <CheckCircle size={16} className="ml-auto text-emerald-400" />}
                        </button>
                      )}

                      {deliveryType === 'delivery' && (
                        <button onClick={() => setPaymentMethod('on_delivery')}
                          className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${paymentMethod === 'on_delivery' ? 'border-amber-400' : 'border-white/10'}`}>
                          <Banknote size={18} className="text-amber-400 shrink-0" />
                          <div className="text-left">
                            <p className="text-white font-bold">💵 Efectivo al repartidor</p>
                            <p className="text-white/50 text-xs">Paga cuando te llegue el pedido</p>
                          </div>
                          {paymentMethod === 'on_delivery' && <CheckCircle size={16} className="ml-auto text-emerald-400" />}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Step: Success ── */}
                {step === 'success' && (
                  <div className="px-5 py-10 text-center space-y-6">
                    <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center bg-emerald-500/20">
                      <CheckCircle size={40} className="text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="text-white font-black text-2xl mb-2">¡Pedido realizado!</h2>
                      <div className="text-3xl font-black font-mono mb-1" style={{ color: accentColor }}>{orderNumber}</div>
                      <p className="text-white/50 text-sm">Guarda este número para hacer el seguimiento de tu pedido</p>
                    </div>
                    <div className="space-y-3">
                      <button
                        onClick={() => { setOpen(false); setStep('cart'); navigate(`/order-status/${orderNumber}`); }}
                        className="w-full py-4 rounded-2xl font-black text-white text-base"
                        style={{ backgroundColor: accentColor }}
                      >
                        Ver estado del pedido →
                      </button>
                      <button
                        onClick={() => { setOpen(false); setStep('cart'); }}
                        className="w-full py-3 rounded-2xl bg-white/10 text-white font-semibold text-sm hover:bg-white/20 transition-colors"
                      >
                        Volver a la carta
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer action button */}
              {step !== 'success' && (
                <div className="p-5 shrink-0 border-t border-white/10">
                  {step === 'cart' && (
                    <button
                      onClick={() => { loadCfg(); setStep('type'); }}
                      className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2"
                      style={{ backgroundColor: accentColor }}
                    >
                      Hacer pedido <ArrowRight size={18} />
                    </button>
                  )}
                  {step === 'type' && (
                    <button
                      onClick={() => setStep('details')}
                      disabled={cfg?.paused || (!cfg?.takeawayEnabled && !cfg?.deliveryEnabled)}
                      className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2 disabled:opacity-40"
                      style={{ backgroundColor: accentColor }}
                    >
                      Continuar <ArrowRight size={18} />
                    </button>
                  )}
                  {step === 'details' && (
                    <button
                      onClick={() => {
                        if (!clientName.trim()) { alert('El nombre es obligatorio'); return; }
                        if (!clientPhone.trim()) { alert('El teléfono es obligatorio'); return; }
                        if (!consentRgpd) { alert('Es necesario aceptar el tratamiento de datos'); return; }
                        if (deliveryType === 'delivery') {
                          if (!address.street || !address.number || !address.postalCode || !address.city) {
                            alert('Rellena la dirección de entrega completa'); return;
                          }
                          if (zoneCheck && !zoneCheck.covered) { alert('Esta dirección no está en zona de reparto'); return; }
                        }
                        setStep('time');
                      }}
                      className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2"
                      style={{ backgroundColor: accentColor }}
                    >
                      Continuar <ArrowRight size={18} />
                    </button>
                  )}
                  {step === 'time' && (
                    <button
                      onClick={() => {
                        if (scheduledType === 'scheduled' && !scheduledAt) { alert('Selecciona una hora'); return; }
                        setStep('payment');
                      }}
                      className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2"
                      style={{ backgroundColor: accentColor }}
                    >
                      Continuar <ArrowRight size={18} />
                    </button>
                  )}
                  {step === 'payment' && (
                    <button
                      onClick={placeOrder}
                      disabled={ordering}
                      className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ backgroundColor: accentColor }}
                    >
                      {ordering ? <><Loader2 size={18} className="animate-spin" /> Realizando pedido…</> : <>Realizar pedido · {grandTotal.toFixed(2)}€</>}
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
