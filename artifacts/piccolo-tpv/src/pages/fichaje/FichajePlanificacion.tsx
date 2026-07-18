/**
 * FichajePlanificacion — vista semanal de turnos planificados.
 * Usa GET /api/fichaje/shifts para mostrar el horario de la semana actual.
 */
import { useState, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { api } from "../../lib/api-client";

interface Shift {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string | null;
}

interface Employee { id: string; name: string; }

const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtDay(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function NewShiftModal({ employees, defaultDate, onClose, onSaved }: {
  employees: Employee[]; defaultDate: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ employeeId: "", date: defaultDate, startTime: "09:00", endTime: "17:00", notes: "" });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.employeeId) return;
    setSaving(true);
    try {
      await api.post("/api/fichaje/shifts", form);
      onSaved();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Nuevo turno</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="">Seleccionar empleado…</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Fecha</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Inicio</label>
              <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Fin</label>
              <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" />
            </div>
          </div>
          <input placeholder="Notas (opcional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-border rounded-lg py-2 text-sm text-foreground hover:bg-secondary">Cancelar</button>
          <button onClick={save} disabled={saving || !form.employeeId}
            className="flex-1 bg-teal-600 text-white rounded-lg py-2 text-sm disabled:opacity-50 hover:bg-teal-700">
            {saving ? "Guardando…" : "Crear turno"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FichajePlanificacion() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState<string | null>(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = fmtDate(weekDays[0]);
  const to = fmtDate(weekDays[6]);

  function load() {
    setLoading(true);
    api.get<Shift[]>(`/api/fichaje/shifts?from=${from}&to=${to}`)
      .then(d => setShifts(Array.isArray(d) ? d : []))
      .catch(() => setShifts([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get<Employee[]>("/api/employees").then(d => setEmployees(d)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [from, to]);

  async function deleteShift(id: string) {
    await api.delete?.(`/api/fichaje/shifts/${id}`).catch(() => {});
    load();
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planificación</h1>
          <p className="text-muted-foreground text-sm mt-1">Semana del {fmtDay(weekDays[0])} al {fmtDay(weekDays[6])}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(d => addDays(d, -7))}
            className="p-2 rounded-lg border border-border hover:bg-secondary text-muted-foreground">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="px-3 py-1.5 rounded-lg border border-border text-sm text-foreground hover:bg-secondary">
            Hoy
          </button>
          <button onClick={() => setWeekStart(d => addDays(d, 7))}
            className="p-2 rounded-lg border border-border hover:bg-secondary text-muted-foreground">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando planificación…</div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 divide-x divide-border bg-secondary">
            {weekDays.map((d, i) => {
              const isToday = fmtDate(d) === fmtDate(new Date());
              return (
                <div key={i} className="px-2 py-3 text-center">
                  <div className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-teal-500" : "text-muted-foreground"}`}>
                    {DAYS_ES[i]}
                  </div>
                  <div className={`text-sm font-bold mt-0.5 ${isToday ? "text-teal-500" : "text-foreground"}`}>
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shifts per day */}
          <div className="grid grid-cols-7 divide-x divide-border min-h-48">
            {weekDays.map((d, i) => {
              const dayStr = fmtDate(d);
              const dayShifts = shifts.filter(s => s.date === dayStr);
              return (
                <div key={i} className="p-2 space-y-1.5 min-h-32">
                  {dayShifts.map(s => (
                    <div key={s.id} className="group relative bg-teal-500/10 border border-teal-500/20 rounded-lg p-2">
                      <div className="text-xs font-semibold text-teal-700 dark:text-teal-400 truncate">{s.employeeName}</div>
                      <div className="text-xs text-muted-foreground">{s.startTime} – {s.endTime}</div>
                      {s.notes && <div className="text-xs text-muted-foreground italic truncate">{s.notes}</div>}
                      <button onClick={() => deleteShift(s.id)}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-opacity">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setShowNew(dayStr)}
                    className="w-full text-xs text-muted-foreground hover:text-teal-500 hover:bg-teal-500/5 rounded-lg py-1 transition-colors flex items-center justify-center gap-1">
                    <Plus size={12} /> Turno
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNew && (
        <NewShiftModal
          employees={employees}
          defaultDate={showNew}
          onClose={() => setShowNew(null)}
          onSaved={() => { setShowNew(null); load(); }}
        />
      )}
    </div>
  );
}
