/**
 * Admin · Informes de Pedidos Online
 * Route: /admin/online-reports
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, TrendingUp, ShoppingBag, Truck, Star, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { customFetch } from '@workspace/api-client-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const api = (path: string) => customFetch(`${BASE}${path}`);

interface ReportData {
  periodo: { desde: string; hasta: string };
  totales: {
    pedidos: number;
    completados: number;
    cancelados: number;
    incidencias: number;
    ventaTotal: string;
    gastosEntrega: string;
    ticketMedio: string;
  };
  porCanal: Record<string, number>;
  porTipo: Record<string, number>;
  productosMasPedidos: Array<{ name: string; count: number }>;
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
      <div className="font-black text-2xl text-white">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-zinc-400 shrink-0 truncate capitalize">{label}</div>
      <div className="flex-1 bg-zinc-800 rounded-full h-2">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="w-8 text-right text-xs font-mono text-zinc-300 shrink-0">{value}</div>
    </div>
  );
}

const CHANNEL_LABELS: Record<string, string> = {
  qr: 'QR carta', web: 'Web', phone: 'Teléfono', tpv: 'TPV',
};

const CANAL_COLORS = ['#f59e0b', '#60a5fa', '#34d399', '#a78bfa', '#f87171'];

export default function OnlineReports() {
  const [, navigate] = useLocation();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [desde, setDesde] = useState(thirtyDaysAgo);
  const [hasta, setHasta] = useState(today);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api(`/api/admin/online-reports?desde=${desde}&hasta=${hasta}`) as ReportData;
      setReport(data);
    } catch { toast.error('Error al cargar informes'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const totalCanal = report ? Object.values(report.porCanal).reduce((a, b) => a + b, 0) : 1;
  const totalTipo = report ? Object.values(report.porTipo).reduce((a, b) => a + b, 0) : 1;
  const maxProducto = report ? Math.max(...report.productosMasPedidos.map(p => p.count), 1) : 1;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/admin')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors">
            <ArrowLeft size={17} />
          </button>
          <div className="flex-1">
            <h1 className="font-black text-xl">Informes Online</h1>
            <p className="text-xs text-zinc-500">Rendimiento de pedidos online</p>
          </div>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-3 bg-zinc-900 rounded-2xl p-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400 uppercase tracking-widest">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-sm text-white" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400 uppercase tracking-widest">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-sm text-white" />
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-sm disabled:opacity-50 ml-auto">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>

        {loading && !report ? (
          <div className="text-center py-20 text-zinc-500">Cargando informes…</div>
        ) : report ? (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total pedidos" value={report.totales.pedidos} icon={ShoppingBag} color="#f59e0b" />
              <StatCard label="Completados" value={report.totales.completados} icon={Star} color="#34d399" />
              <StatCard label="Cancelados" value={report.totales.cancelados} icon={ShoppingBag} color="#f87171" />
              <StatCard label="Incidencias" value={report.totales.incidencias} icon={TrendingUp} color="#fb923c" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard label="Venta total" value={`${parseFloat(report.totales.ventaTotal).toFixed(2)}€`} icon={TrendingUp} color="#60a5fa" />
              <StatCard label="Gastos de entrega" value={`${parseFloat(report.totales.gastosEntrega).toFixed(2)}€`} icon={Truck} color="#a78bfa" />
              <StatCard label="Ticket medio" value={`${parseFloat(report.totales.ticketMedio).toFixed(2)}€`} icon={Star} color="#2dd4bf" />
            </div>

            {/* Por canal */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h3 className="font-black text-base mb-4">Pedidos por canal</h3>
              <div className="space-y-3">
                {Object.entries(report.porCanal).map(([ch, n], i) => (
                  <MiniBar key={ch} label={CHANNEL_LABELS[ch] ?? ch} value={n} max={totalCanal} color={CANAL_COLORS[i % CANAL_COLORS.length]} />
                ))}
              </div>
            </div>

            {/* Por tipo */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h3 className="font-black text-base mb-4">Pedidos por tipo</h3>
              <div className="space-y-3">
                {Object.entries(report.porTipo).map(([type, n], i) => (
                  <MiniBar key={type} label={type === 'delivery' ? '🛵 Reparto' : '🏪 Recogida'} value={n} max={totalTipo} color={i === 0 ? '#60a5fa' : '#f59e0b'} />
                ))}
              </div>
            </div>

            {/* Top products */}
            {report.productosMasPedidos.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <h3 className="font-black text-base mb-4">Productos más pedidos</h3>
                <div className="space-y-2">
                  {report.productosMasPedidos.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-6 text-center font-mono text-xs text-zinc-500">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <MiniBar label={p.name} value={p.count} max={maxProducto} color="#34d399" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
