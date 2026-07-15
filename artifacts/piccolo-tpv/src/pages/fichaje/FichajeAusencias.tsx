import { useState, useEffect, useMemo } from "react";
import { Plus, CheckCircle, XCircle, Clock, Search, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

interface Absence {
  id: string;
  employeeId: string;
  employeeName: string;
  absenceDate: string;
  absenceType: string;
  status: string;
  reason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
}

interface Employee { id: string; name: string; }

const TYPES: Record<string, string> = {
  holiday: "Festivo", sick_leave: "Baja", vacation: "Vacaciones", presentation: "Presentación", other: "Otro",
};
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700", approved: "bg-green-50 text-green-700", rejected: "bg-red-50 text-red-700",
};

function AbsenceModal({ employees, onClose, onSaved }: { employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ employeeId: "", absenceDate: "", absenceType: "vacation", reason: "" });
  const [saving, setSaving] = useState(false);
  const token = localStorage.getItem("token");

  async function save() {
    setSaving(true);
    await fetch(`${BASE}api/fichaje/absences`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...form, reason: form.reason || undefined }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4">Nueva ausencia</h3>
        <div className="space-y-3">
          <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Empleado...</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input type="date" value={form.absenceDate} onChange={e => setForm(f => ({ ...f, absenceDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
          <select value={form.absenceType} onChange={e => setForm(f => ({ ...f, absenceType: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
            {Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input placeholder="Motivo (opcional)" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
          <button onClick={save} disabled={saving || !form.employeeId || !form.absenceDate}
            className="flex-1 bg-teal-600 text-white rounded-lg py-2 text-sm disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FichajeAusencias() {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [empSearch, setEmpSearch] = useState("");
  const token = localStorage.getItem("token");

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    fetch(`${BASE}api/fichaje/absences?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setAbsences(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetch(`${BASE}api/employees`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setEmployees(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    load();
    const onVisibility = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function approve(id: string, status: "approved" | "rejected") {
    await fetch(`${BASE}api/fichaje/absences/${id}/approve`, {
      method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ausencias y festivos</h1>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
          <Plus className="w-4 h-4" /> Nueva ausencia
        </button>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {["", "pending", "approved", "rejected"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? "bg-teal-600 text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
            {s === "" ? "Todas" : s === "pending" ? "Pendientes" : s === "approved" ? "Aprobadas" : "Rechazadas"}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={empSearch}
          autoFocus
          onChange={e => setEmpSearch(e.target.value)}
          placeholder="Buscar empleado…"
          className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/40"
        />
        {empSearch && (
          <button onClick={() => setEmpSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
            <X size={13} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Cargando...</div>
      ) : absences.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Sin ausencias</div>
      ) : (
        <div className="space-y-2">
          {absences.filter(a => !empSearch.trim() || a.employeeName.toLowerCase().includes(empSearch.trim().toLowerCase())).map(a => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <div className="font-medium text-gray-900">{a.employeeName}</div>
                <div className="text-sm text-gray-500 mt-0.5">
                  {new Date(a.absenceDate + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "long" })}
                  {" · "}{TYPES[a.absenceType] ?? a.absenceType}
                  {a.reason && <span className="ml-2 text-gray-400">— {a.reason}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[a.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {a.status === "pending" ? "Pendiente" : a.status === "approved" ? "Aprobada" : "Rechazada"}
                </span>
                {a.status === "pending" && (
                  <>
                    <button onClick={() => approve(a.id, "approved")} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"><CheckCircle className="w-4 h-4" /></button>
                    <button onClick={() => approve(a.id, "rejected")} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><XCircle className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && <AbsenceModal employees={employees} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}
