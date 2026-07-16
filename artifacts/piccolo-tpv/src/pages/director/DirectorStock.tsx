import { useState, useEffect } from "react";

interface StockData {
  period: { from: string; to: string };
  summary: { total_ingredients: string; out_of_stock: string; below_min: string; stock_value: string };
  belowMin: { name: string; unit: string; current_stock: string; min_stock: string; average_cost: string }[];
  nearExpiry: { name: string; lot_number: string; expiry_date: string; quantity_remaining: string }[];
  waste: { total: string; events: string };
}

function fmt(n: number | string, d = 2) { return Number(n).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtEur(n: number | string) { return `${fmt(n)} €`; }

function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

export default function DirectorStock() {
  const [data, setData]     = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<"alerts" | "expiry" | "waste">("alerts");

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setLoading(true);
    fetch(`/api/director/stock?from=${today}&to=${today}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {loading && <div className="flex justify-center items-center h-32 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"/></div>}

      {data && !loading && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{data.summary.total_ingredients}</div>
              <div className="text-xs text-gray-400 mt-1">Ingredientes activos</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-xl font-bold text-emerald-400 tabular-nums">{fmtEur(data.summary.stock_value)}</div>
              <div className="text-xs text-gray-400 mt-1">Valor en stock</div>
            </div>
            <div className={`border rounded-xl p-4 text-center ${parseInt(data.summary.out_of_stock) > 0 ? "bg-red-900/30 border-red-800/50" : "bg-gray-900 border-gray-800"}`}>
              <div className={`text-2xl font-bold ${parseInt(data.summary.out_of_stock) > 0 ? "text-red-400" : "text-emerald-400"}`}>{data.summary.out_of_stock}</div>
              <div className="text-xs text-gray-400 mt-1">Ingredientes agotados</div>
            </div>
            <div className={`border rounded-xl p-4 text-center ${parseInt(data.summary.below_min) > 0 ? "bg-yellow-900/30 border-yellow-800/50" : "bg-gray-900 border-gray-800"}`}>
              <div className={`text-2xl font-bold ${parseInt(data.summary.below_min) > 0 ? "text-yellow-400" : "text-emerald-400"}`}>{data.summary.below_min}</div>
              <div className="text-xs text-gray-400 mt-1">Bajo mínimo</div>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-2">
            {([["alerts", `⚠️ Bajo mínimo (${data.belowMin.length})`], ["expiry", `⏳ Caducidades próximas (${data.nearExpiry.length})`], ["waste", "🗑️ Mermas"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === "alerts" && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr className="text-left text-xs text-gray-400">
                    <th className="px-4 py-2">Ingrediente</th><th className="px-4 py-2 text-right">Actual</th>
                    <th className="px-4 py-2 text-right">Mínimo</th><th className="px-4 py-2 text-right">Déficit</th>
                    <th className="px-4 py-2 text-right">Valor déficit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.belowMin.map(i => {
                    const deficit = parseFloat(i.min_stock) - parseFloat(i.current_stock);
                    const valDeficit = deficit * parseFloat(i.average_cost ?? "0");
                    return (
                      <tr key={i.name} className="hover:bg-gray-800/50">
                        <td className="px-4 py-2.5 text-gray-200 font-medium">{i.name}</td>
                        <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${parseFloat(i.current_stock) <= 0 ? "text-red-400" : "text-yellow-400"}`}>
                          {fmt(i.current_stock, 2)} {i.unit}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{fmt(i.min_stock, 2)} {i.unit}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-red-400">{fmt(deficit, 2)} {i.unit}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-300">{fmtEur(valDeficit)}</td>
                      </tr>
                    );
                  })}
                  {data.belowMin.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-emerald-400">✅ Todos los ingredientes están sobre mínimos</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === "expiry" && (
            <div className="space-y-2">
              {data.nearExpiry.map((l, i) => {
                const days = daysUntil(l.expiry_date);
                return (
                  <div key={i} className={`bg-gray-900 border rounded-xl p-4 flex items-center justify-between ${days <= 2 ? "border-red-800/50" : "border-yellow-800/50"}`}>
                    <div>
                      <div className="text-sm font-medium text-gray-200">{l.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">Lote: {l.lot_number} · {fmt(l.quantity_remaining, 2)} uds. restantes</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${days <= 2 ? "text-red-400" : "text-yellow-400"}`}>
                        {days === 0 ? "HOY" : days === 1 ? "Mañana" : `En ${days} días`}
                      </div>
                      <div className="text-xs text-gray-500">{l.expiry_date}</div>
                    </div>
                  </div>
                );
              })}
              {data.nearExpiry.length === 0 && <p className="text-center text-emerald-400 py-8">✅ Sin caducidades próximas (7 días)</p>}
            </div>
          )}

          {tab === "waste" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-orange-400 tabular-nums">{fmtEur(data.waste.total)}</div>
                <div className="text-sm text-gray-400 mt-2">Coste total de mermas</div>
                <div className="text-xs text-gray-500 mt-1">en el período seleccionado</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-white">{data.waste.events}</div>
                <div className="text-sm text-gray-400 mt-2">Registros de merma</div>
              </div>
              <div className="col-span-2">
                <a href="/admin/stock" className="block bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm text-center py-3 rounded-xl transition-colors">
                  Ver detalle completo de mermas →
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
