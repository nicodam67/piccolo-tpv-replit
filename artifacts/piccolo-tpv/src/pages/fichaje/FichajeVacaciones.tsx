/**
 * FichajeVacaciones — solicitudes y calendario de vacaciones.
 * Usa el endpoint /api/fichaje/absences con type=vacation.
 */
import { useState, useEffect } from "react";
import { Umbrella, Plus, Search, X, Check, Clock } from "lucide-react";
import { api } from "../../lib/api-client";

interface Absence {
  id: string;
  employeeId: string;
  employeeName: string;
  type: string;
  startDate: string;
  endDate: string;
  notes: string | null;
  approved: boolean | null;
  createdAt: string;
}

interface Employee { id: string; name: string; }

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;
}

function NewModal({ employees, onClose, onSaved }: { employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ employeeId: "", startDate: "", endDate: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form.employeeId || !form.startDate || !form.endDate) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/fichaje/absences", { ...form, type: "vacation" });
      onSaved();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Nueva solicitud de vacaciones</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X size={16} /></button>
        </div>
        {error && <div className="mb-3 p-2 rounded-lg bg-destructive/10 text-destructive text-xs">{error}</div>}
        <div className="space-y-3">
          <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="">Seleccionar empleado…</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Inicio</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Fin</label>
              <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" />
            </div>
          </div>
          <input placeholder="Notas (opcional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-border rounded-lg py-2 text-sm text-foreground hover:bg-secondary">Cancelar</button>
          <button onClick={save} disabled={saving || !form.employeeId || !form.startDate || !form.endDate}
            className="flex-1 bg-teal-600 text-white rounded-lg py-2 text-sm disabled:opacity-50 hover:bg-teal-700">
            {saving ? "Guardando…" : "Crear solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FichajeVacaciones() {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  function load() {
    setLoading(true);
    api.get<Absence[]>("/api/fichaje/absences?type=vacation")
      .then(d => setAbsences(Array.isArray(d) ? d : []))
      .catch(() => setAbsences([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    api.get<Employee[]>("/api/employees").then(d => setEmployees(d)).catch(() => {});
  }, []);

  async function approve(id: string, approved: boolean) {
    await api.put(`/api/fichaje/absences/${id}`, { approved }).catch(() => {});
    load();
  }

  const filtered = absences.filter(a => a.employeeName.toLowerCase().includes(search.toLowerCase()));
  const pending = filtered.filter(a => a.approved === null).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vacaciones</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {pending > 0 ? `${pending} solicitud${pending !== 1 ? "es" : ""} pendiente${pending !== 1 ? "s" : ""}` : "Sin solicitudes pendientes"}
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
          <Plus size={16} /> Nueva solicitud
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado…"
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Umbrella className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Sin solicitudes de vacaciones</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => {
            const days = daysBetween(a.startDate, a.endDate);
            const isPending = a.approved === null;
            const isApproved = a.approved === true;
            return (
              <div key={a.id} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card">
                <div className="w-10 h-10 rounded-full bg-teal-500/15 text-teal-600 flex items-center justify-center font-bold text-sm shrink-0">
                  {a.employeeName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm">{a.employeeName}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <Clock size={11} />
                    {fmt(a.startDate)} → {fmt(a.endDate)} · <strong>{days} días</strong>
                  </div>
                  {a.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">"{a.notes}"</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isPending ? (
                    <>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Pendiente</span>
                      <button onClick={() => approve(a.id, true)}
                        className="p-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200" title="Aprobar">
                        <Check size={14} />
                      </button>
                      <button onClick={() => approve(a.id, false)}
                        className="p-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200" title="Rechazar">
                        <X size={14} />
                      </button>
                    </>
                  ) : isApproved ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Aprobada</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">Rechazada</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && (
        <NewModal employees={employees} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />
      )}
    </div>
  );
}
