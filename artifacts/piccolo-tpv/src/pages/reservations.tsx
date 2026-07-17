/**
 * Reservations — professional multi-tab reservation management.
 * Tabs: Día (day view) | Semana (week view) | Lista de espera
 */
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, ChevronRight, Plus, Phone, Users, Clock, X, Check,
  AlertCircle, Calendar, Loader2, Edit2, Trash2, UserCheck, Search,
  Baby, Accessibility, Dog, Star, MessageSquare, MapPin, Globe,
  ClipboardList, Timer, BarChart2, User, Mail, Hash, AlertTriangle,
  CalendarRange, ListFilter, Soup, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { api } from '../lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Reservation {
  id: string; fecha: string; hora: string; nombre: string; telefono: string;
  email: string; personas: number; zonaPreferida?: string | null;
  mesaId?: string | null; mesaNumero?: string | null; duracionMinutos: number;
  idioma: string; alergias: string; trona: boolean; accesibilidad: boolean;
  mascota: boolean; ocasion?: string | null; canal: string; notes: string;
  notasInternas: string; status: string; clientId?: string | null;
  clientNombre?: string | null; shiftId?: string | null;
  confirmacionRequerida: boolean; recordatorioEnviado: boolean; createdAt: string;
}
interface WaitingEntry {
  id: string; nombre: string; telefono: string; personas: number;
  horaLlegada: string; zonaPreferida?: string | null; tiempoEstimado?: number | null;
  status: string; observaciones: string; createdAt: string;
}
interface CrmClient {
  id: string; nombre: string; apellidos: string; telefono: string; email: string;
  alergias?: string; observaciones?: string; totalVisitas?: number;
}
interface Zone { id: string; name: string; }
interface TableRow { id: string; tableNumber: string; capacity: number; status: string; zoneName?: string; }

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS: Record<string, { color: string; label: string; dot: string }> = {
  pendiente:           { color: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400",    dot: "bg-yellow-400", label: "Pendiente" },
  confirmada:          { color: "bg-green-500/15 border-green-500/30 text-green-400",       dot: "bg-green-400",  label: "Confirmada" },
  recordatorio_enviado:{ color: "bg-teal-500/15 border-teal-500/30 text-teal-400",         dot: "bg-teal-400",   label: "Recordatorio" },
  cliente_avisado:     { color: "bg-cyan-500/15 border-cyan-500/30 text-cyan-400",          dot: "bg-cyan-400",   label: "Avisado" },
  cliente_llegado:     { color: "bg-blue-500/15 border-blue-500/30 text-blue-400",          dot: "bg-blue-400",   label: "Ha llegado" },
  sentada:             { color: "bg-purple-500/15 border-purple-500/30 text-purple-400",    dot: "bg-purple-400", label: "Sentada" },
  finalizada:          { color: "bg-muted/40 border-border text-muted-foreground",           dot: "bg-muted-foreground", label: "Finalizada" },
  cancelada_cliente:   { color: "bg-red-500/15 border-red-500/30 text-red-400",             dot: "bg-red-400",    label: "Canc. cliente" },
  cancelada_restaurante:{ color: "bg-red-700/15 border-red-700/30 text-red-400",            dot: "bg-red-600",    label: "Canc. local" },
  no_presentado:       { color: "bg-orange-500/15 border-orange-500/30 text-orange-400",    dot: "bg-orange-400", label: "No presentado" },
  en_espera:           { color: "bg-indigo-500/15 border-indigo-500/30 text-indigo-400",    dot: "bg-indigo-400", label: "En espera" },
};
const TERMINAL = ["finalizada", "cancelada_cliente", "cancelada_restaurante", "no_presentado"];
const CANALES = ["phone","web","email","walkin","google","social"];
const OCASIONES = ["birthday","anniversary","business","communion","group","private"];
const OCASION_LABEL: Record<string,string> = { birthday:"Cumpleaños",anniversary:"Aniversario",business:"Empresa",communion:"Comunión",group:"Grupo",private:"Evento privado" };
const CANAL_LABEL: Record<string,string> = { phone:"Teléfono",web:"Web",email:"Email",walkin:"Presencial",google:"Google",social:"RRSS" };

// ─── Utils ────────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split("T")[0]; }
function addDays(date: string, d: number) {
  const dt = new Date(date + "T12:00:00"); dt.setDate(dt.getDate() + d);
  return dt.toISOString().split("T")[0];
}
function monday(date: string) {
  const dt = new Date(date + "T12:00:00");
  const day = dt.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().split("T")[0];
}
function fmtDay(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}
function fmtShort(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
function waitMinutes(llegada: string) {
  return Math.round((Date.now() - new Date(llegada).getTime()) / 60000);
}

// ─── ReservationCard ──────────────────────────────────────────────────────────
function ReservationCard({ r, isManager, onEdit, onDelete, onStatusChange, onArrive, busy }: {
  r: Reservation; isManager: boolean; onEdit: () => void; onDelete: () => void;
  onStatusChange: (s: string, notes?: string) => void; onArrive: () => void; busy: boolean;
}) {
  const st = STATUS[r.status] ?? STATUS.pendiente;
  const isTerminal = TERMINAL.includes(r.status);

  return (
    <div className={`bg-card border border-border rounded-xl p-4 transition-all ${isTerminal ? "opacity-55" : "hover:border-border/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-sm">{r.nombre}</span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${st.color}`}>{st.label}</span>
            {r.trona && <span title="Trona"><Baby size={12} className="text-pink-400" /></span>}
            {r.accesibilidad && <span title="Accesibilidad PMR"><Accessibility size={12} className="text-blue-400" /></span>}
            {r.alergias && <span title={`Alergias: ${r.alergias}`}><AlertTriangle size={12} className="text-amber-400" /></span>}
            {r.ocasion && <span title={OCASION_LABEL[r.ocasion] ?? r.ocasion}><Star size={12} className="text-yellow-400" /></span>}
            {r.clientId && <span title="Cliente CRM vinculado"><User size={12} className="text-primary/70" /></span>}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-muted-foreground text-[11px] flex-wrap">
            <span className="flex items-center gap-1"><Clock size={9} />{r.hora}</span>
            <span className="flex items-center gap-1"><Users size={9} />{r.personas}p</span>
            <span className="flex items-center gap-1"><Timer size={9} />{r.duracionMinutos}min</span>
            {r.telefono && <span className="flex items-center gap-1"><Phone size={9} />{r.telefono}</span>}
            {r.zonaPreferida && <span className="flex items-center gap-1"><MapPin size={9} />{r.zonaPreferida}</span>}
            {r.mesaNumero && <span className="flex items-center gap-1"><Hash size={9} />M.{r.mesaNumero}</span>}
          </div>
          {r.alergias && <p className="text-[10px] text-amber-400/80 mt-1">⚠️ {r.alergias}</p>}
          {r.notes && <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{r.notes}</p>}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {/* Primary action */}
          {(r.status === "pendiente" || r.status === "confirmada" || r.status === "recordatorio_enviado" || r.status === "cliente_avisado") && (
            <button onClick={onArrive} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-[11px] font-bold hover:bg-blue-500/30 active:scale-95 transition-all disabled:opacity-50">
              {busy ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={11} />} Llegó
            </button>
          )}
          {r.status === "cliente_llegado" && (
            <button onClick={() => onStatusChange("sentada")} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-[11px] font-bold hover:bg-purple-500/30 active:scale-95 transition-all disabled:opacity-50">
              <Check size={11} /> Sentar
            </button>
          )}
          {r.status === "sentada" && (
            <button onClick={() => onStatusChange("finalizada")} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/60 text-muted-foreground border border-border rounded-lg text-[11px] font-bold hover:bg-muted active:scale-95 transition-all disabled:opacity-50">
              <Check size={11} /> Finalizar
            </button>
          )}
          {r.status === "pendiente" && (
            <button onClick={() => onStatusChange("confirmada")} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-[11px] font-bold hover:bg-green-500/30 active:scale-95 transition-all disabled:opacity-50">
              <Check size={11} /> Confirmar
            </button>
          )}
          {/* Secondary actions */}
          <div className="flex items-center gap-1">
            {!isTerminal && r.status !== "sentada" && r.status !== "finalizada" && (
              <button onClick={() => onStatusChange("no_presentado")} disabled={busy} title="No presentado"
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-orange-500/10 text-orange-400/60 hover:text-orange-400 transition-colors disabled:opacity-50">
                <AlertCircle size={12} />
              </button>
            )}
            {!isTerminal && !["cliente_llegado","sentada"].includes(r.status) && (
              <button onClick={() => onStatusChange("cancelada_cliente")} disabled={busy} title="Cancelar"
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-colors disabled:opacity-50">
                <X size={12} />
              </button>
            )}
            {!isTerminal && <button onClick={onEdit} title="Editar"
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <Edit2 size={11} />
            </button>}
            {isManager && !isTerminal && <button onClick={onDelete} disabled={busy} title="Eliminar"
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50">
              <Trash2 size={11} />
            </button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WaitingCard ──────────────────────────────────────────────────────────────
function WaitingCard({ entry, onStatusChange, onDelete, busy }: {
  entry: WaitingEntry; onStatusChange: (s: string) => void;
  onDelete: () => void; busy: boolean;
}) {
  const waited = waitMinutes(entry.horaLlegada);
  const isActive = ["esperando","avisado"].includes(entry.status);
  const statusColors: Record<string,string> = {
    esperando:"text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
    avisado:"text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
    sentado:"text-purple-400 border-purple-500/30 bg-purple-500/10",
    cancelado:"text-muted-foreground border-border bg-muted/20",
    no_localizado:"text-orange-400 border-orange-500/30 bg-orange-500/10",
  };
  const col = statusColors[entry.status] ?? statusColors.esperando;

  return (
    <div className={`bg-card border border-border rounded-xl p-4 ${!isActive ? "opacity-55" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{entry.nombre}</span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${col}`}>
              {entry.status.replace("_"," ")}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-muted-foreground text-[11px]">
            <span className="flex items-center gap-1"><Users size={9} />{entry.personas}p</span>
            <span className="flex items-center gap-1"><Clock size={9} />{fmtTime(entry.horaLlegada)}</span>
            <span className={`font-bold ${waited > 30 ? "text-red-400" : waited > 15 ? "text-orange-400" : "text-muted-foreground"}`}>
              {waited} min esperando
            </span>
            {entry.zonaPreferida && <span className="flex items-center gap-1"><MapPin size={9} />{entry.zonaPreferida}</span>}
          </div>
          {entry.observaciones && <p className="text-[10px] text-muted-foreground mt-1">{entry.observaciones}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {entry.status === "esperando" && (
            <button onClick={() => onStatusChange("avisado")} disabled={busy}
              className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-[11px] font-bold hover:bg-cyan-500/30 transition-all disabled:opacity-50">
              Avisar
            </button>
          )}
          {entry.status === "avisado" && (
            <button onClick={() => onStatusChange("sentado")} disabled={busy}
              className="px-3 py-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-[11px] font-bold hover:bg-purple-500/30 transition-all disabled:opacity-50">
              Sentado
            </button>
          )}
          {isActive && (
            <>
              <button onClick={() => onStatusChange("no_localizado")} disabled={busy} title="No localizado"
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-orange-500/10 text-orange-400/60 hover:text-orange-400 transition-colors">
                <AlertCircle size={11} />
              </button>
              <button onClick={() => onStatusChange("cancelado")} disabled={busy} title="Cancelar"
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-colors">
                <X size={11} />
              </button>
            </>
          )}
          <button onClick={onDelete} disabled={busy} title="Eliminar"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CRM Client search panel ──────────────────────────────────────────────────
function ClientSearch({ onSelect }: { onSelect: (c: CrmClient | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CrmClient[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.get<CrmClient[]>(`/api/clients?q=${encodeURIComponent(q)}&limit=8`);
        setResults(data ?? []);
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 border border-border rounded-xl">
        <Search size={12} className="text-muted-foreground shrink-0" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente CRM por nombre, teléfono o email..."
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/50" />
        {loading && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
        {q && <button onClick={() => { setQ(""); setResults([]); onSelect(null); }}><X size={12} className="text-muted-foreground" /></button>}
      </div>
      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto">
          {results.map(c => (
            <button key={c.id} onClick={() => { onSelect(c); setQ(`${c.nombre} ${c.apellidos}`.trim()); setResults([]); }}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left">
              <User size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-bold">{c.nombre} {c.apellidos}</div>
                <div className="text-[11px] text-muted-foreground">{c.telefono} · {c.email}</div>
                {c.totalVisitas !== undefined && <div className="text-[10px] text-muted-foreground/60">{c.totalVisitas} visitas</div>}
              </div>
            </button>
          ))}
          <button onClick={() => { onSelect(null); setQ(""); setResults([]); }}
            className="w-full px-4 py-2 text-[11px] text-muted-foreground hover:bg-secondary transition-colors border-t border-border text-center">
            Continuar sin vincular cliente
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Reservation Modal ────────────────────────────────────────────────────────
const BLANK: Partial<Reservation> = {
  nombre:"", telefono:"", email:"", fecha: today(), hora:"20:00", personas:2,
  zonaPreferida:"", mesaId: null, duracionMinutos:90, idioma:"es", alergias:"",
  trona:false, accesibilidad:false, mascota:false, ocasion: null, canal:"phone",
  notes:"", notasInternas:"", confirmacionRequerida:false, clientId: null,
};

function ReservationModal({ initial, zones, tables, onClose, onSaved }: {
  initial?: Partial<Reservation>; zones: Zone[]; tables: TableRow[];
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<Partial<Reservation>>({ ...BLANK, ...initial });
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"datos"|"especial"|"admin">("datos");
  const [selectedClient, setSelectedClient] = useState<CrmClient | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<TableRow[]>([]);

  const f = (k: keyof Reservation, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const handleClientSelect = (c: CrmClient | null) => {
    setSelectedClient(c);
    if (c) {
      setForm(p => ({
        ...p,
        clientId: c.id,
        nombre: c.nombre + (c.apellidos ? " " + c.apellidos : ""),
        telefono: p.telefono || c.telefono,
        email:    p.email    || c.email,
        alergias: p.alergias || c.alergias || "",
      }));
    } else {
      setForm(p => ({ ...p, clientId: null }));
    }
  };

  const suggestTable = async () => {
    if (!form.fecha || !form.hora) { toast.error("Introduce fecha y hora primero"); return; }
    setSuggesting(true);
    try {
      const data = await api.get<{ suggestions?: TableRow[] }>(`/api/reservations/suggest-table?fecha=${form.fecha}&hora=${form.hora}&duracion=${form.duracionMinutos}&personas=${form.personas}&zona=${form.zonaPreferida ?? ""}`);
      setSuggestions(data.suggestions ?? []);
      if (!data.suggestions?.length) toast.info("No hay mesas disponibles para ese horario");
    } catch { toast.error("No se pudo obtener sugerencias"); }
    finally { setSuggesting(false); }
  };

  const handleSave = async () => {
    if (!form.nombre?.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (!form.fecha || !form.hora) { toast.error("Fecha y hora requeridas"); return; }
    setBusy(true);
    try {
      const payload = {
        ...form,
        zonaPreferida: form.zonaPreferida || null,
        ocasion: form.ocasion || null,
        mesaId: form.mesaId || null,
        clientId: form.clientId || null,
      };
      if (isEdit) {
        await api.patch(`/api/reservations/${initial!.id}`, payload);
        toast.success("Reserva actualizada");
      } else {
        await api.post("/api/reservations", payload);
        toast.success("Reserva creada");
      }
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message ?? "Error al guardar"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="font-black text-base">{isEdit ? "Editar reserva" : "Nueva reserva"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(["datos","especial","admin"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-bold capitalize transition-colors ${tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "datos" ? "Datos" : t === "especial" ? "Necesidades" : "Admin"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === "datos" && (
            <>
              {/* CRM client lookup */}
              {!isEdit && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Buscar cliente CRM</label>
                  <ClientSearch onSelect={handleClientSelect} />
                  {selectedClient && <p className="text-[11px] text-primary mt-1">✓ Vinculado a {selectedClient.nombre}</p>}
                </div>
              )}

              {/* Date/time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Fecha *</label>
                  <input type="date" value={form.fecha ?? ""} onChange={e => f("fecha", e.target.value)}
                    className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Hora *</label>
                  <input type="time" value={form.hora ?? ""} onChange={e => f("hora", e.target.value)}
                    className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
                </div>
              </div>

              {/* Nombre / Teléfono */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Nombre *</label>
                <input type="text" value={form.nombre ?? ""} onChange={e => f("nombre", e.target.value)} placeholder="Nombre del cliente" autoFocus
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Teléfono</label>
                  <input type="tel" value={form.telefono ?? ""} onChange={e => f("telefono", e.target.value)}
                    className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Personas</label>
                  <input type="number" min={1} max={99} value={form.personas ?? 2} onChange={e => f("personas", parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Email</label>
                <input type="email" value={form.email ?? ""} onChange={e => f("email", e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
              </div>

              {/* Zone / Table */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Zona preferida</label>
                  <select value={form.zonaPreferida ?? ""} onChange={e => f("zonaPreferida", e.target.value || null)}
                    className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60">
                    <option value="">Sin preferencia</option>
                    {zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Duración (min)</label>
                  <input type="number" min={15} step={15} max={480} value={form.duracionMinutos ?? 90} onChange={e => f("duracionMinutos", parseInt(e.target.value) || 90)}
                    className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
                </div>
              </div>

              {/* Table assignment */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mesa asignada</label>
                  <button onClick={suggestTable} disabled={suggesting}
                    className="text-[10px] text-primary hover:underline flex items-center gap-1 disabled:opacity-50">
                    {suggesting ? <Loader2 size={10} className="animate-spin" /> : <Star size={10} />}
                    Sugerir mesa
                  </button>
                </div>
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {suggestions.map((s: any) => (
                      <button key={s.id} onClick={() => { f("mesaId", s.id); setSuggestions([]); }}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all ${form.mesaId === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20"}`}>
                        M.{s.tableNumber} ({s.capacity}p) {s.zoneName ? `· ${s.zoneName}` : ""}
                      </button>
                    ))}
                    <button onClick={() => setSuggestions([])} className="px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">
                      Cerrar
                    </button>
                  </div>
                )}
                <select value={form.mesaId ?? ""} onChange={e => f("mesaId", e.target.value || null)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60">
                  <option value="">Sin asignar</option>
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>
                      Mesa {t.tableNumber} ({t.capacity}p){t.zoneName ? ` — ${t.zoneName}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Observaciones</label>
                <textarea rows={2} value={form.notes ?? ""} onChange={e => f("notes", e.target.value)} placeholder="Preferencias, detalles..."
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60 resize-none" />
              </div>
            </>
          )}

          {tab === "especial" && (
            <>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Alergias / necesidades alimentarias</label>
                <input type="text" value={form.alergias ?? ""} onChange={e => f("alergias", e.target.value)} placeholder="Gluten, lactosa, nueces..."
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Ocasión especial</label>
                <select value={form.ocasion ?? ""} onChange={e => f("ocasion", e.target.value || null)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60">
                  <option value="">Ninguna</option>
                  {OCASIONES.map(o => <option key={o} value={o}>{OCASION_LABEL[o]}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([["trona","Baby","Trona necesaria"],["accesibilidad","Accessibility","Accesibilidad PMR"],["mascota","Dog","Mascota"]] as [keyof Reservation, string, string][]).map(([k, , label]) => (
                  <button key={k} onClick={() => f(k, !form[k])}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${form[k] ? "border-primary bg-primary/10 text-foreground" : "border-border bg-secondary/30 text-muted-foreground hover:border-border/60"}`}>
                    {k === "trona" && <Baby size={20} />}
                    {k === "accesibilidad" && <Accessibility size={20} />}
                    {k === "mascota" && <Dog size={20} />}
                    <span className="text-[10px] font-bold text-center leading-tight">{label}</span>
                  </button>
                ))}
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Idioma del cliente</label>
                <select value={form.idioma ?? "es"} onChange={e => f("idioma", e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60">
                  {[["es","Español"],["en","English"],["fr","Français"],["de","Deutsch"],["it","Italiano"],["pt","Português"],["zh","中文"],["ar","العربية"]].map(([v,l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {tab === "admin" && (
            <>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Canal de entrada</label>
                <select value={form.canal ?? "phone"} onChange={e => f("canal", e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60">
                  {CANALES.map(c => <option key={c} value={c}>{CANAL_LABEL[c]}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div onClick={() => f("confirmacionRequerida", !form.confirmacionRequerida)}
                  className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${form.confirmacionRequerida ? "bg-primary" : "bg-secondary"}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.confirmacionRequerida ? "translate-x-5" : ""}`} />
                </div>
                <div>
                  <div className="text-sm font-bold">Confirmación requerida</div>
                  <div className="text-[10px] text-muted-foreground">Exigir confirmación al cliente</div>
                </div>
              </label>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Notas internas (no visibles al cliente)</label>
                <textarea rows={3} value={form.notasInternas ?? ""} onChange={e => f("notasInternas", e.target.value)} placeholder="Solo para uso interno del restaurante..."
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60 resize-none" />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors font-bold text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={busy}
            className="flex-1 py-2.5 bg-primary text-primary-foreground font-black text-sm rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isEdit ? "Guardar" : "Crear reserva"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Waiting Modal ────────────────────────────────────────────────────────────
function WaitingModal({ zones, onClose, onSaved }: { zones: Zone[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ nombre:"", telefono:"", personas:2, zonaPreferida:"", observaciones:"" });
  const [busy, setBusy] = useState(false);
  const f = (k: keyof typeof form, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error("Nombre requerido"); return; }
    setBusy(true);
    try {
      await api.post("/api/waiting-list", { ...form, personas: Number(form.personas) });
      toast.success("Añadido a la lista de espera");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-black text-base">Añadir a lista de espera</h2>
          <button onClick={onClose}><X size={16} className="text-muted-foreground" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Nombre *</label>
            <input type="text" value={form.nombre} onChange={e => f("nombre", e.target.value)} autoFocus
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Teléfono</label>
              <input type="tel" value={form.telefono} onChange={e => f("telefono", e.target.value)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Personas</label>
              <input type="number" min={1} max={30} value={form.personas} onChange={e => f("personas", parseInt(e.target.value)||1)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Zona preferida</label>
            <select value={form.zonaPreferida} onChange={e => f("zonaPreferida", e.target.value)}
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60">
              <option value="">Indiferente</option>
              {zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Observaciones</label>
            <textarea rows={2} value={form.observaciones} onChange={e => f("observaciones", e.target.value)}
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-primary/60 resize-none" />
          </div>
        </div>
        <div className="p-4 border-t border-border flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-secondary font-bold text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={busy}
            className="flex-1 py-2.5 bg-primary text-primary-foreground font-black text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Añadir
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────
function WeekView({ weekStart, onDayClick }: { weekStart: string; onDayClick: (d: string) => void }) {
  const [counts, setCounts] = useState<Record<string, { total: number; active: number; pax: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const weekEnd = addDays(weekStart, 6);
    api.get(`/api/reservations?from=${weekStart}&to=${weekEnd}`)
      .then((data: Reservation[]) => {
        const map: Record<string, { total: number; active: number; pax: number }> = {};
        for (const r of data ?? []) {
          if (!map[r.fecha]) map[r.fecha] = { total: 0, active: 0, pax: 0 };
          map[r.fecha].total++;
          if (!TERMINAL.includes(r.status)) { map[r.fecha].active++; map[r.fecha].pax += r.personas; }
        }
        setCounts(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weekStart]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = today();

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map(d => {
        const c = counts[d];
        const isToday = d === todayStr;
        return (
          <button key={d} onClick={() => onDayClick(d)}
            className={`flex flex-col items-center p-3 rounded-xl border transition-all hover:border-primary/40 ${isToday ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              {new Date(d + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short" })}
            </div>
            <div className={`text-xl font-black mt-0.5 ${isToday ? "text-primary" : ""}`}>
              {new Date(d + "T12:00:00").getDate()}
            </div>
            {loading ? (
              <div className="w-4 h-4 mt-1 rounded-full bg-secondary animate-pulse" />
            ) : c ? (
              <div className="mt-1 flex flex-col items-center gap-0.5">
                <span className="text-xs font-black text-foreground">{c.active}</span>
                <span className="text-[9px] text-muted-foreground">{c.pax}p</span>
              </div>
            ) : (
              <div className="mt-1 text-[9px] text-muted-foreground/40">—</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
type Tab = "dia" | "semana" | "espera";

export default function Reservations() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("dia");
  const [date, setDate] = useState(today());
  const [weekStart, setWeekStart] = useState(monday(today()));
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waiting, setWaiting] = useState<WaitingEntry[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editRes, setEditRes] = useState<Reservation | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showWaiting, setShowWaiting] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const employeeRole = (() => {
    try { return JSON.parse(localStorage.getItem("employee") ?? "{}").role ?? ""; } catch { return ""; }
  })();
  const isManager = ["admin","manager","encargado"].includes(employeeRole);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/api/reservations?date=${date}`);
      setReservations(Array.isArray(data) ? data : []);
    } catch { toast.error("No se pudo cargar las reservas"); }
    finally { setLoading(false); }
  }, [date]);

  const loadWaiting = useCallback(async () => {
    try {
      const data = await api.get("/api/waiting-list?active=true");
      setWaiting(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const [z, t] = await Promise.all([
        api.get<Zone[]>("/api/zones").catch(() => [] as Zone[]),
        api.get<TableRow[]>("/api/tables").catch(() => [] as TableRow[]),
      ]);
      setZones(z ?? []);
      setTables(t ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadReservations();
    const interval = setInterval(loadReservations, 60_000);
    const onVis = () => { if (!document.hidden) loadReservations(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVis); };
  }, [loadReservations]);

  useEffect(() => { loadWaiting(); loadMeta(); }, [loadWaiting, loadMeta]);
  useEffect(() => {
    const t = setInterval(loadWaiting, 30_000);
    return () => clearInterval(t);
  }, [loadWaiting]);

  const handleArrive = async (r: Reservation) => {
    setBusyId(r.id);
    try {
      const result = await api.post<{ tableOpened?: boolean }>(`/api/reservations/${r.id}/arrive`, { openTable: !!r.mesaId });
      toast.success(`${r.nombre} marcado como llegado`);
      if (result?.tableOpened) toast.success("Mesa abierta automáticamente");
      loadReservations();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleStatusChange = async (r: Reservation, status: string) => {
    setBusyId(r.id);
    try {
      await api.patch(`/api/reservations/${r.id}`, { status });
      loadReservations();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (r: Reservation) => {
    if (!confirm(`¿Eliminar reserva de ${r.nombre}?`)) return;
    setBusyId(r.id);
    try {
      await api.delete(`/api/reservations/${r.id}`);
      toast.success("Reserva eliminada");
      loadReservations();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleWaitingStatus = async (id: string, status: string) => {
    setBusyId(id);
    try {
      await api.patch(`/api/waiting-list/${id}`, { status });
      loadWaiting();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleWaitingDelete = async (id: string) => {
    setBusyId(id);
    try {
      await api.delete(`/api/waiting-list/${id}`);
      loadWaiting();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  // Filtered + grouped reservations
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reservations.filter(r => {
      if (filterStatus && r.status !== filterStatus) return false;
      if (!q) return true;
      return (
        r.nombre.toLowerCase().includes(q) ||
        (r.telefono ?? "").includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.zonaPreferida ?? "").toLowerCase().includes(q) ||
        (r.mesaNumero ?? "").includes(q)
      );
    });
  }, [reservations, search, filterStatus]);

  const grouped = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    for (const r of filtered) {
      const hour = r.hora.split(":")[0] + ":00";
      (map[hour] = map[hour] ?? []).push(r);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const activeCount = reservations.filter(r => !TERMINAL.includes(r.status)).length;
  const totalPax   = reservations.filter(r => !["cancelada_cliente","cancelada_restaurante","no_presentado"].includes(r.status)).reduce((s, r) => s + r.personas, 0);
  const waitingActive = waiting.filter(w => ["esperando","avisado"].includes(w.status)).length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 flex items-center px-4 gap-3 border-b border-border bg-card shrink-0">
        <button onClick={() => setLocation("/tables")}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
          <ChevronLeft size={20} />
        </button>
        <Calendar size={16} className="text-muted-foreground" />
        <h1 className="font-black text-base">Reservas</h1>
        <div className="flex-1" />
        {!loading && tab === "dia" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span><span className="font-black text-foreground">{activeCount}</span> reservas</span>
            <span className="text-border">|</span>
            <span><span className="font-black text-foreground">{totalPax}</span> pax</span>
            {waitingActive > 0 && (
              <>
                <span className="text-border">|</span>
                <span className="text-orange-400 font-bold">{waitingActive} en espera</span>
              </>
            )}
          </div>
        )}
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground font-black rounded-xl hover:opacity-90 active:scale-95 transition-all text-xs shadow-md">
          <Plus size={14} /> Reserva
        </button>
      </header>

      {/* Tab bar */}
      <div className="bg-card border-b border-border flex shrink-0">
        {([["dia","Día",<CalendarRange size={13} />],["semana","Semana",<BarChart2 size={13} />],["espera","Espera",<ClipboardList size={13} />]] as [Tab, string, React.ReactNode][]).map(([t, label, icon]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors relative ${tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {icon} {label}
            {t === "espera" && waitingActive > 0 && (
              <span className="absolute top-2 right-[calc(50%-24px)] w-4 h-4 bg-orange-500 text-white rounded-full text-[9px] font-black flex items-center justify-center">{waitingActive}</span>
            )}
            {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
          </button>
        ))}
      </div>

      {/* ── DÍA TAB ─────────────────────────────────────────────────────────── */}
      {tab === "dia" && (
        <>
          {/* Date nav */}
          <div className="bg-card border-b border-border px-4 py-2.5 flex items-center justify-between shrink-0">
            <button onClick={() => setDate(d => addDays(d, -1))} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors">
              <ChevronLeft size={16} />
            </button>
            <div className="text-center">
              <div className="font-black text-sm capitalize">{fmtDay(date)}</div>
              {date === today() && <div className="text-[9px] uppercase tracking-widest text-primary font-bold">Hoy</div>}
            </div>
            <button onClick={() => setDate(d => addDays(d, 1))} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Search / filter */}
          <div className="px-4 pt-3 pb-2 shrink-0 flex gap-2 max-w-2xl mx-auto w-full">
            <div className="flex-1 flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2">
              <Search size={12} className="text-muted-foreground shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." autoFocus
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/50 min-w-0" />
              {search && <button onClick={() => setSearch("")}><X size={12} className="text-muted-foreground" /></button>}
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-xs font-semibold focus:outline-none">
              <option value="">Todos</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button onClick={loadReservations} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-secondary border border-border text-muted-foreground">
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Content */}
          <main className="flex-1 max-w-2xl mx-auto w-full px-4 pb-8 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
            ) : grouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Calendar size={40} className="mb-4 opacity-20" />
                <p className="font-semibold">{search || filterStatus ? "Sin resultados" : "Sin reservas este día"}</p>
                {(search || filterStatus) ? (
                  <button onClick={() => { setSearch(""); setFilterStatus(""); }} className="mt-2 text-primary font-semibold hover:underline text-sm">Borrar filtros</button>
                ) : (
                  <button onClick={() => setShowCreate(true)} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 text-sm">
                    <Plus size={14} className="inline mr-1.5" />Primera reserva
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-5 pt-2">
                {grouped.map(([hour, list]) => (
                  <div key={hour}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{hour}</div>
                      <div className="flex-1 h-px bg-border/50" />
                      <div className="text-[10px] text-muted-foreground">{list.reduce((s,r)=>s+r.personas,0)}p</div>
                    </div>
                    <div className="space-y-2">
                      {list.map(r => (
                        <ReservationCard key={r.id} r={r} isManager={isManager} busy={busyId === r.id}
                          onEdit={() => setEditRes(r)}
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
        </>
      )}

      {/* ── SEMANA TAB ───────────────────────────────────────────────────────── */}
      {tab === "semana" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <button onClick={() => setWeekStart(d => addDays(d, -7))} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground">
              <ChevronLeft size={16} />
            </button>
            <div className="text-sm font-bold text-center">
              {fmtShort(weekStart)} — {fmtShort(addDays(weekStart, 6))}
            </div>
            <button onClick={() => setWeekStart(d => addDays(d, 7))} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="p-4">
            <WeekView weekStart={weekStart} onDayClick={(d) => { setDate(d); setTab("dia"); }} />
          </div>
          <div className="px-4 pb-4 text-center text-xs text-muted-foreground">Toca un día para ver sus reservas</div>
        </div>
      )}

      {/* ── ESPERA TAB ───────────────────────────────────────────────────────── */}
      {tab === "espera" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-black text-sm">Lista de espera</h2>
              <p className="text-[11px] text-muted-foreground">Clientes sin reserva esperando mesa</p>
            </div>
            <button onClick={() => setShowWaiting(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground font-black rounded-xl text-xs">
              <Plus size={13} /> Añadir
            </button>
          </div>
          <div className="p-4 space-y-2 max-w-2xl mx-auto">
            {waiting.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ClipboardList size={36} className="mb-3 opacity-20" />
                <p className="font-semibold text-sm">Lista vacía</p>
                <p className="text-xs mt-1">No hay clientes esperando</p>
              </div>
            ) : (
              waiting.map(entry => (
                <WaitingCard key={entry.id} entry={entry} busy={busyId === entry.id}
                  onStatusChange={s => handleWaitingStatus(entry.id, s)}
                  onDelete={() => handleWaitingDelete(entry.id)}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && <ReservationModal zones={zones} tables={tables} onClose={() => setShowCreate(false)} onSaved={loadReservations} />}
      {editRes && <ReservationModal initial={editRes} zones={zones} tables={tables} onClose={() => setEditRes(null)} onSaved={loadReservations} />}
      {showWaiting && <WaitingModal zones={zones} onClose={() => setShowWaiting(false)} onSaved={loadWaiting} />}
    </div>
  );
}
