/**
 * Public Order Status Page
 * Route: /order-status/:orderNumber
 * No auth required.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import { Clock, CheckCircle, ChefHat, Package, Truck, Star, XCircle, RefreshCw } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface OrderStatus {
  orderNumber: string;
  status: string;
  deliveryType: string;
  estimatedReadyAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
}

interface BrandingLight {
  nombreComercial?: string;
  accentColor?: string;
  logoUrl?: string;
}

const STAGES_PICKUP = [
  { key: ['pending_confirm', 'pending_payment', 'paid'], label: 'Pedido recibido', icon: Clock },
  { key: ['confirmed', 'sent_to_kitchen', 'in_preparation'], label: 'En preparación', icon: ChefHat },
  { key: ['ready_to_collect'], label: '¡Listo para recoger!', icon: Package },
  { key: ['delivered', 'paid'], label: '¡Entregado!', icon: Star },
];

const STAGES_DELIVERY = [
  { key: ['pending_confirm', 'pending_payment', 'paid'], label: 'Pedido recibido', icon: Clock },
  { key: ['confirmed', 'sent_to_kitchen', 'in_preparation'], label: 'En preparación', icon: ChefHat },
  { key: ['ready_to_collect', 'waiting_courier'], label: 'Buscando repartidor', icon: Package },
  { key: ['in_delivery'], label: '¡En camino!', icon: Truck },
  { key: ['delivered'], label: '¡Entregado!', icon: Star },
];

const CANCELLED_STATUSES = ['rejected', 'cancelled', 'not_collected', 'incident'];

function getStageIndex(status: string, stages: typeof STAGES_PICKUP): number {
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].key.includes(status)) return i;
  }
  return 0;
}

function fmt(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export default function OrderStatusPage() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = params.orderNumber;
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [branding, setBranding] = useState<BrandingLight>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = async () => {
    try {
      const res = await fetch(`${BASE}/api/public/order-status/${orderNumber}`);
      if (!res.ok) { setError('Pedido no encontrado.'); return; }
      const data = await res.json();
      setOrder(data);
      setLastRefresh(new Date());
    } catch { setError('Error al cargar el estado del pedido.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetch(`${BASE}/api/public/branding`).then(r => r.json()).then(setBranding).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [orderNumber]);

  const accentColor = branding.accentColor ?? '#ef4444';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <XCircle size={48} className="mx-auto mb-4 text-red-400" />
          <h2 className="font-black text-xl text-gray-900 dark:text-white mb-2">Pedido no encontrado</h2>
          <p className="text-gray-500 text-sm">{error || 'No pudimos encontrar tu pedido. Comprueba el número e inténtalo de nuevo.'}</p>
        </div>
      </div>
    );
  }

  const isCancelled = CANCELLED_STATUSES.includes(order.status);
  const stages = order.deliveryType === 'delivery' ? STAGES_DELIVERY : STAGES_PICKUP;
  const stageIndex = getStageIndex(order.status, stages);
  const currentStage = stages[stageIndex];
  const Icon = currentStage?.icon ?? Clock;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-white">
      {/* Brand header */}
      <div className="text-center py-6 px-4 border-b border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.nombreComercial} className="h-10 mx-auto mb-2 object-contain" />
        ) : (
          <div className="text-2xl font-black mb-1" style={{ color: accentColor }}>
            {branding.nombreComercial || 'Mi Restaurante'}
          </div>
        )}
        <p className="text-xs text-gray-400 dark:text-zinc-500">Estado de tu pedido</p>
      </div>

      <div className="max-w-md mx-auto px-4 py-8">
        {/* Order number */}
        <div className="text-center mb-8">
          <div className="text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1">Pedido</div>
          <div className="font-black text-3xl" style={{ color: accentColor }}>{order.orderNumber}</div>
          {order.deliveryType === 'delivery' ? (
            <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/15 text-blue-500">🛵 Reparto a domicilio</span>
          ) : (
            <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-500">🏪 Recogida en local</span>
          )}
        </div>

        {/* Cancelled state */}
        {isCancelled ? (
          <div className="text-center bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 mb-6">
            <XCircle size={48} className="mx-auto mb-3 text-red-400" />
            <h2 className="font-black text-xl text-red-600 dark:text-red-400 mb-1">Pedido cancelado</h2>
            <p className="text-sm text-red-500 dark:text-red-400">
              {order.status === 'not_collected' ? 'El pedido no fue recogido en el tiempo establecido.' : 'Tu pedido ha sido cancelado. Contacta con el restaurante si tienes dudas.'}
            </p>
          </div>
        ) : (
          <>
            {/* Current status hero */}
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: `${accentColor}20` }}>
                <Icon size={36} style={{ color: accentColor }} />
              </div>
              <h2 className="font-black text-2xl">{currentStage?.label ?? order.status}</h2>
              {order.estimatedReadyAt && (
                <p className="text-gray-500 dark:text-zinc-400 text-sm mt-2">
                  Hora estimada: <strong>{fmt(order.estimatedReadyAt)}</strong>
                </p>
              )}
            </div>

            {/* Progress steps */}
            <div className="mb-8">
              {stages.map((stage, i) => {
                const done = i <= stageIndex;
                const current = i === stageIndex;
                const StageIcon = stage.icon;

                return (
                  <div key={i} className="flex items-start gap-3 mb-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                        done
                          ? current ? 'shadow-lg' : 'bg-emerald-100 dark:bg-emerald-900/30'
                          : 'bg-gray-100 dark:bg-zinc-800'
                      }`}
                        style={current ? { backgroundColor: `${accentColor}25`, boxShadow: `0 0 0 3px ${accentColor}40` } : {}}>
                        {done && !current ? (
                          <CheckCircle size={18} className="text-emerald-500" />
                        ) : (
                          <StageIcon size={18} style={{ color: current ? accentColor : '#9ca3af' }} />
                        )}
                      </div>
                      {i < stages.length - 1 && (
                        <div className={`w-0.5 h-6 mt-1 ${done && i < stageIndex ? 'bg-emerald-400' : 'bg-gray-200 dark:bg-zinc-700'}`} />
                      )}
                    </div>
                    <div className="pt-1.5">
                      <p className={`text-sm font-bold ${current ? 'text-gray-900 dark:text-white' : done ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-zinc-500'}`}>
                        {stage.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Refresh info */}
        <div className="text-center">
          <button onClick={load} className="flex items-center gap-2 mx-auto text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors">
            <RefreshCw size={11} />
            Actualizado a las {fmt(lastRefresh.toISOString())}
          </button>
        </div>
      </div>
    </div>
  );
}
