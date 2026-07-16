import { useState, useEffect } from "react";

interface ProfitData {
  period: { from: string; to: string };
  income: { gross: number; net: number; tax: number; invitations: number };
  costs: { cogs: { value: number; estimated: boolean }; waste: { value: number }; overhead: { value: number }; labor?: { value: number; estimated: boolean } };
  margins: { grossMarginAmt: number; grossMarginPct: number; ebitdaEst: number; allEstimated: boolean };
  productMatrix: {
    name: string; category: string; units: string; gross: number; unit_cost: string;
    total_cost: number; margin_total: number; marginPct: number; foodCostPct: number;
    quadrant: "star" | "plow" | "puzzle" | "dog";
  }[];
}

function fmt(n: number | string, d = 2) { return Number(n).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtEur(n: number | string) { return `${fmt(n)} €`; }

const QUADRANT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  star:   { label: "⭐ Alta venta, alto margen",  color: "text-yellow-300", bg: "bg-yellow-900/30 border-yellow-700/50" },
  plow:   { label: "🐄 Alta venta, bajo margen",  color: "text-blue-300",   bg: "bg-blue-900/30 border-blue-700/50" },
  puzzle: { label: "🧩 Baja venta, alto margen",  color: "text-purple-300", bg: "bg-purple-900/30 border-purple-700/50" },
  dog:    { label: "🐕 Baja venta, bajo margen",  color: "text-red-300",    bg: "bg-red-900/30 border-red-700/50" },
};

