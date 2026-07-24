/**
 * FichajeCorrecciones — visualización y solicitudes de corrección
 * de registros de fichaje. Reutiliza el endpoint de registros manuales.
 */
import { useState, useEffect } from "react";
import { FileEdit, Plus, Search, Clock, Check, X } from "lucide-react";
import { api } from "../../lib/api-client";
import { getTimeclockRecords, updateTimeclockRecord } from "@workspace/api-client-react/timeclock";
import type { TimeclockRecordListItem } from "@workspace/api-client-react/timeclock";

interface FichajeRecord extends TimeclockRecordListItem {}

interface Employee { id: string; name: string; }

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function EditModal({ record, onClose, onSaved }: { record: FichajeRecord; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    clockIn: record.clockIn.slice(0, 16),
    clockOut: record.clockOut?.slice(0, 16) ?? "",
    notes: record.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateTimeclockRecord(record.id, {
        clockIn: form.clockIn,
        clockOut: form.clockOut || undefined,
        notes: form.notes || undefined,
        reason: form.notes || "Corrección manual",
      });
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
          <h3 className="text-lg font-semibold text-foreground">Corregir registro</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Empleado: <strong className="text-foreground">{record.employeeName}</strong></p>
        {error && <div className="mb-3 p-2 rounded-lg bg-destructive/10 text-destructive text-xs">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Entrada *</label>
            <input type="datetime-local" value={form.clockIn} onChange={e => setForm(f => ({ ...f, clockIn: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Salida (opcional)</label>
            <input type="datetime-local" value={form.clockOut} onChange={e => setForm(f => ({ ...f, clockOut: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Motivo de la corrección</label>
            <input placeholder="Ej: Error al fichar, sistema caído…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-border rounded-lg py-2 text-sm text-foreground hover:bg-secondary">Cancelar</button>
          <button onClick={save} disabled={saving || !form.clockIn}
            className="flex-1 bg-teal-600 text-white rounded-lg py-2 text-sm disabled:opacity-50 hover:bg-teal-700">
            {saving ? "Guardando…" : "Aplicar corrección"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FichajeCorrecciones() {
  const [records, setRecords] = useState<FichajeRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEmp, setFilterEmp] = useState("");
  const [from] = useState(() => new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
  const [to] = useState(() => new Date().toISOString().slice(0, 10));
  const [editing, setEditing] = useState<FichajeRecord | null>(null);

  function load() {
    setLoading(true);
    getTimeclockRecords({
      from: `${from}T00:00:00.000Z`,
      to: `${to}T23:59:59.999Z`,
      ...(filterEmp ? { employeeId: filterEmp } : {}),
    })
      .then(d => setRecords(d))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get<Employee[]>("/api/employees").then(d => setEmployees(d)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filterEmp]);

  const filtered = records.filter(r => r.employeeName.toLowerCase().includes(search.toLowerCase()));
  const corrected = filtered.filter(r => r.isManual).length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Correcciones</h1>
          <p className="text-muted-foreground text-sm mt-1">{corrected} registro{corrected !== 1 ? "s" : ""} corregido{corrected !== 1 ? "s" : ""} en los últimos 14 días</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado…"
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
        </div>
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
          className="border border-border rounded-xl px-3 py-2 text-sm bg-secondary text-foreground">
          <option value="">Todos los empleados</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando registros…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileEdit className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Sin registros en el período</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className={`flex items-center gap-4 p-4 rounded-xl border ${r.isManual ? "border-amber-200 bg-amber-50/50" : "border-border bg-card"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground text-sm">{r.employeeName}</span>
                  {r.isManual && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Manual</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <Clock size={11} />
                  <span>Entrada: {fmtDateTime(r.clockIn)}</span>
                  {r.clockOut
                    ? <><Check size={11} className="text-green-500" /><span>Salida: {fmtDateTime(r.clockOut)}</span></>
                    : <span className="text-amber-600">Sin salida</span>
                  }
                </div>
                {r.notes && <p className="text-xs text-muted-foreground mt-1 italic">"{r.notes}"</p>}
              </div>
              <button onClick={() => setEditing(r)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0">
                <FileEdit size={13} /> Corregir
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
