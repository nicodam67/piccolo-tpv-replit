import { useState, useEffect } from "react";

interface StaffData {
  period: { from: string; to: string };
  employees: { id: string; name: string; role: string; total_records: string; hours_worked: string; incomplete: string }[];
  clockedInNow: { name: string; clock_in: string }[];
  incomplete: { name: string; clock_in: string }[];
  summary: { totalActive: number; clockedInCount: number; incompleteCount: number };
  laborCost?: number;
  laborPct?: number;
}

function fmt(n: number | string, d = 2) { return Number(n).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtEur(n: number | string) { return `${fmt(n)} €`; }
function fmtHours(h: number | string) { const v = parseFloat(String(h) || "0"); const hh = Math.floor(v); const mm = Math.round((v - hh) * 60); return `${hh}h ${String(mm).padStart(2,"0")}m`; }

function periodParams(p: string) {
  const now = new Date(); const today = now.toISOString().slice(0, 10);
  if (p === "today") return `from=${today}&to=${today}`;
  if (p === "yesterday") { const y = new Date(now); y.setDate(now.getDate()-1); const ys = y.toISOString().slice(0,10); return `from=${ys}&to=${ys}`; }
  if (p === "week") { const d = now.getDay(); const s = new Date(now); s.setDate(now.getDate()-d); return `from=${s.toISOString().slice(0,10)}&to=${today}`; }
  return `from=${new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)}&to=${today}`;
}

export default function DirectorPersonal() {
  const [period, setPeriod] = useState("today");
  const [data, setData]     = useState<StaffData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/director/staff?${periodParams(period)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

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
              <div className="text-2xl font-bold text-white">{data.summary.totalActive}</div>
              <div className="text-xs text-gray-400 mt-1">Empleados activos</div>
            </div>
            <div className="bg-blue-900/30 border border-blue-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-blue-300">{data.summary.clockedInCount}</div>
              <div className="text-xs text-blue-400 mt-1">Fichados ahora</div>
            </div>
            <div className={`border rounded-xl p-4 text-center ${data.summary.incompleteCount > 0 ? "bg-red-900/30 border-red-800/50" : "bg-gray-900 border-gray-800"}`}>
              <div className={`text-2xl font-bold ${data.summary.incompleteCount > 0 ? "text-red-400" : "text-emerald-400"}`}>{data.summary.incompleteCount}</div>
              <div className="text-xs text-gray-400 mt-1">Fichajes incompletos</div>
            </div>
            {data.laborCost !== undefined && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div className="text-xl font-bold text-orange-400 tabular-nums">{fmtEur(data.laborCost)}</div>
                <div className="text-xs text-gray-400 mt-1">Coste personal est. {data.laborPct !== undefined && `(${fmt(data.laborPct, 1)}%)`}</div>
              </div>
            )}
          </div>

          {/* Currently clocked in */}
          {data.clockedInNow.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">🟢 Fichados ahora</h3>
              <div className="flex flex-wrap gap-2">
                {data.clockedInNow.map(e => (
                  <div key={e.name} className="bg-emerald-900/30 border border-emerald-800/50 rounded-lg px-3 py-2">
                    <div className="text-sm text-emerald-300 font-medium">{e.name}</div>
                    <div className="text-xs text-emerald-500 mt-0.5">Desde {new Date(e.clock_in).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Incomplete */}
          {data.incomplete.length > 0 && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-red-400 mb-3">⚠️ Fichajes incompletos (+12h sin salida)</h3>
              <div className="space-y-2">
                {data.incomplete.map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{e.name}</span>
                    <span className="text-red-400 text-xs">Entrada: {new Date(e.clock_in).toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Employee hours table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300">Horas trabajadas por empleado</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-800">
                <tr className="text-left text-xs text-gray-400">
                  <th className="px-4 py-2">Empleado</th><th className="px-4 py-2">Rol</th>
                  <th className="px-4 py-2 text-right">Fichajes</th><th className="px-4 py-2 text-right">Horas</th>
                  <th className="px-4 py-2 text-right">Incompletos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.employees.filter(e => parseFloat(e.hours_worked || "0") > 0 || parseInt(e.total_records || "0") > 0).map(e => (
                  <tr key={e.id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-2.5 text-gray-200 font-medium">{e.name}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs capitalize">{e.role}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{e.total_records}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-white">{fmtHours(e.hours_worked ?? 0)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${parseInt(e.incomplete || "0") > 0 ? "text-red-400" : "text-gray-600"}`}>
                      {e.incomplete || 0}
                    </td>
                  </tr>
                ))}
                {data.employees.every(e => !parseFloat(e.hours_worked || "0")) && (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-500">Sin fichajes en este período</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