function PLRow({ label, value, sub, estimated, highlight, indent, border }: {
  label: string; value: string; sub?: string; estimated?: boolean;
  highlight?: "positive" | "negative" | "neutral"; indent?: number; border?: "top";
}) {
  const cls = highlight === "positive" ? "text-emerald-400" : highlight === "negative" ? "text-red-400" : "text-white";
  return (
    <div className={`flex items-center justify-between py-2.5 ${border === "top" ? "border-t border-gray-700 mt-1 pt-3" : ""} ${indent ? "pl-" + (indent * 4) : ""}`}>
      <div>
        <span className={`text-sm ${indent ? "text-gray-400" : "text-gray-200 font-medium"}`} style={indent ? { paddingLeft: `${indent * 12}px` } : {}}>
          {label}
        </span>
        {estimated && <span className="ml-2 text-xs text-amber-500/70 italic">est.</span>}
        {sub && <div className="text-xs text-gray-500 mt-0.5" style={indent ? { paddingLeft: `${indent * 12}px` } : {}}>{sub}</div>}
      </div>
      <span className={`font-bold tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

function periodParams(period: string) {
  const now = new Date(); const today = now.toISOString().slice(0, 10);
  if (period === "today") return `from=${today}&to=${today}`;
  if (period === "yesterday") { const y = new Date(now); y.setDate(now.getDate()-1); const ys = y.toISOString().slice(0,10); return `from=${ys}&to=${ys}`; }
  if (period === "week") { const d = now.getDay(); const s = new Date(now); s.setDate(now.getDate()-d); return `from=${s.toISOString().slice(0,10)}&to=${today}`; }
  return `from=${new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)}&to=${today}`;
}

export default function DirectorRentabilidad() {
  const [period, setPeriod]   = useState("month");
  const [data, setData]       = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [quadrantFilter, setQFilter] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/director/profitability?${periodParams(period)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  const gross   = data?.income.gross ?? 0;
  const cogs    = (data?.costs.cogs.value ?? 0) + (data?.costs.waste.value ?? 0);
  const labor   = data?.costs.labor?.value ?? 0;
  const overhead = data?.costs.overhead.value ?? 0;
  const gm      = data?.margins.grossMarginAmt ?? 0;
  const ebitda  = data?.margins.ebitdaEst ?? 0;

  const filteredMatrix = quadrantFilter
    ? (data?.productMatrix ?? []).filter(p => p.quadrant === quadrantFilter)
    : (data?.productMatrix ?? []);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Period */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[["today","Hoy"],["yesterday","Ayer"],["week","Semana"],["month","Mes"]].map(([id,label]) => (
          <button key={id} onClick={() => setPeriod(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center items-center h-48 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"/></div>}

      {data && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* P&L Account */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-4">
              Cuenta de resultados (estimada)
              <span className="ml-2 font-normal normal-case text-amber-500/70 italic text-xs">valores estimados</span>
            </h3>

            <PLRow label="Ingresos brutos"  value={fmtEur(gross)} highlight="neutral" />
            <PLRow label="IVA"              value={`- ${fmtEur(data.income.tax)}`} indent={1} />
            <PLRow label="Invitaciones"     value={`- ${fmtEur(data.income.invitations)}`} indent={1} />
            <PLRow label="Ingresos netos"   value={fmtEur(data.income.net)} border="top" />

            <PLRow label="Coste materia prima" value={`- ${fmtEur(data.costs.cogs.value)}`} estimated indent={1} />
            <PLRow label="Mermas"              value={`- ${fmtEur(data.costs.waste.value)}`} indent={1} />
            <PLRow
              label="Margen bruto"
              value={fmtEur(gm)}
              sub={`${fmt(data.margins.grossMarginPct, 1)}% sobre ventas`}
              highlight={gm >= 0 ? "positive" : "negative"}
              border="top"
            />

            {data.costs.labor && (
              <PLRow label="Coste personal" value={`- ${fmtEur(labor)}`} estimated indent={1} />
            )}
            <PLRow label="Gastos generales" value={`- ${fmtEur(overhead)}`} indent={1} />
            <PLRow
              label="Beneficio operativo est."
              value={fmtEur(ebitda)}
              sub={gross > 0 ? `${fmt((ebitda / gross) * 100, 1)}% margen operativo` : undefined}
              highlight={ebitda >= 0 ? "positive" : "negative"}
              estimated
              border="top"
            />
          </div>

          {/* Visual margin bars */}
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-4">Composición de costes (est.)</h3>
              {gross > 0 && (() => {
                const items = [
                  { label: "Coste MP", value: cogs, color: "bg-red-500" },
                  { label: "Personal", value: labor, color: "bg-orange-500" },
                  { label: "Gastos gen.", value: overhead, color: "bg-yellow-500" },
                  { label: "Beneficio", value: ebitda, color: "bg-emerald-500" },
                ];
                return (
                  <div className="space-y-3">
                    {/* Stacked bar */}
                    <div className="flex h-8 rounded-lg overflow-hidden">
                      {items.map(it => it.value > 0 && (
                        <div key={it.label} className={`${it.color} flex items-center justify-center`}
                          style={{ width: `${(it.value / gross) * 100}%` }}>
                          {(it.value / gross) > 0.07 && <span className="text-white text-xs font-bold">{fmt((it.value/gross)*100,0)}%</span>}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {items.map(it => (
                        <div key={it.label} className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-sm ${it.color} flex-shrink-0`} />
                          <span className="text-xs text-gray-400">{it.label}</span>
                          <span className="text-xs text-gray-200 ml-auto font-medium">{fmtEur(it.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Key ratios */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Food cost", value: gross > 0 ? (cogs / gross) * 100 : 0, good: (v: number) => v < 35 },
                { label: "Labor cost", value: gross > 0 ? (labor / gross) * 100 : 0, good: (v: number) => v < 30 },
                { label: "Margen bruto", value: data.margins.grossMarginPct, good: (v: number) => v > 50 },
              ].map(r => (
                <div key={r.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
                  <div className={`text-2xl font-bold ${r.good(r.value) ? "text-emerald-400" : "text-red-400"}`}>{fmt(r.value, 1)}%</div>
                  <div className="text-xs text-gray-400 mt-1">{r.label}</div>
                  <div className="text-xs mt-1">{r.good(r.value) ? "✅ Correcto" : "⚠️ Revisar"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Product matrix */}
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Matriz de rentabilidad por producto</h3>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setQFilter(null)}
                  className={`px-2 py-1 rounded text-xs ${!quadrantFilter ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}>
                  Todos
                </button>
                {Object.entries(QUADRANT_LABELS).map(([k, v]) => (
                  <button key={k} onClick={() => setQFilter(k === quadrantFilter ? null : k)}
                    className={`px-2 py-1 rounded text-xs border ${quadrantFilter === k ? v.bg + " " + v.color : "bg-gray-800 border-gray-700 text-gray-400"}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr className="text-left text-xs text-gray-400">
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Cuadrante</th>
                    <th className="px-3 py-2 text-right">Uds.</th>
                    <th className="px-3 py-2 text-right">Facturación</th>
                    <th className="px-3 py-2 text-right">Coste total</th>
                    <th className="px-3 py-2 text-right">Margen</th>
                    <th className="px-3 py-2 text-right">Food cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredMatrix.map(p => {
                    const q = QUADRANT_LABELS[p.quadrant];
                    return (
                      <tr key={p.name} className="hover:bg-gray-800/50">
                        <td className="px-3 py-2.5">
                          <div className="text-gray-200 font-medium">{p.name}</div>
                          <div className="text-xs text-gray-500">{p.category}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${q?.bg} ${q?.color}`}>{p.quadrant}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-300">{p.units}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmtEur(p.gross)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">{fmtEur(p.total_cost)}</td>
                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${p.marginPct >= 60 ? "text-emerald-400" : p.marginPct >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                          {fmt(p.marginPct, 1)}%
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${p.foodCostPct > 35 ? "text-red-400" : "text-gray-300"}`}>
                          {fmt(p.foodCostPct, 1)}%
                        </td>
                      </tr>
                    );
                  })}
                  {filteredMatrix.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-gray-500">Sin datos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
