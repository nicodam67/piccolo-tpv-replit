/**
 * Driver View — Vista del repartidor
 * Route: /driver/:courierId
 * No auth required — open page for couriers.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'wouter';
import { Phone, MapPin, Package, CheckCircle, Truck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { customFetch, ApiError } from '@workspace/api-client-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const api = (path: string) => customFetch(`${BASE}${path}`);
const apiJSON = (path: string, method: string, body?: object) =>
  customFetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

interface Address {
  street: string;
  number: string;
  floor?: string;
  city: string;
  postalCode: string;
  notes?: string;
}

interface DeliveryItem {
  productName: string;
  quantity: number;
  unitPrice: string;
}

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  status: string;
  clientName: string;
  clientPhone: string;
  estimatedReadyAt: string | null;
  address: Address | null;
  items: DeliveryItem[];
  total: string;
  onlinePaymentStatus: string;
  deliveryFee: string;
  notes: string;
  createdAt: string;
}

export default function DriverView() {
  const params = useParams<{ courierId: string }>();
  const courierId = params.courierId;
  // Token comes from query string: /driver/:courierId?token=...
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api(`/api/courier/${courierId}/deliveries?token=${encodeURIComponent(token)}`) as DeliveryOrder[];
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthError(true);
        return;
      }
      toast.error('Error al cargar entregas');
    } finally { setLoading(false); }
  }, [courierId, token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const changeStatus = async (orderId: string, status: string) => {
    setActioning(orderId);
    try {
      await apiJSON(`/api/courier/${courierId}/orders/${orderId}/status?token=${encodeURIComponent(token)}`, 'PATCH', { status });
      toast.success(status === 'in_delivery' ? '¡En camino!' : '¡Entregado!');
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { setAuthError(true); return; }
      toast.error('Error al actualizar estado');
    } finally { setActioning(null); }
  };

  if (authError) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <Truck size={48} className="mx-auto mb-4 text-red-400 opacity-60" />
          <p className="text-white font-bold text-lg mb-2">Acceso no autorizado</p>
          <p className="text-gray-400 text-sm">El enlace de repartidor no es válido o ha expirado.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <Truck size={48} className="mx-auto mb-4 text-blue-400 opacity-60" />
          <p className="text-gray-400">Cargando entregas…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-5">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center">
              <Truck size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="font-black text-lg">Mi ruta</h1>
              <p className="text-xs text-gray-500">{orders.length} entrega{orders.length !== 1 ? 's' : ''} pendiente{orders.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={load} className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {orders.length === 0 ? (
          <div className="text-center py-20">
            <CheckCircle size={48} className="mx-auto mb-4 text-emerald-400 opacity-60" />
            <p className="text-gray-400 text-lg font-bold">¡Sin entregas pendientes!</p>
            <p className="text-gray-600 text-sm mt-1">Vuelve a comprobarlo en unos minutos.</p>
          </div>
        ) : orders.map(order => {
          const isPaid = order.onlinePaymentStatus === 'paid';
          const isInDelivery = order.status === 'in_delivery';
          const collectAmount = !isPaid ? parseFloat(order.total) : 0;

          return (
            <div key={order.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              {/* Card header */}
              <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
                <span className="font-black text-white">{order.orderNumber || `#${order.id.slice(0, 8)}`}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-black ${
                  isInDelivery ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {isInDelivery ? '🛵 En camino' : '⏳ Esperando'}
                </span>
              </div>

              <div className="p-4 space-y-4">
                {/* Client */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg">{order.clientName}</p>
                  </div>
                  <a href={`tel:${order.clientPhone}`}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl text-sm transition-colors">
                    <Phone size={16} />
                    Llamar
                  </a>
                </div>

                {/* Address */}
                {order.address ? (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      `${order.address.street} ${order.address.number}, ${order.address.postalCode} ${order.address.city}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3"
                  >
                    <MapPin size={18} className="text-blue-400 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <div className="font-bold text-white">
                        {order.address.street} {order.address.number}
                        {order.address.floor ? `, ${order.address.floor}` : ''}
                      </div>
                      <div className="text-gray-400">{order.address.postalCode} {order.address.city}</div>
                      {order.address.notes && (
                        <div className="text-amber-400 mt-1 text-xs">📝 {order.address.notes}</div>
                      )}
                    </div>
                    <span className="text-blue-400 text-xs ml-auto shrink-0">Ver mapa →</span>
                  </a>
                ) : (
                  <div className="text-gray-500 text-sm italic">Sin dirección registrada</div>
                )}

                {/* Items */}
                <div className="space-y-1">
                  {order.items.map((it, i) => (
                    <div key={i} className="flex justify-between text-sm text-gray-300">
                      <span>{it.quantity}× {it.productName}</span>
                      <span className="text-gray-500 font-mono">{(parseFloat(it.unitPrice) * it.quantity).toFixed(2)}€</span>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                {order.notes && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-sm text-amber-400">
                    📝 {order.notes}
                  </div>
                )}

                {/* Total */}
                <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
                  <div>
                    <div className="text-xs text-gray-500">
                      {isPaid ? '✅ Pagado con tarjeta online' : '💵 Cobrar en efectivo'}
                    </div>
                    {!isPaid && (
                      <div className="font-black text-2xl text-white mt-0.5">
                        {collectAmount.toFixed(2)} €
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Total pedido</div>
                    <div className={`font-black text-lg ${isPaid ? 'text-emerald-400' : 'text-white'}`}>
                      {order.total} €
                    </div>
                    {parseFloat(order.deliveryFee) > 0 && (
                      <div className="text-xs text-gray-500">inc. {order.deliveryFee}€ envío</div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-3">
                  {!isInDelivery && (
                    <button
                      onClick={() => changeStatus(order.id, 'in_delivery')}
                      disabled={actioning === order.id}
                      className="flex items-center justify-center gap-2 py-4 bg-blue-500 hover:bg-blue-400 text-white font-black rounded-xl text-base transition-colors disabled:opacity-50"
                    >
                      <Truck size={20} />
                      En camino
                    </button>
                  )}
                  <button
                    onClick={() => changeStatus(order.id, 'delivered')}
                    disabled={actioning === order.id}
                    className={`flex items-center justify-center gap-2 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-xl text-base transition-colors disabled:opacity-50 ${!isInDelivery ? '' : 'col-span-2'}`}
                  >
                    <CheckCircle size={20} />
                    Entregado
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
