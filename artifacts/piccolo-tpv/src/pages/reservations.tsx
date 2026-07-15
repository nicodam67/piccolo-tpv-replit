import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Phone, Users, Clock, X, Check,
  AlertCircle, Calendar, Loader2, Edit2, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";

// Inline fetch helpers (no generated hooks for simplicity — we call API directly
// using the same token/base pattern used in custom-fetch)
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("token") ?? "";
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Reservation {
  id: string;
  fecha: string;
  hora: string;
  nombre: string;
  telefono: string;
  personas: number;
  zonaPreferida?: string | null;
  mesaId?: string | null;
  notes: string;
  status: string;
  createdAt: string;
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pendiente:       { bg: "bg-yellow-500/15 border border-yellow-500/30 text-yellow-400", text: "text-yellow-400", label: "Pendiente" },
  confirmada:      { bg: "bg-green-500/15 border border-green-500/30 text-green-400",   text: "text-green-400",  label: "Confirmada" },
  cliente_llegado: { bg: "bg-blue-500/15 border border-blue-500/30 text-blue-400",      text: "text-blue-400",   label: "Ha llegado" },
  sentada:         { bg: "bg-purple-500/15 border border-purple-500/30 text-purple-400",text: "text-purple-400", label: "Sentada" },
  finalizada:      { bg: "bg-muted/40 border border-border text-muted-foreground",       text: "text-muted-foreground", label: "Finalizada" },
  cancelada:       { bg: "bg-red-500/15 border border-red-500/30 text-red-400",          text: "text-red-400",   label: "Cancelada" },
  no_presentado:   { bg: "bg-orange-500/15 border border-orange-500/30 text-orange-400",text: "text-orange-400", label: "No presentado" },
};

