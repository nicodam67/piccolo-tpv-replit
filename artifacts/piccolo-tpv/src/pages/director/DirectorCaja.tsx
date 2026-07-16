import { useState, useEffect } from "react";

interface CashData {
  period: { from: string; to: string };
  sessions: { id: string; opened_at: string; closed_at?: string; opening_float: string; expected_cash: string; counted_cash: string; difference: string; employee_name: string; ticket_count: string; total_sales: string }[];
  paymentSummary: { method: string; code: string; count: string; total: string }[];
  movements: { type: string; amount: string; reason: string; created_at: string; employee_name: string }[];
  summary: { totalSessions: number; sessionsWithDiff: number; totalDiff: number; totalSales: number };
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

export default function DirectorCaja() {
  const [period, setPeriod] = useState("today");
  const [data, setData]     = useState<CashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/director/cash?${periodParams(period)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex gap-2 mb-5 flex-wrap">
        {[["today","Hoy"],["yesterday","Ayer"],["week","Semana"],["month","Mes"]].map(([id,label]) => (
          <button key={id} onClick={() => setPeriod(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>{label}</button>
        ))}
      </div>

      {loading && <div className="flex justify-center items-center h-32 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"/></div>}

      {data && !loading && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{data.summary.totalSessions}</div>
              <div className="text-xs text-gray-400 mt-1">Sesiones de caja</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{fmtEur(data.summary.totalSales)}</div>
              <div className="text-xs text-gray-400 mt-1">Ventas totales</div>
            </div>
            <div className={`border rounded-xl p-4 text-center ${data.summary.sessionsWithDiff > 0 ? "bg-red-900/30 border-red-800/50" : "bg-gray-900 border-gray-800"}`}>
              <div className={`text-2xl font-bold ${data.summary.sessionsWithDiff > 0 ? "text-red-400" : "text-emerald-400"}`}>{data.summary.sessionsWithDiff}</div>
              <div className={`text-xs mt-1 ${data.summary.sessionsWithDiff > 0 ? "text-red-400" : "text-gray-400"}`}>Sesiones con diferencia</div>
            </div>
            <div className={`border rounded-xl p-4 text-center ${Math.abs(data.summary.totalDiff) > 1 ? "bg-red-900/30 border-red-800/50" : "bg-gray-900 border-gray-800"}`}>
              <div className={`text-2xl font-bold tabular-nums ${data.summary.totalDiff < 0 ? "text-red-400" : data.summary.totalDiff > 0 ? "text-yellow-400" : "text-emerald-400"}`}>{fmtEur(data.summary.totalDiff)}</div>
              <div className="text-xs text-gray-400 mt-1">Diferencia total</div>
            </div>
          </div>

          {/* Payment methods */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Formas de pago</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {data.paymentSummary.map(pm => (
                <div key={pm.code} className="bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold tabular-nums text-white">{fmtEur(pm.total)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{pm.method}</div>
                  <div className="text-xs text-gray-600 mt-0.5">{pm.count} operaciones</div>
                </div>
              ))}
              {data.paymentSummary.length === 0 && <p className="col-span-4 text-center text-gray-500 text-sm py-4">Sin cobros en este período</p>}
            </div>
          </div>

          {/* Sessions */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300">Sesiones de caja</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr className="text-left text-xs text-gray-400">
                    <th className="px-4 py-2">Apertura</th><th className="px-4 py-2">Cierre</th>
                    <th className="px-4 py-2">Empleado</th><th className="px-4 py-2 text-right">Ventas</th>
                    <th className="px-4 py-2 text-right">Efectivo esp.</th><th className="px-4 py-2 text-right">Efectivo cont.</th>
                    <th className="px-4 py-2 text-right">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.sessions.map(s => {
                    const diff = parseFloat(s.difference ?? "0");
                    return (
                      <tr key={s.id} className="hover:bg-gray-800/50">
                        <td className="px-4 py-2.5 text-gray-300 text-xs">{new Date(s.opened_at).toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{s.closed_at ? new Date(s.closed_at).toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit" }) : <span className="text-yellow-400">Abierta</span>}</td>
                        <td className="px-4 py-2.5 text-gray-300">{s.employee_name}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmtEur(s.total_sales)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{fmtEur(s.expected_cash)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{fmtEur(s.counted_cash ?? s.expected_cash)}</td>
                        <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${Math.abs(diff) < 0.01 ? "text-emerald-400" : diff < 0 ? "text-red-400" : "text-yellow-400"}`}>
                          {diff >= 0 ? "+" : ""}{fmtEur(diff)}
                        </td>
                      </tr>
                    );
                  })}
                  {data.sessions.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-500">Sin sesiones de caja en este período</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent movements */}
          {data.movements.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Últimos movimientos manuales</h3>
              <div className="space-y-2">
                {data.movements.slice(0, 10).map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${m.type === "in" ? "bg-emerald-900/50 text-emerald-400" : "bg-red-900/50 text-red-400"}`}>
                        {m.type === "in" ? "ENT" : "SAL"}
                      </span>
                      <span className="text-gray-300">{m.reason}</span>
                      <span className="text-xs text-gray-500">— {m.employee_name}</span>
                    </div>
                    <span className={`font-bold tabular-nums ${m.type === "in" ? "text-emerald-400" : "text-red-400"}`}>{m.type === "in" ? "+" : "-"}{fmtEur(m.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
