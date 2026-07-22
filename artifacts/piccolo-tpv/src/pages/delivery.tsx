/**
 * Delivery — Centro de mando de reparto y recogida
 * Route: /delivery
 *
 * Tabs:
 *  - Board: Kanban de pedidos activos
 *  - Repartidores: Estado y asignación de couriers
 *  - Nuevo: Formulario de pedido manual (teléfono/mostrador)
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, Plus, RefreshCw, Phone, MapPin, Clock, Truck,
  User, Users, CheckCircle, XCircle, Package, Search, Loader2,
  AlertTriangle, Timer, CreditCard, Wallet, X, ChevronDown,
  LayoutGrid, UserCheck, ShoppingBag, Bike, Car, Hash,
} from "lucide-react";
import { toast } from "sonner";
import { api } from '../lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DeliveryOrder {
  id: string; orderNumber: string; status: string; channel: string;
  deliveryType: string; clientName: string; clientPhone: string;
  estimatedReadyAt: string | null; scheduledAt: string | null;
  deliveryFee: string; onlinePaymentStatus: string; courierId: string | null;
  notes: string; createdAt: string; total: string;
  address: { street: string; number: string; floor?: string; city: string; postalCode: string; notes?: string } | null;
  courier: { id: string; name: string; phone: string; status: string } | null;
  rejectionReason?: string | null;
}
interface Courier {
  id: string; name: string; phone: string; status: string; token: string;
  vehicleType?: string; plate?: string; zonaHabitual?: string;
  earnedCashPending?: string; earnedCardPending?: string; totalDeliveries?: number;
}
interface Zone { id: string; name: string; }
interface Product { id: string; name: string; price: string; active: boolean; outOfStock: boolean; }

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; col: string; dot: string }> = {
  pending_confirm:  { label: "Pendiente",     col: "bg-yellow-500/10 border-yellow-500/20", dot: "bg-yellow-400" },
  pending_payment:  { label: "Esperando pago",col: "bg-yellow-500/10 border-yellow-500/20", dot: "bg-yellow-600" },
  paid:             { label: "Pagado",         col: "bg-blue-500/10 border-blue-500/20",   dot: "bg-blue-400" },
  confirmed:        { label: "Confirmado",     col: "bg-green-500/10 border-green-500/20", dot: "bg-green-400" },
  sent_to_kitchen:  { label: "En cocina",      col: "bg-green-500/10 border-green-500/20", dot: "bg-green-500" },
  in_preparation:   { label: "En preparación", col: "bg-teal-500/10 border-teal-500/20",   dot: "bg-teal-400" },
  ready_to_collect: { label: "Preparado",      col: "bg-purple-500/10 border-purple-500/20", dot: "bg-purple-400" },
  waiting_courier:  { label: "Esperando repartidor", col: "bg-orange-500/10 border-orange-500/20", dot: "bg-orange-400" },
  in_delivery:      { label: "En reparto",     col: "bg-blue-600/10 border-blue-600/20",  dot: "bg-blue-500" },
  delivered:        { label: "Entregado",      col: "bg-muted/20 border-border",           dot: "bg-muted-foreground" },
  rejected:         { label: "Rechazado",      col: "bg-red-500/10 border-red-500/20",    dot: "bg-red-400" },
  cancelled:        { label: "Cancelado",      col: "bg-red-700/10 border-red-700/20",    dot: "bg-red-600" },
  incident:         { label: "Incidencia",     col: "bg-orange-600/10 border-orange-600/20", dot: "bg-orange-500" },
  not_collected:    { label: "No recogido",    col: "bg-orange-700/10 border-orange-700/20", dot: "bg-orange-600" },
};

const TERMINAL = ["delivered", "rejected", "cancelled", "not_collected"];
const KANBAN_COLS = [
  { id: "pending", label: "Pendientes", statuses: ["pending_confirm","pending_payment","paid","confirmed"] },
  { id: "kitchen", label: "Cocina",     statuses: ["sent_to_kitchen","in_preparation"] },
  { id: "ready",   label: "Preparado",  statuses: ["ready_to_collect","waiting_courier"] },
  { id: "going",   label: "En marcha",  statuses: ["in_delivery"] },
  { id: "done",    label: "Cerrados",   statuses: ["delivered","rejected","cancelled","not_collected","incident"] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
function minutesSince(ts: string) {
  return Math.round((Date.now() - new Date(ts).getTime()) / 60000);
}
function urgencyColor(mins: number, estimatedReadyAt: string | null): string {
  if (!estimatedReadyAt) return mins > 60 ? "text-red-400" : mins > 30 ? "text-orange-400" : "text-muted-foreground";
  const remaining = Math.round((new Date(estimatedReadyAt).getTime() - Date.now()) / 60000);
  return remaining < 0 ? "text-red-400" : remaining < 10 ? "text-orange-400" : "text-green-400";
}

// ── Order Card ────────────────────────────────────────────────────────────────
function OrderCard({ order, couriers, onRefresh, busy, onBusy }: {
  order: DeliveryOrder; couriers: Courier[];
  onRefresh: () => void; busy: boolean; onBusy: (id: string | null) => void;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const meta = STATUS_META[order.status] ?? { label: order.status, col: "bg-muted/20 border-border", dot: "bg-muted-foreground" };
  const isDelivery = order.deliveryType === "delivery";
  const mins = minutesSince(order.createdAt);

  const changeStatus = async (status: string) => {
    onBusy(order.id);
    try {
      await api.patch(`/api/delivery-orders/${order.id}`, { status });
      toast.success("Estado actualizado");
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
    finally { onBusy(null); }
  };

  const confirm = async () => {
    onBusy(order.id);
    try {
      await api.post(`/api/online-orders/${order.id}/confirm`, {});
      toast.success("Pedido confirmado");
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
    finally { onBusy(null); }
  };

  const assignCourier = async (courierId: string) => {
    onBusy(order.id);
    try {
      await api.post(`/api/online-orders/${order.id}/assign-courier`, { courierId });
      toast.success("Repartidor asignado");
      setShowAssign(false); onRefresh();
    } catch (e: any) { toast.error(e.message); }
    finally { onBusy(null); }
  };

  return (
    <div className={`bg-card border rounded-xl p-3.5 text-sm ${meta.col} ${TERMINAL.includes(order.status) ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
        <span className="font-black text-xs">{order.orderNumber || order.id.slice(0, 8)}</span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDelivery ? "bg-blue-500/20 text-blue-400" : "bg-amber-500/20 text-amber-400"}`}>
          {isDelivery ? "🛵 Reparto" : "🏪 Recogida"}
        </span>
        <span className={`ml-auto text-[10px] font-bold ${urgencyColor(mins, order.estimatedReadyAt)}`}>
          {fmtTime(order.estimatedReadyAt)}
        </span>
      </div>

      {/* Client */}
      <div className="flex items-center gap-1.5 mb-1">
        <User size={11} className="text-muted-foreground shrink-0" />
        <span className="font-bold truncate">{order.clientName}</span>
        {order.clientPhone && (
          <a href={`tel:${order.clientPhone}`} className="ml-auto text-blue-400 hover:text-blue-300">
            <Phone size={11} />
          </a>
        )}
      </div>

      {/* Address (delivery) */}
      {isDelivery && order.address && (
        <div className="text-[10px] text-muted-foreground flex items-start gap-1 mb-1">
          <MapPin size={9} className="shrink-0 mt-0.5" />
          <span className="truncate">{order.address.street} {order.address.number}, {order.address.city}</span>
        </div>
      )}

      {/* Courier */}
      {order.courier && (
        <div className="text-[10px] text-blue-400 flex items-center gap-1 mb-1">
          <Bike size={9} /> {order.courier.name}
        </div>
      )}

      {/* Total + payment */}
      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-current/10">
        <span className={`text-[10px] font-bold ${order.onlinePaymentStatus === "paid" ? "text-green-400" : "text-muted-foreground"}`}>
          {order.onlinePaymentStatus === "paid" ? "💳 Pagado" : "💵 En destino"}
        </span>
        <span className="font-black text-sm">{parseFloat(order.total).toFixed(2)}€</span>
      </div>

      {/* Actions */}
      {!TERMINAL.includes(order.status) && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {["pending_confirm","paid"].includes(order.status) && (
            <button onClick={confirm} disabled={busy}
              className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded-lg text-[10px] font-bold hover:bg-green-500/30 disabled:opacity-50 transition-colors">
              <CheckCircle size={10} /> Confirmar
            </button>
          )}
          {order.status === "in_preparation" && (
            <button onClick={() => changeStatus("ready_to_collect")} disabled={busy}
              className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-400 rounded-lg text-[10px] font-bold hover:bg-purple-500/30 disabled:opacity-50 transition-colors">
              <Package size={10} /> Listo
            </button>
          )}
          {isDelivery && ["ready_to_collect","waiting_courier"].includes(order.status) && !order.courierId && (
            <button onClick={() => setShowAssign(!showAssign)} disabled={busy}
              className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-[10px] font-bold hover:bg-blue-500/30 disabled:opacity-50 transition-colors">
              <Bike size={10} /> Asignar
            </button>
          )}
          {["waiting_courier","in_delivery"].includes(order.status) && (
            <button onClick={() => changeStatus("delivered")} disabled={busy}
              className="flex items-center gap-1 px-2 py-1 bg-green-600/20 text-green-400 rounded-lg text-[10px] font-bold hover:bg-green-600/30 disabled:opacity-50 transition-colors">
              <CheckCircle size={10} /> Entregado
            </button>
          )}
          {!["delivered","in_delivery"].includes(order.status) && (
            <button onClick={() => changeStatus("cancelled")} disabled={busy}
              className="flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-400 rounded-lg text-[10px] font-bold hover:bg-red-500/20 disabled:opacity-50 transition-colors">
              <X size={10} />
            </button>
          )}
        </div>
      )}

      {/* Courier assign dropdown */}
      {showAssign && (
        <div className="mt-2 border-t border-current/10 pt-2">
          <p className="text-[10px] text-muted-foreground mb-1">Asignar repartidor:</p>
          {couriers.filter(c => c.status === "available").map(c => (
            <button key={c.id} onClick={() => assignCourier(c.id)} disabled={busy}
              className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-secondary rounded-lg transition-colors flex items-center gap-1.5">
              <Bike size={10} className="text-blue-400" /> {c.name}
              {c.vehicleType && <span className="text-[9px] text-muted-foreground ml-auto">{c.vehicleType}</span>}
            </button>
          ))}
          {!couriers.filter(c => c.status === "available").length && (
            <p className="text-[10px] text-muted-foreground text-center py-1">Sin repartidores disponibles</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Courier Panel ─────────────────────────────────────────────────────────────
function CourierPanel({ couriers, activeOrders, onRefresh }: {
  couriers: Courier[]; activeOrders: DeliveryOrder[]; onRefresh: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [settlementForm, setSettlementForm] = useState({ tips: "0", expenses: "0", differences: "0", notes: "" });

  const updateStatus = async (id: string, status: string) => {
    setBusyId(id);
    try {
      await api.patch(`/api/admin/couriers/${id}`, { status });
      toast.success("Estado actualizado");
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const doSettle = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/api/admin/couriers/${id}/settle`, {
        tips: parseFloat(settlementForm.tips) || 0,
        expenses: parseFloat(settlementForm.expenses) || 0,
        differences: parseFloat(settlementForm.differences) || 0,
        notes: settlementForm.notes,
      });
      toast.success("Liquidación cerrada");
      setSettlementId(null);
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const STATUS_COLORS: Record<string, string> = {
    available: "bg-green-500/20 text-green-400 border-green-500/30",
    busy: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    off: "bg-muted/30 text-muted-foreground border-border",
    pause: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  const STATUS_LABELS: Record<string, string> = { available: "Disponible", busy: "Ocupado", off: "No disponible", pause: "Pausa" };

  return (
    <div className="space-y-3">
      {couriers.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Bike size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-semibold">Sin repartidores configurados</p>
          <p className="text-xs mt-1">Ve a <a href="/admin/repartidores" className="text-primary underline">Admin → Repartidores</a> para añadir</p>
        </div>
      )}
      {couriers.map(c => {
        const active = activeOrders.filter(o => o.courierId === c.id && !TERMINAL.includes(o.status));
        const cashPending = parseFloat(c.earnedCashPending ?? "0");
        const cardPending = parseFloat(c.earnedCardPending ?? "0");
        return (
          <div key={c.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center font-black text-sm shrink-0">
                {c.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{c.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${STATUS_COLORS[c.status] ?? STATUS_COLORS.off}`}>
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                  {c.vehicleType && <span className="text-[10px] text-muted-foreground">{c.vehicleType === "moto" ? "🛵" : c.vehicleType === "car" ? "🚗" : "🚲"} {c.plate}</span>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                  {c.phone && <span><Phone size={9} className="inline mr-0.5" />{c.phone}</span>}
                  <span>{active.length} activos</span>
                  {cashPending > 0 && <span className="text-green-400">💵 {cashPending.toFixed(2)}€</span>}
                  {cardPending > 0 && <span className="text-blue-400">💳 {cardPending.toFixed(2)}€</span>}
                </div>
                {active.length > 0 && (
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {active.map(o => (
                      <span key={o.id} className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-mono">{o.orderNumber}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <select value={c.status} onChange={e => updateStatus(c.id, e.target.value)} disabled={busyId === c.id}
                  className="bg-secondary border border-border rounded-lg px-2 py-1 text-[10px] focus:outline-none">
                  <option value="available">Disponible</option>
                  <option value="busy">Ocupado</option>
                  <option value="pause">Pausa</option>
                  <option value="off">No disponible</option>
                </select>
                <button onClick={() => setSettlementId(c.id)}
                  className="px-2 py-1 bg-secondary rounded-lg text-[10px] text-muted-foreground hover:text-foreground transition-colors border border-border">
                  Liquidar
                </button>
                <a href={`/driver/${c.id}#token=${encodeURIComponent(c.token)}`} target="_blank" rel="noreferrer"
                  className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-[10px] hover:bg-primary/20 transition-colors border border-primary/30">
                  Ver vista
                </a>
              </div>
            </div>

            {/* Settlement modal inline */}
            {settlementId === c.id && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs font-bold mb-2">Liquidar turno de {c.name}</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {([["Propinas (€)", "tips"], ["Gastos (€)", "expenses"], ["Diferencias (€)", "differences"]] as [string, keyof typeof settlementForm][]).map(([label, key]) => (
                    <div key={key}>
                      <label className="text-[9px] text-muted-foreground uppercase tracking-wider block mb-0.5">{label}</label>
                      <input type="number" step="0.01" value={settlementForm[key]}
                        onChange={e => setSettlementForm(p => ({ ...p, [key]: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-lg px-2 py-1 text-xs focus:outline-none" />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <label className="text-[9px] text-muted-foreground uppercase tracking-wider block mb-0.5">Notas</label>
                    <input value={settlementForm.notes} onChange={e => setSettlementForm(p => ({ ...p, notes: e.target.value }))}
                      className="w-full bg-secondary border border-border rounded-lg px-2 py-1 text-xs focus:outline-none" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSettlementId(null)} className="flex-1 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-secondary">Cancelar</button>
                  <button onClick={() => doSettle(c.id)} disabled={busyId === c.id}
                    className="flex-1 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1">
                    {busyId === c.id ? <Loader2 size={11} className="animate-spin" /> : null} Cerrar liquidación
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── New Order Form ────────────────────────────────────────────────────────────
function NewOrderForm({ couriers, zones, onCreated }: {
  couriers: Courier[]; zones: Zone[]; onCreated: () => void;
}) {
  const [form, setForm] = useState({
    deliveryType: "takeaway", channel: "phone",
    clientName: "", clientPhone: "",
    street: "", number: "", floor: "", postalCode: "", city: "", addrNotes: "",
    notes: "", paymentMethod: "on_arrival",
    courierId: "", scheduledAt: "", overrideDeliveryFee: "",
  });
  const [items, setItems] = useState<Array<{ productId: string; productName: string; quantity: number; unitPrice: string; notes: string }>>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [zoneInfo, setZoneInfo] = useState<{ covered: boolean; fee: string; zone?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Product search
  useEffect(() => {
    if (productSearch.length < 2) { setProductResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const data = await api.get(`/api/products?q=${encodeURIComponent(productSearch)}&limit=8`);
        setProductResults(Array.isArray(data) ? data.filter((p: Product) => p.active && !p.outOfStock) : []);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  // Zone check on postal code change
  useEffect(() => {
    if (form.deliveryType !== "delivery" || !form.postalCode) { setZoneInfo(null); return; }
    const t = setTimeout(async () => {
      try {
        const data = await api.post<{ covered: boolean; zone?: { deliveryFee: string; name: string } }>("/api/public/check-zone", { postalCode: form.postalCode, city: form.city });
        setZoneInfo({ covered: data.covered, fee: data.zone?.deliveryFee ?? "0", zone: data.zone?.name });
      } catch { setZoneInfo(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [form.postalCode, form.city, form.deliveryType]);

  const addProduct = (p: Product) => {
    setItems(prev => {
      const existing = prev.findIndex(i => i.productId === p.id);
      if (existing >= 0) {
        return prev.map((i, idx) => idx === existing ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { productId: p.id, productName: p.name, quantity: 1, unitPrice: p.price, notes: "" }];
    });
    setProductSearch(""); setProductResults([]);
  };
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateQty = (idx: number, q: number) => setItems(prev => prev.map((i, n) => n === idx ? { ...i, quantity: Math.max(1, q) } : i));

  const subtotal = items.reduce((s, i) => s + parseFloat(i.unitPrice) * i.quantity, 0);
  const deliveryFee = form.overrideDeliveryFee ? parseFloat(form.overrideDeliveryFee) : parseFloat(zoneInfo?.fee ?? "0");
  const total = subtotal + (form.deliveryType === "delivery" ? deliveryFee : 0);

  const handleSubmit = async () => {
    if (!form.clientName.trim()) { toast.error("Nombre del cliente requerido"); return; }
    if (items.length === 0) { toast.error("Añade al menos un producto"); return; }
    setBusy(true);
    try {
      const body: any = {
        deliveryType: form.deliveryType, channel: form.channel,
        clientName: form.clientName, clientPhone: form.clientPhone,
        notes: form.notes, paymentMethod: form.paymentMethod,
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity, notes: i.notes })),
      };
      if (form.deliveryType === "delivery") {
        body.deliveryAddress = { street: form.street, number: form.number, floor: form.floor, postalCode: form.postalCode, city: form.city, notes: form.addrNotes };
        if (form.overrideDeliveryFee) body.overrideDeliveryFee = parseFloat(form.overrideDeliveryFee);
      }
      if (form.courierId) body.courierId = form.courierId;
      if (form.scheduledAt) body.scheduledAt = new Date(form.scheduledAt).toISOString();

      const result = await api.post<{ orderNumber: string }>("/api/delivery-orders", body);
      toast.success(`Pedido ${result.orderNumber} creado`);
      setForm({ deliveryType: "takeaway", channel: "phone", clientName: "", clientPhone: "", street: "", number: "", floor: "", postalCode: "", city: "", addrNotes: "", notes: "", paymentMethod: "on_arrival", courierId: "", scheduledAt: "", overrideDeliveryFee: "" });
      setItems([]); setZoneInfo(null); onCreated();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const inputCls = "w-full bg-secondary/50 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/60";
  const labelCls = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block";

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Type + Channel */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Tipo</label>
          <select value={form.deliveryType} onChange={e => f("deliveryType", e.target.value)} className={inputCls}>
            <option value="takeaway">🏪 Recogida</option>
            <option value="delivery">🛵 Reparto</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Canal</label>
          <select value={form.channel} onChange={e => f("channel", e.target.value)} className={inputCls}>
            <option value="phone">📞 Teléfono</option>
            <option value="counter">🏪 Mostrador</option>
            <option value="tpv">💻 TPV</option>
          </select>
        </div>
      </div>

      {/* Client */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Nombre *</label>
          <input type="text" value={form.clientName} onChange={e => f("clientName", e.target.value)} placeholder="Nombre del cliente" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Teléfono</label>
          <input type="tel" value={form.clientPhone} onChange={e => f("clientPhone", e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Address (delivery only) */}
      {form.deliveryType === "delivery" && (
        <div className="space-y-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Dirección de entrega</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2"><input type="text" value={form.street} onChange={e => f("street", e.target.value)} placeholder="Calle" className={inputCls} /></div>
            <div><input type="text" value={form.number} onChange={e => f("number", e.target.value)} placeholder="Nº" className={inputCls} /></div>
            <div><input type="text" value={form.floor} onChange={e => f("floor", e.target.value)} placeholder="Piso/Pta" className={inputCls} /></div>
            <div><input type="text" value={form.postalCode} onChange={e => f("postalCode", e.target.value)} placeholder="CP" className={inputCls} /></div>
            <div><input type="text" value={form.city} onChange={e => f("city", e.target.value)} placeholder="Ciudad" className={inputCls} /></div>
            <div className="col-span-3"><input type="text" value={form.addrNotes} onChange={e => f("addrNotes", e.target.value)} placeholder="Instrucciones de acceso" className={inputCls} /></div>
          </div>
          {zoneInfo && (
            <div className={`text-[11px] font-bold px-2 py-1 rounded-lg ${zoneInfo.covered ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"}`}>
              {zoneInfo.covered ? `✓ ${zoneInfo.zone} — Envío: ${parseFloat(zoneInfo.fee).toFixed(2)}€` : "⚠ Fuera de zona — se puede forzar indicando tarifa manualmente"}
            </div>
          )}
          <div>
            <label className={labelCls}>Tarifa envío (€) — dejar vacío para usar zona</label>
            <input type="number" step="0.50" value={form.overrideDeliveryFee} onChange={e => f("overrideDeliveryFee", e.target.value)} placeholder={zoneInfo?.fee ?? "0.00"} className={inputCls} />
          </div>
        </div>
      )}

      {/* Products */}
      <div>
        <label className={labelCls}>Productos</label>
        <div className="relative mb-2">
          <div className="flex items-center gap-2 bg-secondary/50 border border-border rounded-xl px-3 py-2">
            <Search size={12} className="text-muted-foreground shrink-0" />
            <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Buscar producto..."
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/50" />
            {productSearch && <button onClick={() => { setProductSearch(""); setProductResults([]); }}><X size={12} className="text-muted-foreground" /></button>}
          </div>
          {productResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl z-20 overflow-hidden max-h-48 overflow-y-auto">
              {productResults.map(p => (
                <button key={p.id} onClick={() => addProduct(p)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary transition-colors text-left">
                  <span className="text-sm">{p.name}</span>
                  <span className="text-xs font-bold text-primary">{parseFloat(p.price).toFixed(2)}€</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {items.length > 0 && (
          <div className="space-y-1">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-secondary/30 rounded-xl px-3 py-2">
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(idx, item.quantity - 1)} className="w-5 h-5 flex items-center justify-center rounded bg-secondary hover:bg-border text-xs font-bold">−</button>
                  <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                  <button onClick={() => updateQty(idx, item.quantity + 1)} className="w-5 h-5 flex items-center justify-center rounded bg-secondary hover:bg-border text-xs font-bold">+</button>
                </div>
                <span className="flex-1 text-sm">{item.productName}</span>
                <span className="text-xs text-muted-foreground font-mono">{(parseFloat(item.unitPrice) * item.quantity).toFixed(2)}€</span>
                <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive transition-colors"><X size={12} /></button>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 bg-secondary/20 rounded-xl border border-border/50">
              <span className="text-xs text-muted-foreground">Total estimado</span>
              <span className="font-black">{total.toFixed(2)}€</span>
            </div>
          </div>
        )}
      </div>

      {/* Payment + Courier */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Pago</label>
          <select value={form.paymentMethod} onChange={e => f("paymentMethod", e.target.value)} className={inputCls}>
            <option value="on_arrival">Al recoger</option>
            <option value="on_delivery">Al repartidor</option>
            <option value="cash">Efectivo</option>
            <option value="card">Tarjeta</option>
            <option value="bizum">Bizum</option>
            <option value="online">Online (pagado)</option>
          </select>
        </div>
        {form.deliveryType === "delivery" && (
          <div>
            <label className={labelCls}>Repartidor</label>
            <select value={form.courierId} onChange={e => f("courierId", e.target.value)} className={inputCls}>
              <option value="">Sin asignar</option>
              {couriers.filter(c => c.status === "available").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>Programar para</label>
        <input type="datetime-local" value={form.scheduledAt} onChange={e => f("scheduledAt", e.target.value)} className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Observaciones</label>
        <textarea rows={2} value={form.notes} onChange={e => f("notes", e.target.value)} placeholder="Instrucciones especiales..." className={`${inputCls} resize-none`} />
      </div>

      <button onClick={handleSubmit} disabled={busy || items.length === 0}
        className="w-full py-3 bg-primary text-primary-foreground font-black rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        Crear pedido
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = "board" | "couriers" | "new";

export default function DeliveryPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("board");
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("active");

  const load = useCallback(async () => {
    try {
      const [ordData, courierData] = await Promise.all([
        api.get(`/api/delivery-orders?${filterStatus === "active" ? "" : `status=${filterStatus}`}`).catch(() => []),
        api.get("/api/admin/couriers").catch(() => []),
      ]);
      setOrders(Array.isArray(ordData) ? ordData : []);
      setCouriers(Array.isArray(courierData) ? courierData : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20_000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const activeOrders = useMemo(() => orders.filter(o => !TERMINAL.includes(o.status)), [orders]);
  const pendingCount = useMemo(() => orders.filter(o => ["pending_confirm","pending_payment","paid"].includes(o.status)).length, [orders]);
  const waitingCourierCount = useMemo(() => orders.filter(o => ["ready_to_collect","waiting_courier"].includes(o.status) && o.deliveryType === "delivery" && !o.courierId).length, [orders]);

  const kanbanFiltered = useMemo(() => {
    if (filterStatus === "all") return orders;
    if (filterStatus === "active") return orders.filter(o => !TERMINAL.includes(o.status));
    return orders.filter(o => o.status === filterStatus);
  }, [orders, filterStatus]);

  const kanbanCols = useMemo(() => {
    return KANBAN_COLS.map(col => ({
      ...col,
      orders: kanbanFiltered.filter(o => col.statuses.includes(o.status)),
    })).filter(col => col.id !== "done" || filterStatus === "all");
  }, [kanbanFiltered, filterStatus]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 flex items-center px-4 gap-3 border-b border-border bg-card shrink-0">
        <button onClick={() => setLocation("/tables")}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
          <ChevronLeft size={20} />
        </button>
        <Truck size={16} className="text-muted-foreground" />
        <h1 className="font-black text-base">Reparto y Recogida</h1>
        <div className="flex-1 flex items-center gap-2 text-xs text-muted-foreground overflow-hidden">
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 bg-yellow-500 text-black font-black rounded-full animate-pulse text-[10px]">
              {pendingCount} pendiente{pendingCount > 1 ? "s" : ""}
            </span>
          )}
          {waitingCourierCount > 0 && (
            <span className="px-2 py-0.5 bg-orange-500 text-white font-bold rounded-full text-[10px]">
              {waitingCourierCount} sin repartidor
            </span>
          )}
        </div>
        <button onClick={load} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground">
          <RefreshCw size={15} />
        </button>
        <button onClick={() => { setTab("new"); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground font-black rounded-xl text-xs shadow-md hover:opacity-90 active:scale-95 transition-all">
          <Plus size={14} /> Pedido
        </button>
      </header>

      {/* Tabs */}
      <div className="bg-card border-b border-border flex shrink-0">
        {([["board","Board",<LayoutGrid size={13} />],["couriers","Repartidores",<Bike size={13} />],["new","Nuevo pedido",<Plus size={13} />]] as [Tab, string, React.ReactNode][]).map(([t, label, icon]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors relative ${tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {icon} {label}
            {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
          </button>
        ))}
      </div>

      {/* ── BOARD ───────────────────────────────────────────────────────────── */}
      {tab === "board" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filter bar */}
          <div className="px-4 py-2 border-b border-border bg-card shrink-0 flex items-center gap-2 overflow-x-auto">
            {[["active","Activos"],["all","Todos"],["pending_confirm","Pendientes"],["in_delivery","En reparto"],["delivered","Entregados"]].map(([v, l]) => (
              <button key={v} onClick={() => setFilterStatus(v)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${filterStatus === v ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                {l}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center flex-1"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="flex-1 overflow-x-auto">
              <div className="flex h-full gap-3 p-4 min-w-max">
                {kanbanCols.map(col => (
                  <div key={col.id} className="w-72 flex flex-col">
                    <div className="flex items-center gap-2 mb-2.5 px-1">
                      <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">{col.label}</h3>
                      <span className="ml-auto text-xs font-bold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">{col.orders.length}</span>
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                      {col.orders.length === 0 && (
                        <div className="text-center text-muted-foreground/30 py-6 text-xs">—</div>
                      )}
                      {col.orders.map(o => (
                        <OrderCard key={o.id} order={o} couriers={couriers}
                          onRefresh={load} busy={busyId === o.id}
                          onBusy={setBusyId}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── COURIERS ────────────────────────────────────────────────────────── */}
      {tab === "couriers" && (
        <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-black text-sm">Repartidores</h2>
              <p className="text-[11px] text-muted-foreground">{couriers.filter(c => c.status === "available").length} disponibles · {couriers.filter(c => c.status === "busy").length} ocupados</p>
            </div>
            <a href="/admin/repartidores" className="text-xs text-primary hover:underline">Gestionar →</a>
          </div>
          <CourierPanel couriers={couriers} activeOrders={activeOrders} onRefresh={load} />
        </div>
      )}

      {/* ── NEW ORDER ───────────────────────────────────────────────────────── */}
      {tab === "new" && (
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="font-black text-sm mb-4">Nuevo pedido de reparto / recogida</h2>
          <NewOrderForm couriers={couriers} zones={zones} onCreated={() => { load(); setTab("board"); }} />
        </div>
      )}
    </div>
  );
}