function today() {
  return new Date().toISOString().split("T")[0];
}
function addDays(date: string, d: number) {
  const dt = new Date(date);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().split("T")[0];
}
function formatDate(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

// ─── ReservationCard ──────────────────────────────────────────────────────────
function ReservationCard({
  r,
  isManager,
  onEdit,
  onDelete,
  onArrive,
  onStatusChange,
  busy,
}: {
  r: Reservation;
  isManager: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onArrive: () => void;
  onStatusChange: (status: string) => void;
  busy: boolean;
}) {
  const st = STATUS_STYLES[r.status] ?? STATUS_STYLES.pendiente;
  const isTerminal = ["finalizada", "cancelada", "no_presentado"].includes(r.status);
  const canArrive = r.status === "confirmada" || r.status === "pendiente";

  return (
    <div className={`bg-card border border-border rounded-xl p-4 transition-all hover:border-border/80 ${isTerminal ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-base">{r.nombre}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${st.bg}`}>{st.label}</span>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-muted-foreground text-xs flex-wrap">
            <span className="flex items-center gap-1"><Clock size={10} />{r.hora}</span>
            <span className="flex items-center gap-1"><Users size={10} />{r.personas}p</span>
            {r.telefono && <span className="flex items-center gap-1"><Phone size={10} />{r.telefono}</span>}
            {r.zonaPreferida && <span className="text-muted-foreground/60">{r.zonaPreferida}</span>}
          </div>
          {r.notes && <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{r.notes}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {canArrive && (
            <button
              onClick={onArrive}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold hover:bg-blue-500/30 active:scale-95 transition-all disabled:opacity-50"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={11} />}
              Llegó
            </button>
          )}
          {r.status === "cliente_llegado" && (
            <button
              onClick={() => onStatusChange("sentada")}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-bold hover:bg-purple-500/30 active:scale-95 transition-all disabled:opacity-50"
            >
              <Check size={11} /> Sentar
            </button>
          )}
          {r.status === "sentada" && (
            <button
              onClick={() => onStatusChange("finalizada")}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/60 text-muted-foreground border border-border rounded-lg text-xs font-bold hover:bg-muted active:scale-95 transition-all disabled:opacity-50"
            >
              <Check size={11} /> Finalizar
            </button>
          )}
          {r.status === "confirmada" && (
            <button
              onClick={() => onStatusChange("no_presentado")}
              disabled={busy}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-lg text-xs font-bold hover:bg-orange-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              <AlertCircle size={11} />
            </button>
          )}
          {!isTerminal && (
            <>
              <button onClick={onEdit} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Editar">
                <Edit2 size={12} />
              </button>
              {isManager && (
                <button onClick={onDelete} disabled={busy} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50" title="Eliminar">
                  <Trash2 size={12} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ReservationModal (create / edit) ─────────────────────────────────────────
const BLANK_FORM = { nombre: "", telefono: "", fecha: today(), hora: "20:00", personas: 2, zonaPreferida: "", notes: "" };

function ReservationModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Partial<Reservation>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    ...BLANK_FORM,
    fecha: initial?.fecha ?? today(),
    hora: initial?.hora ?? "20:00",
    nombre: initial?.nombre ?? "",
    telefono: initial?.telefono ?? "",
    personas: initial?.personas ?? 2,
    zonaPreferida: initial?.zonaPreferida ?? "",
    notes: initial?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    setBusy(true);
    try {
      if (isEdit) {
        await apiFetch(`/api/reservations/${initial!.id}`, { method: "PATCH", body: JSON.stringify(form) });
        toast.success("Reserva actualizada");
      } else {
        await apiFetch("/api/reservations", { method: "POST", body: JSON.stringify(form) });
        toast.success("Reserva creada");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar");
    } finally {
      setBusy(false);
    }
  };

  const f = (k: keyof typeof form, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-black text-lg">{isEdit ? "Editar reserva" : "Nueva reserva"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Fecha</label>
              <input type="date" value={form.fecha} onChange={e => f("fecha", e.target.value)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Hora</label>
              <input type="time" value={form.hora} onChange={e => f("hora", e.target.value)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Nombre del cliente *</label>
            <input type="text" value={form.nombre} onChange={e => f("nombre", e.target.value)} placeholder="Nombre o referencia"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Teléfono</label>
              <input type="tel" value={form.telefono} onChange={e => f("telefono", e.target.value)} placeholder="Opcional"
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Personas</label>
              <input type="number" min={1} max={99} value={form.personas} onChange={e => f("personas", parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Zona preferida</label>
            <input type="text" value={form.zonaPreferida} onChange={e => f("zonaPreferida", e.target.value)} placeholder="Terraza, interior..."
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Observaciones</label>
            <textarea rows={3} value={form.notes} onChange={e => f("notes", e.target.value)} placeholder="Alergias, celebración, preferencias..."
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60 resize-none" />
          </div>
        </div>
        <div className="p-4 border-t border-border flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors font-bold text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={busy}
            className="flex-1 py-2.5 bg-primary text-primary-foreground font-black text-sm rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isEdit ? "Guardar cambios" : "Crear reserva"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Reservations page ───────────────────────────────────────────────────
export default function Reservations() {
  const [, setLocation] = useLocation();
  const [date, setDate] = useState(today());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editReservation, setEditReservation] = useState<Reservation | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'pendiente' | 'confirmada' | 'llegado' | 'sentada' | 'finalizada' | 'cancelada'>('');

  const employeeRole = (() => {
    try { return JSON.parse(localStorage.getItem("employee") ?? "{}").role ?? ""; } catch { return ""; }
  })();
  const isManager = employeeRole === "admin" || employeeRole === "manager" || employeeRole === "encargado";

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/reservations?date=${date}`);
      setReservations(data ?? []);
    } catch { toast.error("No se pudo cargar las reservas"); }
    finally { setLoading(false); }
  };

  React.useEffect(() => {
    load();
    // Auto-refresh every 60 s so new reservations made from another device appear
    const interval = setInterval(load, 60_000);
    // Re-fetch immediately when tab comes back to foreground
    const handleVisibility = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const handleArrive = async (r: Reservation) => {
    setBusyId(r.id);
    try {
      const result = await apiFetch(`/api/reservations/${r.id}/arrive`, { method: "POST", body: JSON.stringify({ openTable: !!r.mesaId }) });
      toast.success(`${r.nombre} marcado como llegado`);
      if (result?.tableOpened) toast.success("Mesa abierta automáticamente");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleStatusChange = async (r: Reservation, status: string) => {
    setBusyId(r.id);
    try {
      await apiFetch(`/api/reservations/${r.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (r: Reservation) => {
    if (!confirm(`¿Eliminar reserva de ${r.nombre}?`)) return;
    setBusyId(r.id);
    try {
      await apiFetch(`/api/reservations/${r.id}`, { method: "DELETE" });
      toast.success("Reserva eliminada");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  // Group by hour slot
  const searchQ = search.trim().toLowerCase();
  const filteredReservations = reservations.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (!searchQ) return true;
    return (
      r.nombre.toLowerCase().includes(searchQ) ||
      (r.telefono ?? '').includes(searchQ) ||
      (r.zonaPreferida ?? '').toLowerCase().includes(searchQ) ||
      (r.notes ?? '').toLowerCase().includes(searchQ)
    );
  });

  const grouped = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    for (const r of filteredReservations) {
      const hour = r.hora.split(":")[0] + ":00";
      (map[hour] = map[hour] ?? []).push(r);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredReservations]);

  const activeCount = reservations.filter(r => !["cancelada", "no_presentado", "finalizada"].includes(r.status)).length;
  const totalPax   = reservations.filter(r => !["cancelada", "no_presentado"].includes(r.status)).reduce((s, r) => s + r.personas, 0);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-16 flex items-center px-4 gap-3 border-b border-border bg-card shrink-0 shadow-sm">
        <button onClick={() => setLocation("/tables")}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors active:scale-95">
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-muted-foreground" />
          <h1 className="text-lg font-black">Reservas</h1>
        </div>
        <div className="flex-1" />
        {/* Stats */}
        {!loading && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
            <span className="flex items-center gap-1.5"><span className="font-black text-foreground text-sm">{activeCount}</span> reservas</span>
            <span className="w-px h-3 bg-border" />
            <span className="flex items-center gap-1.5"><span className="font-black text-foreground text-sm">{totalPax}</span> comensales</span>
          </div>
        )}
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-black rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md text-sm"
        >
          <Plus size={16} /> Nueva reserva
        </button>
      </header>

      {/* Date navigator */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <button onClick={() => setDate(d => addDays(d, -1))} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors active:scale-90">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <div className="font-black text-base capitalize">{formatDate(date)}</div>
          {date === today() && <div className="text-[10px] uppercase tracking-widest text-primary font-bold mt-0.5">Hoy</div>}
        </div>
        <button onClick={() => setDate(d => addDays(d, 1))} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors active:scale-90">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Search + Status filter */}
      <div className="px-4 pt-3 pb-1 shrink-0 max-w-2xl mx-auto w-full flex gap-2">
        <input
          type="text"
          placeholder="Buscar por nombre, teléfono o zona…"
          value={search}
          autoFocus
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
          className="px-3 py-2 bg-secondary border border-border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Todos</option>
          <option value="pendiente">Pendiente</option>
          <option value="confirmada">Confirmada</option>
          <option value="llegado">Llegado</option>
          <option value="sentada">Sentada</option>
          <option value="finalizada">Finalizada</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Calendar size={48} className="mb-4 opacity-20" />
            <p className="text-lg font-semibold">{search || filterStatus ? 'Sin resultados para los filtros activos' : 'Sin reservas este día'}</p>
            {(search || filterStatus) ? (
              <button onClick={() => { setSearch(''); setFilterStatus(''); }} className="mt-3 text-primary font-semibold hover:underline text-sm">
                Borrar filtros
              </button>
            ) : (
              <button onClick={() => setShowCreate(true)} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all text-sm">
                <Plus size={14} className="inline mr-1.5" />Crear primera reserva
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([hour, list]) => (
              <div key={hour}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">{hour}</div>
                  <div className="flex-1 h-px bg-border/50" />
                  <div className="text-xs text-muted-foreground">{list.length} reserva{list.length !== 1 ? "s" : ""}</div>
                </div>
                <div className="space-y-2">
                  {list.map(r => (
                    <ReservationCard
                      key={r.id}
                      r={r}
                      isManager={isManager}
                      busy={busyId === r.id}
                      onEdit={() => setEditReservation(r)}
                      onDelete={() => handleDelete(r)}
                      onArrive={() => handleArrive(r)}
                      onStatusChange={(s) => handleStatusChange(r, s)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      {showCreate && <ReservationModal onClose={() => setShowCreate(false)} onSaved={load} />}
      {editReservation && <ReservationModal initial={editReservation} onClose={() => setEditReservation(null)} onSaved={load} />}
    </div>
  );
}
