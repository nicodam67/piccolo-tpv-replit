/**
 * TPV · Bandeja de Pedidos Online
 * Route: /online-orders
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft, RefreshCw, ShoppingBag, Truck, Clock, Phone,
  CheckCircle, XCircle, Package, CreditCard, ChevronDown, User,
} from 'lucide-react';
import { toast } from 'sonner';
import { customFetch } from '@workspace/api-client-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const api = (path: string, opts?: RequestInit) => customFetch(`${BASE}${path}`, opts);
const apiJSON = (path: string, method: string, body?: object) =>
  api(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrderItem { productName: string; quantity: number; unitPrice: string }
interface Address { street: string; number: string; floor?: string; city: string; postalCode: string; notes?: string }
interface Courier { id: string; name: string; phone: string; status: string }
interface OnlineOrder {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  deliveryType: string;
  clientName: string;
  clientPhone: string;
  estimatedReadyAt: string | null;
  scheduledAt: string | null;
  deliveryFee: string;
  onlinePaymentStatus: string;
  onlinePaymentRef: string | null;
  courierId: string | null;
  rejectionReason: string | null;
  packagingCheckedAt: string | null;
  notes: string;
  createdAt: string;
  items: OrderItem[];
  address: Address | null;
  courier: Courier | null;
  total: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending_confirm:  { label: 'Pendiente confirmación', color: '#f59e0b', bg: '#f59e0b20' },
  pending_payment:  { label: 'Esperando pago',         color: '#eab308', bg: '#eab30820' },
  paid:             { label: 'Pagado',                  color: '#60a5fa', bg: '#60a5fa20' },
  confirmed:        { label: 'Confirmado',              color: '#34d399', bg: '#34d39920' },
  sent_to_kitchen:  { label: 'En cocina',               color: '#34d399', bg: '#34d39920' },
  in_preparation:   { label: 'En preparación',          color: '#34d399', bg: '#34d39920' },
  ready_to_collect: { label: 'Listo para recoger',      color: '#2dd4bf', bg: '#2dd4bf20' },
  waiting_courier:  { label: 'Esperando repartidor',    color: '#a78bfa', bg: '#a78bfa20' },
  in_delivery:      { label: 'En camino',               color: '#818cf8', bg: '#818cf820' },
  delivered:        { label: 'Entregado',               color: '#4ade80', bg: '#4ade8020' },
  rejected:         { label: 'Rechazado',               color: '#f87171', bg: '#f8717120' },
  cancelled:        { label: 'Cancelado',               color: '#f87171', bg: '#f8717120' },
  not_collected:    { label: 'No recogido',             color: '#fb923c', bg: '#fb923c20' },
  incident:         { label: 'Incidencia',              color: '#fb923c', bg: '#fb923c20' },
};

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'pending_confirm', label: 'Pendientes' },
  { value: 'sent_to_kitchen', label: 'En cocina' },
  { value: 'ready_to_collect', label: 'Listos' },
  { value: 'in_delivery', label: 'En reparto' },
  { value: 'delivered', label: 'Entregados' },
  { value: 'rejected', label: 'Rechazados' },
];

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ── Confirm modal ──────────────────────────────────────────────────────────────

function ConfirmModal({ order, onClose, onDone }: { order: OnlineOrder; onClose: () => void; onDone: () => void }) {
  const [readyAt, setReadyAt] = useState(
    order.estimatedReadyAt ? new Date(order.estimatedReadyAt).toISOString().slice(0, 16) : ''
  );
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      await apiJSON(`/api/online-orders/${order.id}/confirm`, 'POST', {
        estimatedReadyAt: readyAt ? new Date(readyAt).toISOString() : undefined,
      });
      toast.success(`Pedido ${order.orderNumber} confirmado`);
      onDone();
      onClose();
    } catch { toast.error('Error al confirmar el pedido'); }
    finally { setLoading(false); }
  };

  return <Modal title={`Confirmar ${order.orderNumber}`} onClose={onClose}>
    <p className="text-sm text-zinc-400 mb-4">
      {order.clientName} · {order.deliveryType === 'delivery' ? '🛵 Reparto' : '🏪 Recogida'}
    </p>
    <label className="block text-xs text-zinc-400 uppercase tracking-widest mb-1">Listo a las</label>
    <input type="datetime-local" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white mb-4"
      value={readyAt} onChange={e => setReadyAt(e.target.value)} />
    <div className="flex gap-2 justify-end">
      <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancelar</button>
      <button onClick={handle} disabled={loading}
        className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl text-sm disabled:opacity-50">
        {loading ? 'Confirmando…' : 'Confirmar'}
      </button>
    </div>
  </Modal>;
}

// ── Reject modal ───────────────────────────────────────────────────────────────

function RejectModal({ order, onClose, onDone }: { order: OnlineOrder; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!reason.trim()) { toast.error('El motivo es obligatorio'); return; }
    setLoading(true);
    try {
      await apiJSON(`/api/online-orders/${order.id}/reject`, 'POST', { reason: reason.trim() });
      toast.success('Pedido rechazado');
      onDone(); onClose();
    } catch { toast.error('Error al rechazar el pedido'); }
    finally { setLoading(false); }
  };

  return <Modal title={`Rechazar ${order.orderNumber}`} onClose={onClose}>
    <label className="block text-xs text-zinc-400 uppercase tracking-widest mb-1">Motivo</label>
    <textarea rows={3} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white mb-4 resize-none"
      placeholder="Sin stock, cerrado, zona no cubierta…" value={reason} onChange={e => setReason(e.target.value)} />
    <div className="flex gap-2 justify-end">
      <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancelar</button>
      <button onClick={handle} disabled={loading}
        className="px-5 py-2 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl text-sm disabled:opacity-50">
        {loading ? 'Rechazando…' : 'Rechazar pedido'}
      </button>
    </div>
  </Modal>;
}

// ── Assign courier modal ───────────────────────────────────────────────────────

function AssignCourierModal({ order, onClose, onDone }: { order: OnlineOrder; onClose: () => void; onDone: () => void }) {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api('/api/admin/couriers').then((data: any) => setCouriers(data ?? []));
  }, []);

  const handle = async () => {
    if (!selected) { toast.error('Selecciona un repartidor'); return; }
    setLoading(true);
    try {
      await apiJSON(`/api/online-orders/${order.id}/assign-courier`, 'POST', { courierId: selected });
      toast.success('Repartidor asignado');
      onDone(); onClose();
    } catch { toast.error('Error al asignar repartidor'); }
    finally { setLoading(false); }
  };

  return <Modal title="Asignar repartidor" onClose={onClose}>
    <p className="text-sm text-zinc-400 mb-4">{order.orderNumber} · {order.clientName}</p>
    <select className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white mb-4"
      value={selected} onChange={e => setSelected(e.target.value)}>
      <option value="">Seleccionar repartidor…</option>
      {couriers.filter(c => c.status === 'available').map(c => (
        <option key={c.id} value={c.id}>{c.name} {c.phone ? `· ${c.phone}` : ''}</option>
      ))}
    </select>
    <div className="flex gap-2 justify-end">
      <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancelar</button>
      <button onClick={handle} disabled={loading || !selected}
        className="px-5 py-2 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl text-sm disabled:opacity-50">
        {loading ? 'Asignando…' : 'Asignar'}
      </button>
    </div>
  </Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-zinc-900 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-black text-lg mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({ order, onRefresh }: { order: OnlineOrder; onRefresh: () => void }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [actioning, setActioning] = useState(false);

  const meta = STATUS_META[order.status] ?? { label: order.status, color: '#a1a1aa', bg: '#a1a1aa20' };

  const changeStatus = async (status: string) => {
    setActioning(true);
    try {
      await apiJSON(`/api/online-orders/${order.id}/status`, 'PATCH', { status });
      toast.success('Estado actualizado');
      onRefresh();
    } catch { toast.error('Error al cambiar estado'); }
    finally { setActioning(false); }
  };

  const simulatePay = async () => {
    setActioning(true);
    try {
      await apiJSON(`/api/online-orders/${order.id}/payment-simulate`, 'POST', { approve: true });
      toast.success('Pago simulado correctamente');
      onRefresh();
    } catch { toast.error('Error en simulación'); }
    finally { setActioning(false); }
  };

  const packagingCheck = async () => {
    await apiJSON(`/api/online-orders/${order.id}/packaging-check`, 'POST');
    toast.success('Empaquetado revisado ✓');
    onRefresh();
  };

  const isDelivery = order.deliveryType === 'delivery';
  const canConfirm = ['pending_confirm', 'paid'].includes(order.status);
  const canReject = !['rejected', 'cancelled', 'delivered'].includes(order.status);
  const canAssign = isDelivery && ['ready_to_collect', 'waiting_courier'].includes(order.status) && !order.courierId;
  const canMarkDelivered = ['waiting_courier', 'in_delivery'].includes(order.status);
  const canSimulatePay = order.status === 'pending_payment';
  const canMarkPackaging = ['ready_to_collect', 'waiting_courier'].includes(order.status) && !order.packagingCheckedAt;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3 hover:border-zinc-700 transition-colors">
      {/* Header row */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-white">{order.orderNumber || `#${order.id.slice(0, 8)}`}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${isDelivery ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}`}>
              {isDelivery ? '🛵 Reparto' : '🏪 Recogida'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 uppercase">
              {order.channel}
            </span>
          </div>
          <div className="text-xs text-zinc-500 mt-0.5 font-mono">
            {fmt(order.createdAt)} {order.estimatedReadyAt ? `→ listo ~${fmt(order.estimatedReadyAt)}` : ''}
          </div>
        </div>
        <span className="px-2 py-1 rounded-lg text-[11px] font-black shrink-0"
          style={{ color: meta.color, background: meta.bg }}>
          {meta.label}
        </span>
      </div>

      {/* Client */}
      <div className="flex items-center gap-2">
        <User size={13} className="text-zinc-500 shrink-0" />
        <span className="text-sm font-semibold">{order.clientName}</span>
        {order.clientPhone && (
          <a href={`tel:${order.clientPhone}`} className="text-xs text-blue-400 flex items-center gap-1 ml-1">
            <Phone size={11} /> {order.clientPhone}
          </a>
        )}
      </div>

      {/* Address (delivery only) */}
      {isDelivery && order.address && (
        <div className="text-xs text-zinc-400 bg-zinc-800 rounded-xl px-3 py-2">
          📍 {order.address.street} {order.address.number}{order.address.floor ? `, ${order.address.floor}` : ''} · {order.address.postalCode} {order.address.city}
          {order.address.notes && <div className="text-zinc-500 mt-0.5">Nota: {order.address.notes}</div>}
        </div>
      )}

      {/* Items */}
      <div className="text-sm">
        {order.items.slice(0, 4).map((it, i) => (
          <div key={i} className="flex justify-between text-zinc-300">
            <span>{it.quantity}× {it.productName}</span>
            <span className="text-zinc-500 font-mono">{(parseFloat(it.unitPrice) * it.quantity).toFixed(2)}€</span>
          </div>
        ))}
        {order.items.length > 4 && <div className="text-zinc-500 text-xs mt-0.5">+{order.items.length - 4} más</div>}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
        <div className="text-xs text-zinc-500">
          {isDelivery && parseFloat(order.deliveryFee) > 0 && (
            <span>Envío: {parseFloat(order.deliveryFee).toFixed(2)}€ · </span>
          )}
          <span className={`font-bold ${order.onlinePaymentStatus === 'paid' ? 'text-emerald-400' : 'text-zinc-400'}`}>
            {order.onlinePaymentStatus === 'paid' ? '💳 Pagado online' : '💵 Pago en destino'}
          </span>
        </div>
        <span className="font-black text-white text-lg">{order.total}€</span>
      </div>

      {/* Courier */}
      {order.courier && (
        <div className="text-xs text-blue-400 flex items-center gap-1">
          🚴 {order.courier.name} {order.courier.phone && `· ${order.courier.phone}`}
        </div>
      )}

      {/* Packaging check */}
      {order.packagingCheckedAt && (
        <div className="text-xs text-emerald-400 flex items-center gap-1">
          <CheckCircle size={12} /> Empaquetado revisado a las {fmt(order.packagingCheckedAt)}
        </div>
      )}

      {/* Notes */}
      {order.notes && <div className="text-xs text-amber-400 bg-amber-500/10 rounded-xl px-3 py-1.5">📝 {order.notes}</div>}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {canConfirm && (
          <button onClick={() => setShowConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl text-xs">
            <CheckCircle size={13} /> Confirmar
          </button>
        )}
        {canReject && (
          <button onClick={() => setShowReject(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold rounded-xl text-xs">
            <XCircle size={13} /> Rechazar
          </button>
        )}
        {canAssign && (
          <button onClick={() => setShowAssign(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 font-bold rounded-xl text-xs">
            <Truck size={13} /> Asignar repartidor
          </button>
        )}
        {canMarkDelivered && (
          <button onClick={() => changeStatus('delivered')} disabled={actioning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold rounded-xl text-xs disabled:opacity-50">
            <CheckCircle size={13} /> Marcar entregado
          </button>
        )}
        {canMarkPackaging && (
          <button onClick={packagingCheck}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold rounded-xl text-xs">
            <Package size={13} /> Revisar empaquetado
          </button>
        )}
        {canSimulatePay && (
          <button onClick={simulatePay} disabled={actioning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 font-bold rounded-xl text-xs disabled:opacity-50">
            <CreditCard size={13} /> Simular pago
          </button>
        )}
      </div>

      {/* Modals */}
      {showConfirm && <ConfirmModal order={order} onClose={() => setShowConfirm(false)} onDone={onRefresh} />}
      {showReject && <RejectModal order={order} onClose={() => setShowReject(false)} onDone={onRefresh} />}
      {showAssign && <AssignCourierModal order={order} onClose={() => setShowAssign(false)} onDone={onRefresh} />}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnlineOrdersInbox() {
  const [, navigate] = useLocation();
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await api(`/api/online-orders?status=all`) as OnlineOrder[];
      setOrders(Array.isArray(data) ? data : []);
    } catch { toast.error('Error al cargar pedidos'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = orders.filter(o => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending_confirm') return ['pending_confirm', 'pending_payment', 'paid'].includes(o.status);
    if (statusFilter === 'sent_to_kitchen') return ['confirmed', 'sent_to_kitchen', 'in_preparation'].includes(o.status);
    return o.status === statusFilter;
  });

  const pendingCount = orders.filter(o => ['pending_confirm', 'pending_payment', 'paid'].includes(o.status)).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate('/admin')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors">
            <ArrowLeft size={17} />
          </button>
          <div className="flex-1">
            <h1 className="font-black text-xl flex items-center gap-2">
              Pedidos Online
              {pendingCount > 0 && (
                <span className="px-2 py-0.5 bg-amber-500 text-black text-xs font-black rounded-full animate-pulse">
                  {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
                </span>
              )}
            </h1>
            <p className="text-xs text-zinc-500">Actualización automática cada 15 segundos</p>
          </div>
          <button onClick={() => load()} disabled={refreshing}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors disabled:opacity-50">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Status filter */}
        <div className="flex gap-1 bg-zinc-900 rounded-2xl p-1 mb-5 overflow-x-auto">
          {STATUS_FILTERS.map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === f.value ? 'bg-amber-500/20 text-amber-400' : 'text-zinc-400 hover:text-white'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Orders */}
        {loading ? (
          <div className="text-center py-20 text-zinc-500">Cargando pedidos…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <ShoppingBag size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay pedidos {statusFilter !== 'all' ? 'con este estado' : ''}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(o => (
              <OrderCard key={o.id} order={o} onRefresh={() => load(true)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
