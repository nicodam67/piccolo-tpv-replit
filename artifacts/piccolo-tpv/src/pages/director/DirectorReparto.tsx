import { useState, useEffect } from "react";

interface DeliveryData {
  period: { from: string; to: string };
  summary: {
    total: string; pending: string; preparing: string; ready: string;
    out_for_delivery: string; delivered: string; failed: string;
    avg_delivery_min: string; total_delivery_fees: string;
  };
}

function fmt(n: number | string, d = 2) { return Number(n).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtEur(n: number | string) { return `${fmt(n)} €`; }

function periodParams(p: string) {
  const now = new Date(); const today = now.toISOString().slice(0, 10);
  if (p === "today") return `from=${today}&to=${today}`;
  if (p === "yesterday") { const y = new Date(now); y.setDate(now.getDate()-1); const ys = y.toISOString().slice(0,10); return `from=${ys}&to=${ys}`; }
  if (p === "week") { const d = now.getDay(); const s = new Date(now); s.setDate(now.getDate()-d); return `from=${s.toISOString().slice(0,10)}&to=${today}`; }
  return `from=${new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)}&to=${today}`;
}

export default function DirectorReparto() {
  const [period, setPeriod] = useState("today");
  const [data, setData]     = useState<DeliveryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/director/delivery?${periodParams(period)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  const s = data?.summary;
  const total = parseInt(s?.total ?? "0");
  const avgMin = parseFloat(s?.avg_delivery_min ?? "0");

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex gap-2 mb-5 flex-wrap">
        {[["today","Hoy"],["yesterday","Ayer"],["week","Semana"],["month","Mes"]].map(([id,label]) => (
          <button key={id} onClick={() => setPeriod(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>{label}</button>
        ))}
      </div>

      {loading && <div className="flex justify-center items-center h-32 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"/></div>}

      {data && !loading && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{total}</div>
              <div className="text-xs text-gray-400 mt-1">Pedidos reparto</div>
            </div>
            <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{s?.delivered ?? 0}</div>
              <div className="text-xs text-gray-400 mt-1">Entregados</div>
            </div>
            <div className={`border rounded-xl p-4 text-center ${avgMin > 45 ? "bg-red-900/30 border-red-800/50" : avgMin > 30 ? "bg-yellow-900/30 border-yellow-800/50" : "bg-emerald-900/30 border-emerald-800/50"}`}>
              <div className={`text-2xl font-bold ${avgMin > 45 ? "text-red-400" : avgMin > 30 ? "text-yellow-400" : "text-emerald-400"}`}>{fmt(avgMin, 0)} min</div>
              <div className="text-xs text-gray-400 mt-1">Tiempo medio entrega</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-xl font-bold text-white tabular-nums">{fmtEur(s?.total_delivery_fees ?? 0)}</div>
              <div className="text-xs text-gray-400 mt-1">Gastos de envío</div>
            </div>
          </div>

          {total > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Estado actual de pedidos</h3>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {[
                  { label: "Pendiente", value: s?.pending, color: "text-gray-400" },
                  { label: "Preparando", value: s?.preparing, color: "text-blue-400" },
                  { label: "Listo", value: s?.ready, color: "text-yellow-400" },
                  { label: "En camino", value: s?.out_for_delivery, color: "text-orange-400" },
                  { label: "Entregado", value: s?.delivered, color: "text-emerald-400" },
                  { label: "Fallido", value: s?.failed, color: "text-red-400" },
                ].map(item => (
                  <div key={item.label} className="text-center">
                    <div className={`text-2xl font-bold ${item.color}`}>{item.value ?? 0}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Success rate */}
              {parseInt(s?.delivered ?? "0") > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800 flex gap-6">
                  <div>
                    <div className="text-xs text-gray-400">Tasa de entrega</div>
                    <div className="text-lg font-bold text-emerald-400">{((parseInt(s?.delivered ?? "0") / Math.max(1, total)) * 100).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Tasa de fallo</div>
                    <div className={`text-lg font-bold ${parseInt(s?.failed ?? "0") > 0 ? "text-red-400" : "text-emerald-400"}`}>{((parseInt(s?.failed ?? "0") / Math.max(1, total)) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {total === 0 && (
            <div className="text-center py-16 text-gray-500">
              <div className="text-4xl mb-3">🛵</div>
              <p className="text-sm">Sin pedidos de reparto en este período</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
