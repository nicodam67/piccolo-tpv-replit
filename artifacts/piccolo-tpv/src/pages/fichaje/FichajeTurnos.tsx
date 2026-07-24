import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Edit2, Calendar, Search, X } from "lucide-react";
import { api } from "../../lib/api-client";
import {
  createTimeclockShift,
  deleteTimeclockShift,
  getTimeclockShifts,
  updateTimeclockShift,
} from "@workspace/api-client-react/timeclock";
import type { CreateTimeclockShiftInput, TimeclockShiftListItem } from "@workspace/api-client-react/timeclock";

type FichajeShiftRow = TimeclockShiftListItem;

interface Employee { id: string; name: string; }

const emptyForm = { employeeId: "", shiftDate: "", startTime: "", endTime: "", isSplit: false, splitStartTime: "", splitEndTime: "", notes: "" };

function ShiftModal({ shift, employees, onClose, onSaved }: { shift?: FichajeShiftRow; employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(shift ? {
    employeeId: shift.employeeId, shiftDate: shift.shiftDate, startTime: shift.startTime,
    endTime: shift.endTime, isSplit: shift.isSplit, splitStartTime: shift.splitStartTime ?? "",
    splitEndTime: shift.splitEndTime ?? "", notes: shift.notes ?? "",
  } : emptyForm);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const body: CreateTimeclockShiftInput = {
      employeeId: form.employeeId,
      shiftDate: form.shiftDate,
      startTime: form.startTime,
      endTime: form.endTime,
      isSplit: form.isSplit,
      splitStartTime: form.isSplit ? form.splitStartTime : undefined,
      splitEndTime: form.isSplit ? form.splitEndTime : undefined,
      notes: form.notes || undefined,
    };
    if (shift) {
      await updateTimeclockShift(shift.id, body);
    } else {
      await createTimeclockShift(body);
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4">{shift ? "Editar turno" : "Nuevo turno"}</h3>
        <div className="space-y-3">
          <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Empleado...</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input type="date" value={form.shiftDate} onChange={e => setForm(f => ({ ...f, shiftDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-gray-500">Inicio</label>
              <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-gray-500">Fin</label>
              <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.isSplit} onChange={e => setForm(f => ({ ...f, isSplit: e.target.checked }))} className="rounded" />
            Turno partido
          </label>
          {form.isSplit && (
            <div className="grid grid-cols-2 gap-2 pl-2 border-l-2 border-teal-200">
              <div><label className="text-xs text-gray-500">Inicio tarde</label>
                <input type="time" value={form.splitStartTime} onChange={e => setForm(f => ({ ...f, splitStartTime: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="text-xs text-gray-500">Fin tarde</label>
                <input type="time" value={form.splitEndTime} onChange={e => setForm(f => ({ ...f, splitEndTime: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
          )}
          <input placeholder="Notas (opcional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
          <button onClick={save} disabled={saving || !form.employeeId || !form.shiftDate || !form.startTime || !form.endTime}
            className="flex-1 bg-teal-600 text-white rounded-lg py-2 text-sm disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FichajeTurnos() {
  const [shifts, setShifts] = useState<FichajeShiftRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; shift?: FichajeShiftRow }>({ open: false });
  const [week, setWeek] = useState(() => new Date().toISOString().slice(0, 10));
  const [empSearch, setEmpSearch] = useState("");

  function getWeekRange(dateStr: string) {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
  }

  function load() {
    setLoading(true);
    const { from, to } = getWeekRange(week);
    getTimeclockShifts({ from, to })
      .then((d: TimeclockShiftListItem[]) => setShifts(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get<Employee[]>("/api/employees")
      .then(d => setEmployees(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    load();
    const onVisibility = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  async function deleteShift(id: string) {
    if (!confirm("¿Eliminar este turno?")) return;
    await deleteTimeclockShift(id);
    load();
  }

  const { from, to } = getWeekRange(week);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Turnos</h1>
        <button onClick={() => setModal({ open: true })} className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
          <Plus className="w-4 h-4" /> Nuevo turno
        </button>
      </div>

      {/* Week navigator */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex items-center gap-4 flex-wrap">
        <Calendar className="w-4 h-4 text-gray-400" />
        <input type="date" value={week} onChange={e => setWeek(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
        <span className="text-sm text-gray-500">Semana: {from} — {to}</span>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={empSearch}
            autoFocus
            onChange={e => setEmpSearch(e.target.value)}
            placeholder="Buscar empleado…"
            className="pl-9 pr-8 py-1.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/40"
          />
            {empSearch && (
              <button onClick={() => setEmpSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                <X size={13} />
              </button>
            )}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Cargando...</div>
      ) : shifts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Sin turnos esta semana</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Empleado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Horario</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Tipo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shifts.filter(s => !empSearch.trim() || s.employeeName.toLowerCase().includes(empSearch.trim().toLowerCase())).map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.employeeName}</td>
                  <td className="px-4 py-3 text-gray-700">{new Date(s.shiftDate + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {s.startTime} — {s.endTime}
                    {s.isSplit && <span className="ml-2 text-gray-400 text-xs">/ {s.splitStartTime} — {s.splitEndTime}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {s.isSplit
                      ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Partido</span>
                      : <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">Continuo</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setModal({ open: true, shift: s })} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => deleteShift(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && (
        <ShiftModal employees={employees} shift={modal.shift} onClose={() => setModal({ open: false })}
          onSaved={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
