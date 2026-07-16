/**
 * Admin · Gestión de Repartidores
 * Route: /admin/repartidores
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, Plus, Truck, Phone, Edit2, Trash2, Save, X,
  CheckCircle, Wallet, CreditCard, Package, RefreshCw, Bike, Car, Clock,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("token") ?? "";
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? `HTTP ${res.status}`); }
  if (res.status === 204) return null;
  return res.json();
}

interface Courier {
  id: string; name: string; phone: string; status: string; active: boolean;
  vehicleType: string; plate: string; zonaHabitual: string; turno: string;
  earnedCashPending: string; earnedCardPending: string; totalDeliveries: number;
  avgDeliveryMinutes: number; token: string;
}

interface Settlement {
  id: string; courierId: string; courierName: string;
  periodStart: string; periodEnd: string; ordersCount: number;
  totalCash: string; totalCard: string; totalOnline: string;
  tips: string; expenses: string; differences: string;
  closedByName: string; notes: string; createdAt: string;
}

const VEHICLE_ICONS: Record<string, string> = { moto: "🛵", car: "🚗", bike: "🚲", walking: "🚶" };
const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  available: { label: "Disponible", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  busy:      { label: "Ocupado",    cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  pause:     { label: "Pausa",      cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  off:       { label: "No disp.",   cls: "bg-muted/30 text-muted-foreground border-border" },
};

const EMPTY_FORM = {
  name: "", phone: "", vehicleType: "moto", plate: "",
  zonaHabitual: "", turno: "", active: true,
};

const INP = "w-full bg-secondary/50 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50";
const LBL = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block";

function CourierForm({
  initial, onSave, onCancel, busy,
}: {
  initial: typeof EMPTY_FORM;
  onSave: (data: typeof EMPTY_FORM) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState(initial);
  const f = (k: keyof typeof EMPTY_FORM, v: string | boolean) =>
    setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <h3 className="font-black text-sm">{initial.name ? `Editar ${initial.name}` : "Nuevo repartidor"}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Nombre *</label>
          <input type="text" className={INP} value={form.name} onChange={e => f("name", e.target.value)} />
        </div>
        <div>
          <label className={LBL}>Teléfono</label>
          <input type="tel" className={INP} value={form.phone} onChange={e => f("phone", e.target.value)} />
        </div>
        <div>
          <label className={LBL}>Vehículo</label>
          <select className={INP} value={form.vehicleType} onChange={e => f("vehicleType", e.target.value)}>
            <option value="moto">🛵 Moto</option>
            <option value="car">🚗 Coche</option>
            <option value="bike">🚲 Bicicleta</option>
            <option value="walking">🚶 A pie</option>
          </select>
        </div>
        <div>
          <label className={LBL}>Matrícula</label>
          <input type="text" className={INP} value={form.plate} onChange={e => f("plate", e.target.value.toUpperCase())} placeholder="1234 ABC" />
        </div>
        <div>
          <label className={LBL}>Zona habitual</label>
          <input type="text" className={INP} value={form.zonaHabitual} onChange={e => f("zonaHabitual", e.target.value)} placeholder="Alcanar, La Ràpita…" />
        </div>
        <div>
          <label className={LBL}>Turno</label>
          <select className={INP} value={form.turno} onChange={e => f("turno", e.target.value)}>
            <option value="">Sin asignar</option>
            <option value="Mediodía">🌞 Mediodía</option>
            <option value="Tarde">🌆 Tarde</option>
            <option value="Noche">🌙 Noche</option>
            <option value="Partido">↕️ Partido</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <div onClick={() => f("active", !form.active)}
            className={`w-9 h-5 rounded-full transition-colors relative ${form.active ? "bg-primary" : "bg-muted"}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.active ? "left-4" : "left-0.5"}`} />
          </div>
          <span className="text-sm text-muted-foreground">Activo</span>
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors">
          <X size={14} className="inline mr-1" />Cancelar
        </button>
        <button onClick={() => onSave(form)} disabled={busy || !form.name.trim()}
          className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground font-bold rounded-xl text-sm disabled:opacity-50 transition-colors hover:opacity-90">
          {busy ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
          Guardar
        </button>
      </div>
    </div>
  );
}

export default function AdminRepartidores() {
  const [, setLocation] = useLocation();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"couriers" | "settlements">("couriers");

  const load = useCallback(async () => {
    try {
      const [cd, sd] = await Promise.all([
        apiFetch("/api/admin/couriers").catch(() => []),
        apiFetch("/api/admin/courier-settlements").catch(() => []),
      ]);
      setCouriers(Array.isArray(cd) ? cd : []);
      setSettlements(Array.isArray(sd) ? sd : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (form: typeof EMPTY_FORM) => {
    setBusyId("new");
    try {
      await apiFetch("/api/admin/couriers", { method: "POST", body: JSON.stringify(form) });
      toast.success("Repartidor añadido");
      setShowForm(false); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleEdit = async (id: string, form: typeof EMPTY_FORM) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/couriers/${id}`, { method: "PATCH", body: JSON.stringify(form) });
      toast.success("Repartidor actualizado");
      setEditingId(null); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name}? Esta acción es permanente.`)) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/couriers/${id}`, { method: "DELETE" });
      toast.success("Repartidor eliminado");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/couriers/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="h-14 flex items-center px-4 gap-3 border-b border-border bg-card sticky top-0 z-10">
        <button onClick={() => setLocation("/admin")}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
          <ChevronLeft size={20} />
        </button>
        <Truck size={16} className="text-muted-foreground" />
        <h1 className="font-black text-base flex-1">Repartidores</h1>
        <button onClick={load} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground">
          <RefreshCw size={14} />
        </button>
        <button onClick={() => { setShowForm(true); setEditingId(null); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground font-bold rounded-xl text-sm hover:opacity-90 active:scale-95 transition-all">
          <Plus size={14} /> Añadir
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-secondary p-1 rounded-2xl">
          {([["couriers", "🛵 Repartidores"], ["settlements", "💰 Liquidaciones"]] as [typeof tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* New courier form */}
        {showForm && tab === "couriers" && (
          <CourierForm initial={EMPTY_FORM} onSave={handleCreate} onCancel={() => setShowForm(false)} busy={busyId === "new"} />
        )}

        {/* ── COURIERS TAB ─────────────────────────────────────────────────── */}
        {tab === "couriers" && (
          <div className="space-y-3">
            {loading && <div className="text-center py-10 text-muted-foreground text-sm">Cargando…</div>}
            {!loading && couriers.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Truck size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-semibold">Sin repartidores</p>
                <p className="text-xs mt-1">Pulsa "Añadir" para crear el primero</p>
              </div>
            )}
            {couriers.map(c => {
              const sCfg = STATUS_CFG[c.status] ?? STATUS_CFG.off;
              const cashPending = parseFloat(c.earnedCashPending ?? "0");
              const cardPending = parseFloat(c.earnedCardPending ?? "0");
              const isEditing = editingId === c.id;

              if (isEditing) {
                return (
                  <CourierForm
                    key={c.id}
                    initial={{ name: c.name, phone: c.phone, vehicleType: c.vehicleType ?? "moto", plate: c.plate ?? "", zonaHabitual: c.zonaHabitual ?? "", turno: c.turno ?? "", active: c.active }}
                    onSave={(form) => handleEdit(c.id, form)}
                    onCancel={() => setEditingId(null)}
                    busy={busyId === c.id}
                  />
                );
              }

              return (
                <div key={c.id} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center font-black text-lg shrink-0">
                      {VEHICLE_ICONS[c.vehicleType ?? "moto"] ?? "🛵"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black">{c.name}</span>
                        {!c.active && <span className="text-[9px] bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded-full border border-border">Inactivo</span>}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sCfg.cls}`}>{sCfg.label}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {c.phone && <span><Phone size={9} className="inline mr-0.5" />{c.phone}</span>}
                        {c.plate && <span>🪪 {c.plate}</span>}
                        {c.zonaHabitual && <span>📍 {c.zonaHabitual}</span>}
                        {c.turno && <span><Clock size={9} className="inline mr-0.5" />{c.turno}</span>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
                        <span className="text-muted-foreground"><Package size={9} className="inline mr-0.5" />{c.totalDeliveries ?? 0} entregas</span>
                        {cashPending > 0 && <span className="text-green-400 font-bold"><Wallet size={9} className="inline mr-0.5" />💵 {cashPending.toFixed(2)}€ pendiente</span>}
                        {cardPending > 0 && <span className="text-blue-400 font-bold"><CreditCard size={9} className="inline mr-0.5" />💳 {cardPending.toFixed(2)}€ pendiente</span>}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <select value={c.status} onChange={e => handleStatusChange(c.id, e.target.value)} disabled={busyId === c.id}
                        className="bg-secondary border border-border rounded-lg px-2 py-1 text-[10px] font-semibold focus:outline-none">
                        <option value="available">Disponible</option>
                        <option value="busy">Ocupado</option>
                        <option value="pause">Pausa</option>
                        <option value="off">No disp.</option>
                      </select>
                      <a href={`/driver/${c.id}?token=${c.token}`} target="_blank"
                        className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-[10px] border border-primary/20 hover:bg-primary/20 transition-colors">
                        Vista móvil
                      </a>
                      <button onClick={() => setEditingId(c.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary hover:bg-border transition-colors text-muted-foreground">
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => handleDelete(c.id, c.name)} disabled={busyId === c.id}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── SETTLEMENTS TAB ───────────────────────────────────────────────── */}
        {tab === "settlements" && (
          <div className="space-y-3">
            {settlements.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Wallet size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-semibold">Sin liquidaciones</p>
                <p className="text-xs mt-1">Las liquidaciones aparecen aquí al cerrar turnos de repartidores</p>
              </div>
            )}
            {settlements.map(s => {
              const cash = parseFloat(s.totalCash);
              const card = parseFloat(s.totalCard);
              const online = parseFloat(s.totalOnline);
              const tips = parseFloat(s.tips);
              const expenses = parseFloat(s.expenses);
              const diff = parseFloat(s.differences);
              const total = cash + card + online + tips - expenses + diff;
              const from = new Date(s.periodStart).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
              const to = new Date(s.periodEnd).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
              return (
                <div key={s.id} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="font-bold text-sm">{s.courierName}</div>
                      <div className="text-[11px] text-muted-foreground">{from} → {to} · {s.ordersCount} entregas</div>
                      {s.closedByName && <div className="text-[10px] text-muted-foreground mt-0.5">Cerrado por {s.closedByName}</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-black text-lg">{total.toFixed(2)}€</div>
                      <div className="text-[10px] text-muted-foreground">Total liquidado</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    {cash > 0 && <div className="bg-green-500/10 text-green-400 px-2 py-1 rounded-lg text-center"><div className="font-black">{cash.toFixed(2)}€</div><div className="text-green-400/70">Efectivo</div></div>}
                    {card > 0 && <div className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded-lg text-center"><div className="font-black">{card.toFixed(2)}€</div><div className="text-blue-400/70">Tarjeta</div></div>}
                    {online > 0 && <div className="bg-purple-500/10 text-purple-400 px-2 py-1 rounded-lg text-center"><div className="font-black">{online.toFixed(2)}€</div><div className="text-purple-400/70">Online</div></div>}
                    {tips > 0 && <div className="bg-amber-500/10 text-amber-400 px-2 py-1 rounded-lg text-center"><div className="font-black">{tips.toFixed(2)}€</div><div className="text-amber-400/70">Propinas</div></div>}
                    {expenses !== 0 && <div className="bg-red-500/10 text-red-400 px-2 py-1 rounded-lg text-center"><div className="font-black">-{Math.abs(expenses).toFixed(2)}€</div><div className="text-red-400/70">Gastos</div></div>}
                    {diff !== 0 && <div className={`${diff > 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"} px-2 py-1 rounded-lg text-center`}><div className="font-black">{diff > 0 ? "+" : ""}{diff.toFixed(2)}€</div><div className="opacity-70">Diferencias</div></div>}
                  </div>
                  {s.notes && <p className="text-[11px] text-muted-foreground mt-2 border-t border-border/50 pt-2">{s.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
