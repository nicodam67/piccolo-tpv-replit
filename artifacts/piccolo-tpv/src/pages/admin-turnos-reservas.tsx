/**
 * Configuración de turnos de servicio para reservas.
 * Ruta: /admin/reservas/turnos
 */
import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Plus, Edit2, Trash2, X, Check, Loader2, Clock, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from '../lib/api-client';

interface Shift {
  id: string; nombre: string; tipo: string; horaInicio: string; horaFin: string;
  intervaloMinutos: number; capacidadMax: number; maxReservas: number;
  maxComensales: number; duracionDefault: number; diasActivos: number[]; activo: boolean;
}

const DIAS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const TIPOS = [{ v:"comida", l:"Comida" },{ v:"cena", l:"Cena" },{ v:"especial", l:"Especial" }];

const BLANK: Omit<Shift, "id"> = {
  nombre:"", tipo:"comida", horaInicio:"13:00", horaFin:"16:00",
  intervaloMinutos:15, capacidadMax:50, maxReservas:20, maxComensales:50,
  duracionDefault:90, diasActivos:[1,2,3,4,5,6], activo:true,
};

function ShiftModal({ initial, onClose, onSaved }: {
  initial?: Partial<Shift>; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<Omit<Shift,"id">>({ ...BLANK, ...(initial ?? {}) });
  const [busy, setBusy] = useState(false);
  const f = (k: keyof typeof form, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const toggleDay = (d: number) => {
    setForm(p => ({
      ...p,
      diasActivos: p.diasActivos.includes(d) ? p.diasActivos.filter(x => x !== d) : [...p.diasActivos, d].sort(),
    }));
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error("Nombre requerido"); return; }
    setBusy(true);
    try {
      if (isEdit) {
        await api.patch(`/api/service-shifts/${initial!.id}`, form);
        toast.success("Turno actualizado");
      } else {
        await api.post("/api/service-shifts", form);
        toast.success("Turno creado");
      }
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="font-black text-base">{isEdit ? "Editar turno" : "Nuevo turno"}</h2>
          <button onClick={onClose}><X size={16} className="text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Nombre *</label>
            <input type="text" value={form.nombre} onChange={e => f("nombre", e.target.value)} placeholder="Ej: Comida primer turno" autoFocus
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Tipo</label>
            <div className="flex gap-2">
              {TIPOS.map(t => (
                <button key={t.v} onClick={() => f("tipo", t.v)}
                  className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${form.tipo === t.v ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-border/60"}`}>
                  {t.l}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Hora inicio</label>
              <input type="time" value={form.horaInicio} onChange={e => f("horaInicio", e.target.value)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Hora fin</label>
              <input type="time" value={form.horaFin} onChange={e => f("horaFin", e.target.value)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Intervalo (min)</label>
              <select value={form.intervaloMinutos} onChange={e => f("intervaloMinutos", parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none">
                {[15,30,45,60].map(v => <option key={v} value={v}>{v} min</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Duración estándar (min)</label>
              <input type="number" min={15} step={15} value={form.duracionDefault} onChange={e => f("duracionDefault", parseInt(e.target.value)||90)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Cap. máx</label>
              <input type="number" min={1} value={form.capacidadMax} onChange={e => f("capacidadMax", parseInt(e.target.value)||1)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Máx reservas</label>
              <input type="number" min={1} value={form.maxReservas} onChange={e => f("maxReservas", parseInt(e.target.value)||1)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Máx comensales</label>
              <input type="number" min={1} value={form.maxComensales} onChange={e => f("maxComensales", parseInt(e.target.value)||1)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Días activos</label>
            <div className="flex gap-1.5">
              {DIAS.map((d, i) => (
                <button key={i} onClick={() => toggleDay(i)}
                  className={`flex-1 py-2 rounded-xl border text-[10px] font-bold transition-all ${form.diasActivos.includes(i) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground/40 hover:text-muted-foreground"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => f("activo", !form.activo)}
              className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${form.activo ? "bg-primary" : "bg-secondary"}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.activo ? "translate-x-5" : ""}`} />
            </div>
            <span className="text-sm font-bold">Turno activo</span>
          </label>
        </div>
        <div className="p-4 border-t border-border flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-secondary font-bold text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={busy}
            className="flex-1 py-2.5 bg-primary text-primary-foreground font-black text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} {isEdit ? "Guardar" : "Crear turno"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminTurnosReservas() {
  const [, setLocation] = useLocation();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setShifts(await api.get("/api/service-shifts") ?? []); }
    catch { toast.error("No se pudieron cargar los turnos"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (s: Shift) => {
    if (!confirm(`¿Eliminar turno "${s.nombre}"?`)) return;
    setBusyId(s.id);
    try {
      await api.delete(`/api/service-shifts/${s.id}`);
      toast.success("Turno eliminado");
      load();
    } catch (e: any) { toast.error(e.message); } finally { setBusyId(null); }
  };

  const TIPO_COLOR: Record<string,string> = { comida:"bg-amber-500/10 text-amber-400 border-amber-500/30", cena:"bg-indigo-500/10 text-indigo-400 border-indigo-500/30", especial:"bg-pink-500/10 text-pink-400 border-pink-500/30" };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-14 flex items-center px-4 gap-3 border-b border-border bg-card shrink-0">
        <button onClick={() => setLocation("/reservas")}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
          <ChevronLeft size={20} />
        </button>
        <Clock size={16} className="text-muted-foreground" />
        <h1 className="font-black text-base">Turnos de servicio</h1>
        <div className="flex-1" />
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground font-black rounded-xl hover:opacity-90 active:scale-95 transition-all text-xs shadow-md">
          <Plus size={14} /> Nuevo turno
        </button>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        <p className="text-sm text-muted-foreground mb-6">Los turnos definen los horarios disponibles para reservas, la capacidad y los días activos.</p>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : shifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Clock size={40} className="mb-4 opacity-20" />
            <p className="font-semibold">Sin turnos configurados</p>
            <button onClick={() => setShowCreate(true)} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl text-sm">
              <Plus size={14} className="inline mr-1.5" />Crear primer turno
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {shifts.map(s => (
              <div key={s.id} className={`bg-card border border-border rounded-xl p-4 ${!s.activo ? "opacity-50" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm">{s.nombre}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${TIPO_COLOR[s.tipo] ?? ""}`}>
                        {s.tipo}
                      </span>
                      {!s.activo && <span className="text-[9px] text-muted-foreground border border-border rounded-full px-2 py-0.5">Inactivo</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Clock size={9} />{s.horaInicio} – {s.horaFin}</span>
                      <span className="flex items-center gap-1"><Users size={9} />Máx {s.maxComensales} comensales</span>
                      <span>Duración: {s.duracionDefault}min</span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {DIAS.map((d, i) => (
                        <span key={i} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${(s.diasActivos ?? []).includes(i) ? "bg-primary/20 text-primary" : "bg-secondary/30 text-muted-foreground/30"}`}>{d}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditShift(s)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleDelete(s)} disabled={busyId === s.id}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      {busyId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreate && <ShiftModal onClose={() => setShowCreate(false)} onSaved={load} />}
      {editShift && <ShiftModal initial={editShift} onClose={() => setEditShift(null)} onSaved={load} />}
    </div>
  );
}
