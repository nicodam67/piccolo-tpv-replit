import { useState, useEffect } from "react";

interface KitchenData {
  period: { from: string; to: string };
  summary: { total: string; pending: string; preparing: string; ready: string; collected: string; avg_prep_min: string; delayed: string };
  byStation: { prep_zone: string; total: string; avg_prep_min: string }[];
  delayed: { id: string; product_name?: string; created_at: string; status: string }[];
}

function fmt(n: number | string, d = 2) { return Number(n).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }); }

function periodParams(p: string) {
  const now = new Date(); const today = now.toISOString().slice(0, 10);
  if (p === "today") return `from=${today}&to=${today}`;
  if (p === "yesterday") { const y = new Date(now); y.setDate(now.getDate()-1); const ys = y.toISOString().slice(0,10); return `from=${ys}&to=${ys}`; }
  if (p === "week") { const d = now.getDay(); const s = new Date(now); s.setDate(now.getDate()-d); return `from=${s.toISOString().slice(0,10)}&to=${today}`; }
  return `from=${new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)}&to=${today}`;
}

export default function DirectorCocina() {
  const [period, setPeriod] = useState("today");
  const [data, setData]     = useState<KitchenData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/director/kitchen?${periodParams(period)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  const s = data?.summary;
  const delayedCount = parseInt(s?.delayed ?? "0");
  const avgPrep = parseFloat(s?.avg_prep_min ?? "0");

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex gap-2 mb-5 flex-wrap">
        {[["today","Hoy"],["yesterday","Ayer"],["week","Semana"],["month","Mes"]].map(([id,label]) => (
          <button key={id} onClick={() => setPeriod(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>{label}</button>
        ))}
      </div>

      {loading && <div className="flex justify-center items-center h-32 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"/></div>}

      {data && !loading && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{s?.total ?? 0}</div>
              <div className="text-xs text-gray-400 mt-1">Total pases</div>
            </div>
            <div className={`border rounded-xl p-4 text-center ${avgPrep > 20 ? "bg-red-900/30 border-red-800/50" : avgPrep > 12 ? "bg-yellow-900/30 border-yellow-800/50" : "bg-emerald-900/30 border-emerald-800/50"}`}>
              <div className={`text-2xl font-bold ${avgPrep > 20 ? "text-red-400" : avgPrep > 12 ? "text-yellow-400" : "text-emerald-400"}`}>{fmt(avgPrep, 1)} min</div>
              <div className="text-xs text-gray-400 mt-1">Tiempo medio</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">{s?.pending ?? 0}</div>
              <div className="text-xs text-gray-400 mt-1">Pendientes</div>
            </div>
            <div className={`border rounded-xl p-4 text-center ${delayedCount > 0 ? "bg-red-900/30 border-red-800/50" : "bg-gray-900 border-gray-800"}`}>
              <div className={`text-2xl font-bold ${delayedCount > 0 ? "text-red-400" : "text-emerald-400"}`}>{delayedCount}</div>
              <div className="text-xs text-gray-400 mt-1">Retrasados (+20 min)</div>
            </div>
          </div>

          {/* Status bar */}
          {parseInt(s?.total ?? "0") > 0 && (() => {
            const total = parseInt(s!.total);
            const items = [
              { label: "Pendiente",   value: parseInt(s!.pending), color: "bg-gray-500" },
              { label: "Preparando",  value: parseInt(s!.preparing), color: "bg-blue-500" },
              { label: "Listo",       value: parseInt(s!.ready), color: "bg-yellow-500" },
              { label: "Recogido",    value: parseInt(s!.collected), color: "bg-emerald-500" },
            ].filter(x => x.value > 0);
            return (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Estado de pases</h3>
                <div className="flex h-6 rounded-lg overflow-hidden mb-3">
                  {items.map(it => (
                    <div key={it.label} className={`${it.color} flex items-center justify-center`} style={{ width: `${(it.value / total) * 100}%` }}>
                      {(it.value / total) > 0.1 && <span className="text-white text-xs font-bold">{it.value}</span>}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  {items.map(it => (
                    <div key={it.label} className="flex items-center gap-1.5">
                      <div className={`w-3 h-3 rounded-sm ${it.color}`} />
                      <span className="text-xs text-gray-400">{it.label}: <span className="text-white font-medium">{it.value}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* By station */}
          {data.byStation.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Por estación / zona</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {data.byStation.map(st => (
                  <div key={st.prep_zone ?? "sin_zona"} className="bg-gray-800 rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-200">{st.prep_zone ?? "Sin zona"}</div>
                    <div className="flex justify-between mt-2">
                      <div className="text-center">
                        <div className="text-lg font-bold text-white">{st.total}</div>
                        <div className="text-xs text-gray-500">pases</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-lg font-bold ${parseFloat(st.avg_prep_min ?? "0") > 20 ? "text-red-400" : "text-emerald-400"}`}>{fmt(st.avg_prep_min ?? 0, 1)}m</div>
                        <div className="text-xs text-gray-500">media</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delayed */}
          {data.delayed.length > 0 && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-red-400 mb-3">⚠️ Pases retrasados (más de 20 min)</h3>
              <div className="space-y-2">
                {data.delayed.map(d => {
                  const minAgo = Math.round((Date.now() - new Date(d.created_at).getTime()) / 60000);
                  return (
                    <div key={d.id} className="flex justify-between items-center text-sm">
                      <span className="text-gray-300">{d.product_name ?? "Producto"}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded capitalize">{d.status}</span>
                        <span className="text-red-400 font-bold">{minAgo} min</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
