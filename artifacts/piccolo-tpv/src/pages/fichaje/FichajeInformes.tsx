import { useState, useEffect } from "react";
import { BarChart3, Clock, Calendar, TrendingUp } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

interface SummaryRow {
  employeeId: string;
  employeeName: string;
  totalMinutes: number;
  totalHours: string;
  totalDays: number;
  totalRecords: number;
}

interface Employee { id: string; name: string; }

function pad(n: number) { return n.toString().padStart(2, "0"); }

function getPreset(preset: string): { from: string; to: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  if (preset === "week") {
    const day = today.getDay();
    const diff = d - day + (day === 0 ? -6 : 1);
    const mon = new Date(y, m, diff);
    const sun = new Date(y, m, diff + 6);
    return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
  }
  if (preset === "month") return { from: `${y}-${pad(m + 1)}-01`, to: today.toISOString().slice(0, 10) };
  if (preset === "lastMonth") {
    const lm = new Date(y, m, 0);
    return { from: `${lm.getFullYear()}-${pad(lm.getMonth() + 1)}-01`, to: lm.toISOString().slice(0, 10) };
  }
  // today
  return { from: today.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
}

export default function FichajeInformes() {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState("month");
  const [from, setFrom] = useState(() => getPreset("month").from);
  const [to, setTo] = useState(() => getPreset("month").to);
  const [filterEmp, setFilterEmp] = useState("");
  const token = localStorage.getItem("token");

  useEffect(() => {
    fetch(`${BASE}api/employees`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setEmployees(Array.isArray(d) ? d : []));
  }, []);

  function applyPreset(p: string) {
    setPreset(p);
    const range = getPreset(p);
    setFrom(range.from);
    setTo(range.to);
  }

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (filterEmp) params.set("employeeId", filterEmp);
    fetch(`${BASE}api/fichaje/reports/summary?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setSummary(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [from, to, filterEmp]);

  const totalHours = summary.reduce((acc, r) => acc + r.totalMinutes, 0) / 60;
  const totalDays = summary.reduce((acc, r) => acc + r.totalDays, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-7 h-7 text-teal-600" />
        <h1 className="text-2xl font-bold text-gray-900">Informes de asistencia</h1>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex gap-1.5">
          {[
            { k: "today", l: "Hoy" },
            { k: "week", l: "Esta semana" },
            { k: "month", l: "Este mes" },
            { k: "lastMonth", l: "Mes anterior" },
            { k: "custom", l: "Personalizado" },
          ].map(({ k, l }) => (
            <button key={k} onClick={() => applyPreset(k)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${preset === k ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {l}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded-lg px-3 py-1.5" />
            <span className="text-gray-400">—</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded-lg px-3 py-1.5" />
          </div>
        )}
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className="border rounded-lg px-3 py-2 text-sm ml-auto">
          <option value="">Todos los empleados</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-teal-700">{totalHours.toFixed(1)}</div>
          <div className="text-sm text-teal-600 mt-1 flex items-center justify-center gap-1"><Clock className="w-4 h-4" />Horas totales</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-blue-700">{totalDays}</div>
          <div className="text-sm text-blue-600 mt-1 flex items-center justify-center gap-1"><Calendar className="w-4 h-4" />Jornadas</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-purple-700">{summary.length}</div>
          <div className="text-sm text-purple-600 mt-1 flex items-center justify-center gap-1"><TrendingUp className="w-4 h-4" />Empleados</div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Cargando...</div>
      ) : summary.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Sin datos para el período seleccionado</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Empleado</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Horas</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Jornadas</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Registros</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Media/día</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.map(r => (
                <tr key={r.employeeId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.employeeName}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{r.totalHours}h</td>
                  <td className="px-4 py-3 text-right text-gray-700">{r.totalDays}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.totalRecords}</td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">
                    {r.totalDays > 0 ? `${(r.totalMinutes / r.totalDays / 60).toFixed(1)}h` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
