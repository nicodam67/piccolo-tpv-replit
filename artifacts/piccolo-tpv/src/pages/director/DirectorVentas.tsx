import { useState, useEffect } from "react";

interface SalesData {
  period: { from: string; to: string };
  byHour: { hour: number; ticket_count: string; gross: string; net: string }[];
  byChannel: { channel: string; orders: string; gross: string }[];
  byCategory: { category: string; units: string; gross: string }[];
  byProduct: { product: string; category: string; units: string; gross: string; avg_price: string; cost: string }[];
  byEmployee: { employee: string; orders: string; gross: string; guests: string }[];
  byPayment: { method: string; code: string; count: string; total: string }[];
}

function fmt(n: number | string, d = 2) { return Number(n).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtEur(n: number | string) { return `${fmt(n)} €`; }

function periodParams(period: string) {
  const now = new Date(); const today = now.toISOString().slice(0, 10);
  if (period === "today") return `from=${today}&to=${today}`;
  if (period === "yesterday") { const y = new Date(now); y.setDate(now.getDate()-1); const ys = y.toISOString().slice(0,10); return `from=${ys}&to=${ys}`; }
  if (period === "week") { const d = now.getDay(); const s = new Date(now); s.setDate(now.getDate()-d); return `from=${s.toISOString().slice(0,10)}&to=${today}`; }
  if (period === "month") { const s = new Date(now.getFullYear(), now.getMonth(), 1); return `from=${s.toISOString().slice(0,10)}&to=${today}`; }
  return `from=${today}&to=${today}`;
}

const PERIODS = [
  { id: "today", label: "Hoy" }, { id: "yesterday", label: "Ayer" },
  { id: "week", label: "Semana" }, { id: "month", label: "Mes" },
];

export default function DirectorVentas() {
  const [period, setPeriod] = useState("today");
  const [data, setData]     = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<"hour" | "channel" | "category" | "product" | "employee" | "payment">("hour");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/director/sales?${periodParams(period)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  const maxGross = (arr: { gross: string }[]) => Math.max(1, ...arr.map(r => parseFloat(r.gross)));

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Period selector */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === p.id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
            {p.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {(["hour","channel","category","product","employee","payment"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
              {t === "hour" ? "Por hora" : t === "channel" ? "Canal" : t === "category" ? "Categoría" : t === "product" ? "Producto" : t === "employee" ? "Camarero" : "Pago"}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="flex justify-center items-center h-48 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"/></div>}

      {data && !loading && (
        <div className="space-y-4">
          {/* By hour */}
          {tab === "hour" && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Ventas por hora</h3>
              <div className="space-y-2">
                {data.byHour.length === 0 && <p className="text-gray-500 text-sm text-center py-8">Sin datos para este período</p>}
                {data.byHour.map(r => {
                  const g = parseFloat(r.gross);
                  const maxH = Math.max(1, ...data.byHour.map(x => parseFloat(x.gross)));
                  return (
                    <div key={r.hour} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-8 text-right">{String(r.hour).padStart(2,"0")}h</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full flex items-center px-2" style={{ width: `${(g / maxH) * 100}%` }}>
                          {g > maxH * 0.1 && <span className="text-xs text-white font-medium">{fmtEur(g)}</span>}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 w-8">{r.ticket_count}T</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* By channel */}
          {tab === "channel" && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Ventas por canal</h3>
              <div className="space-y-3">
                {data.byChannel.map(r => {
                  const g = parseFloat(r.gross); const mx = maxGross(data.byChannel);
                  return (
                    <div key={r.channel} className="flex items-center gap-3">
                      <span className="text-sm text-gray-300 w-20 truncate capitalize">{r.channel}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-7 overflow-hidden">
                        <div className="h-full bg-emerald-600 rounded-full flex items-center px-3" style={{ width: `${(g / mx) * 100}%` }}>
                          {g > mx * 0.1 && <span className="text-xs text-white font-medium">{fmtEur(g)}</span>}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 w-16 text-right">{r.orders} ped.</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* By category */}
          {tab === "category" && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr className="text-left text-xs text-gray-400">
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3 text-right">Unidades</th>
                    <th className="px-4 py-3 text-right">Facturación</th>
                    <th className="px-4 py-3 text-right">% del total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.byCategory.map(r => {
                    const totalGross = data.byCategory.reduce((s, x) => s + parseFloat(x.gross), 0);
                    const pct = totalGross > 0 ? (parseFloat(r.gross) / totalGross) * 100 : 0;
                    return (
                      <tr key={r.category} className="hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-gray-200">{r.category}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{r.units}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtEur(r.gross)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-gray-700 rounded-full h-1.5">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 w-10 text-right">{fmt(pct, 1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* By product */}
          {tab === "product" && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr className="text-left text-xs text-gray-400">
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3 text-right">Uds.</th>
                    <th className="px-4 py-3 text-right">Facturación</th>
                    <th className="px-4 py-3 text-right">P. medio</th>
                    <th className="px-4 py-3 text-right">Coste unit.</th>
                    <th className="px-4 py-3 text-right">Margen est.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.byProduct.map(r => {
                    const ap = parseFloat(r.avg_price); const cost = parseFloat(r.cost);
                    const margin = ap > 0 ? ((ap - cost) / ap) * 100 : 0;
                    return (
                      <tr key={r.product} className="hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-gray-200 font-medium">{r.product}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{r.category}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{r.units}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtEur(r.gross)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-300">{fmtEur(r.avg_price)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-400">{fmtEur(r.cost)}</td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium ${margin >= 60 ? "text-emerald-400" : margin >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                          {fmt(margin, 1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* By employee */}
          {tab === "employee" && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr className="text-left text-xs text-gray-400">
                    <th className="px-4 py-3">Empleado</th>
                    <th className="px-4 py-3 text-right">Pedidos</th>
                    <th className="px-4 py-3 text-right">Comensales</th>
                    <th className="px-4 py-3 text-right">Facturación</th>
                    <th className="px-4 py-3 text-right">Ticket medio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.byEmployee.map(r => (
                    <tr key={r.employee} className="hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-gray-200 font-medium">{r.employee}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{r.orders}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{r.guests}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtEur(r.gross)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-300">
                        {parseInt(r.orders) > 0 ? fmtEur(parseFloat(r.gross) / parseInt(r.orders)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* By payment */}
          {tab === "payment" && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr className="text-left text-xs text-gray-400">
                    <th className="px-4 py-3">Forma de pago</th>
                    <th className="px-4 py-3 text-right">Operaciones</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">% del total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.byPayment.map(r => {
                    const total = data.byPayment.reduce((s, x) => s + parseFloat(x.total), 0);
                    const pct = total > 0 ? (parseFloat(r.total) / total) * 100 : 0;
                    return (
                      <tr key={r.method} className="hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-gray-200 font-medium">{r.method}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{r.count}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtEur(r.total)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-gray-700 rounded-full h-1.5">
                              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 w-10 text-right">{fmt(pct, 1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
