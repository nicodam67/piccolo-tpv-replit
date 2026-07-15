import { useState, useEffect } from "react";
import { Search, Filter, Clock, LogIn, LogOut, Edit2, Plus } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

interface Record {
  id: string;
  employeeId: string;
  employeeName: string;
  clockIn: string;
  clockOut: string | null;
  source: string;
  isManual: boolean;
  notes: string | null;
}

interface Employee { id: string; name: string; }

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtDuration(a: string, b: string | null) {
  const mins = Math.floor(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 60000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function ManualModal({ onClose, onSaved, employees }: { onClose: () => void; onSaved: () => void; employees: Employee[] }) {
  const [form, setForm] = useState({ employeeId: "", clockIn: "", clockOut: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const token = localStorage.getItem("token");

  async function save() {
    if (!form.employeeId || !form.clockIn) return;
    setSaving(true);
    await fetch(`${BASE}api/fichaje/records/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ employeeId: form.employeeId, clockIn: form.clockIn, clockOut: form.clockOut || undefined, notes: form.notes || undefined }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4">Añadir registro manual</h3>
        <div className="space-y-3">
          <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Seleccionar empleado...</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Entrada *</label>
            <input type="datetime-local" value={form.clockIn} onChange={e => setForm(f => ({ ...f, clockIn: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Salida (opcional)</label>
            <input type="datetime-local" value={form.clockOut} onChange={e => setForm(f => ({ ...f, clockOut: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <input placeholder="Notas (opcional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
          <button onClick={save} disabled={saving || !form.employeeId || !form.clockIn}
            className="flex-1 bg-teal-600 text-white rounded-lg py-2 text-sm disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FichajeRegistros() {
  const [records, setRecords] = useState<Record[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEmp, setFilterEmp] = useState("");
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [showManual, setShowManual] = useState(false);
  const token = localStorage.getItem("token");

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (filterEmp) params.set("employeeId", filterEmp);
    fetch(`${BASE}api/fichaje/records?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setRecords(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetch(`${BASE}api/employees`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setEmployees(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [from, to, filterEmp]);

  const filtered = records.filter(r => r.employeeName.toLowerCase().includes(search.toLowerCase()));

  const sourceLabel: Record<string, string> = { pin: "PIN", nfc: "NFC", manual: "Manual", anviz: "Anviz" };
  const sourceBg: Record<string, string> = { pin: "bg-blue-50 text-blue-700", nfc: "bg-purple-50 text-purple-700", manual: "bg-amber-50 text-amber-700", anviz: "bg-gray-50 text-gray-600" };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Registros</h1>
        <button onClick={() => setShowManual(true)} className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
          <Plus className="w-4 h-4" /> Añadir manual
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
        </div>
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Todos los empleados</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded-lg px-3 py-2" />
          <span className="text-gray-400">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded-lg px-3 py-2" />
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Cargando...</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Empleado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Entrada</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Salida</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Duración</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">Sin registros</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.employeeName}</td>
                  <td className="px-4 py-3 text-gray-700 flex items-center gap-1">
                    <LogIn className="w-3.5 h-3.5 text-green-500" /> {fmtDateTime(r.clockIn)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {r.clockOut ? (
                      <span className="flex items-center gap-1"><LogOut className="w-3.5 h-3.5 text-red-400" />{fmtDateTime(r.clockOut)}</span>
                    ) : <span className="text-green-600 text-xs font-medium">En curso</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{fmtDuration(r.clockIn, r.clockOut)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceBg[r.source] || "bg-gray-100 text-gray-600"}`}>
                      {sourceLabel[r.source] || r.source}
                    </span>
                    {r.isManual && <Edit2 className="w-3 h-3 inline ml-1 text-amber-500" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showManual && (
        <ManualModal
          employees={employees}
          onClose={() => setShowManual(false)}
          onSaved={() => { setShowManual(false); load(); }}
        />
      )}
    </div>
  );
}
