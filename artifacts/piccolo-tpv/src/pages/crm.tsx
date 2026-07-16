/**
 * CRM & Fidelización — 5-tab admin panel
 * Tabs: Clientes · Fidelización · Tarjetas Regalo · Promociones · Informes
 */

import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  Users, Star, Gift, Tag, BarChart3, ChevronLeft,
  Search, Plus, X, Check, Edit2, Trash2, RefreshCw,
  Phone, Mail, MapPin, Calendar, AlertCircle, Shield,
  TrendingUp, CreditCard, Percent, Clock, Lock, Unlock,
  ChevronRight, Eye,
} from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CrmClient {
  id: string; nombre: string; apellidos: string; telefono: string;
  email: string; fechaNacimiento: string | null; direccion: string;
  observaciones: string; activo: boolean; rgpdConsentimiento: boolean;
  totalGasto: string; totalVisitas: number; ultimaVisita: string | null;
  puntosSaldo: number; createdAt: string;
}

interface LoyaltyConfig {
  id: string; activo: boolean; puntosPorEuro: string; valorPunto: string;
  caducidadDias: number; canjeMinimo: number;
}

interface LoyaltyPoint {
  id: string; clientId: string; tipo: string; puntos: number;
  saldoAnterior: number; saldoPosterior: number; descripcion: string;
  empleadoNombre: string; createdAt: string;
}

interface GiftCard {
  id: string; codigo: string; saldoInicial: string; saldoActual: string;
  clientId: string | null; estado: string; fechaCaducidad: string | null;
  notas: string; empleadoNombre: string; createdAt: string;
}

interface Promotion {
  id: string; nombre: string; descripcion: string; tipo: string;
  valor: string; codigo: string; activo: boolean;
  fechaInicio: string | null; fechaFin: string | null;
  montoMinimo: string; usoMaximo: number; usoActual: number;
  diasSemana: number[]; horaInicio: string; horaFin: string;
}

interface CrmReports {
  clientes: { total: number; activos: number; nuevos30d: number; inactivos90d: number; gastoTotal: number };
  topClientes: { id: string; nombre: string; apellidos: string; totalGasto: string; totalVisitas: number; puntosSaldo: number }[];
  puntos: { totalEmitidos: number; totalCanjeados: number };
  tarjetasRegalo: { totalActivas: number; totalConsumidas: number; saldoTotal: string };
  promociones: { totalPromociones: number; activas: number; totalUsos: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API = (path: string) => `/api${path}`;
const token = () => localStorage.getItem('token') ?? '';
const authHeaders = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await customFetch<T>(path, init);
  return res;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMoney(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0,00 €' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'clientes',     label: 'Clientes',        icon: Users },
  { id: 'fidelizacion', label: 'Fidelización',     icon: Star },
  { id: 'tarjetas',     label: 'Tarjetas Regalo',  icon: Gift },
  { id: 'promociones',  label: 'Promociones',      icon: Tag },
  { id: 'informes',     label: 'Informes',         icon: BarChart3 },
];

// ═══════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════

export default function Crm() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState('clientes');

  useEffect(() => {
    const t = localStorage.getItem('token');
    const emp = JSON.parse(localStorage.getItem('employee') ?? '{}');
    if (!t) { setLocation('/'); return; }
    if (emp.role !== 'admin' && emp.role !== 'manager') { setLocation('/tables'); return; }
  }, [setLocation]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="h-14 shrink-0 flex items-center px-4 bg-card border-b border-border gap-3 z-10">
        <button
          onClick={() => setLocation('/admin')}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)' }}>
            <Users size={16} style={{ color: '#10b981' }} />
          </div>
          <h1 className="font-black text-lg">CRM & Fidelización</h1>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-border bg-card px-2 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                active
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'clientes'     && <ClientesTab />}
        {tab === 'fidelizacion' && <FidelizacionTab />}
        {tab === 'tarjetas'     && <TarjetasTab />}
        {tab === 'promociones'  && <PromocionesTab />}
        {tab === 'informes'     && <InformesTab />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 1: Clientes
// ═══════════════════════════════════════════════════════════════════════════

function ClientesTab() {
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<CrmClient | null>(null);
  // null = hidden, undefined = new client, CrmClient = editing existing
  const [editingClient, setEditingClient] = useState<CrmClient | null | undefined>(null);
  const [history, setHistory] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<CrmClient[]>(API(`/crm/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`));
      setClients(data);
    } catch { toast.error('Error al cargar clientes'); }
  }, [q]);

  useEffect(() => { void load(); }, [load]);

  const loadHistory = async (id: string) => {
    try {
      const data = await apiFetch<any>(API(`/crm/clients/${id}/history`));
      setHistory(data);
    } catch { toast.error('Error al cargar historial'); }
  };

  const selectClient = (c: CrmClient) => {
    setSelected(c);
    setEditingClient(null);
    void loadHistory(c.id);
  };

  const showForm = editingClient !== null; // null = hidden; undefined or CrmClient = visible

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: list */}
      <div className="w-72 shrink-0 flex flex-col border-r border-border bg-card">
        <div className="p-3 border-b border-border flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Buscar…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={() => { setSelected(null); setEditingClient(undefined); setHistory(null); }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shrink-0"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {clients.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Sin clientes</p>
          )}
          {clients.map(c => (
            <button
              key={c.id}
              onClick={() => selectClient(c)}
              className={`w-full text-left px-3 py-3 border-b border-border/50 hover:bg-secondary transition-colors ${selected?.id === c.id ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500' : ''}`}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-sm shrink-0">
                  {c.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{c.nombre} {c.apellidos}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.telefono || c.email || '—'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black text-emerald-400">{c.puntosSaldo} pts</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail / form */}
      <div className="flex-1 overflow-y-auto p-6">
        {showForm && (
          <ClientForm
            initial={editingClient ?? undefined}
            onSave={async (saved) => {
              setEditingClient(null);
              await load();
              if (saved) {
                setSelected(saved);
                void loadHistory(saved.id);
              }
            }}
            onCancel={() => setEditingClient(null)}
          />
        )}
        {selected && !showForm && history && (
          <ClientDetail
            client={selected}
            history={history}
            onEdit={() => setEditingClient(selected)}
            onRefresh={async () => { await load(); await loadHistory(selected.id); }}
          />
        )}
        {!selected && !showForm && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Users size={40} className="opacity-30" />
            <p className="text-sm">Selecciona un cliente o crea uno nuevo</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ClientForm({ onSave, onCancel, initial }: { onSave: (saved?: CrmClient) => void; onCancel: () => void; initial?: CrmClient }) {
  const isEditing = !!initial?.id;
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [apellidos, setApellidos] = useState(initial?.apellidos ?? '');
  const [telefono, setTelefono] = useState(initial?.telefono ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [direccion, setDireccion] = useState(initial?.direccion ?? '');
  const [observaciones, setObservaciones] = useState(initial?.observaciones ?? '');
  const [rgpd, setRgpd] = useState(initial?.rgpdConsentimiento ?? false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      let saved: CrmClient;
      if (isEditing) {
        // Update existing client via PATCH
        saved = await customFetch<CrmClient>(API(`/crm/clients/${initial!.id}`), {
          method: 'PATCH',
          body: JSON.stringify({ nombre, apellidos, telefono, email, direccion, observaciones, rgpdConsentimiento: rgpd }),
        });
        toast.success('Cliente actualizado');
      } else {
        // Create new client via POST
        saved = await customFetch<CrmClient>(API('/crm/clients'), {
          method: 'POST',
          body: JSON.stringify({ nombre, apellidos, telefono, email, direccion, observaciones, rgpdConsentimiento: rgpd }),
        });
        toast.success('Cliente creado');
      }
      onSave(saved);
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-black">{isEditing ? `Editar: ${initial!.nombre}` : 'Nuevo cliente'}</h2>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
      </div>
      <div className="space-y-4">
        <Row label="Nombre *">
          <input value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls} placeholder="Nombre" />
        </Row>
        <Row label="Apellidos">
          <input value={apellidos} onChange={e => setApellidos(e.target.value)} className={inputCls} placeholder="Apellidos" />
        </Row>
        <Row label="Teléfono">
          <input value={telefono} onChange={e => setTelefono(e.target.value)} className={inputCls} placeholder="600 000 000" />
        </Row>
        <Row label="Email">
          <input value={email} onChange={e => setEmail(e.target.value)} className={inputCls} type="email" placeholder="correo@ejemplo.com" />
        </Row>
        <Row label="Dirección">
          <input value={direccion} onChange={e => setDireccion(e.target.value)} className={inputCls} placeholder="Dirección completa" />
        </Row>
        <Row label="Observaciones">
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} className={inputCls + ' h-20 resize-none'} placeholder="Notas internas…" />
        </Row>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={rgpd} onChange={e => setRgpd(e.target.checked)} className="rounded" />
          <Shield size={14} className="text-emerald-400" />
          Consentimiento RGPD otorgado
        </label>
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600 transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : isEditing ? 'Actualizar' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientDetail({ client, history, onEdit, onRefresh }: { client: CrmClient; history: any; onEdit: () => void; onRefresh: () => void }) {
  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-2xl">
            {client.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-black">{client.nombre} {client.apellidos}</h2>
            <div className="flex items-center gap-3 mt-1">
              {client.telefono && <span className="text-sm text-muted-foreground flex items-center gap-1"><Phone size={12} />{client.telefono}</span>}
              {client.email && <span className="text-sm text-muted-foreground flex items-center gap-1"><Mail size={12} />{client.email}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh} className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-secondary transition-colors">
            <RefreshCw size={15} />
          </button>
          <button onClick={onEdit} className="px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/30 transition-colors flex items-center gap-1.5">
            <Edit2 size={13} /> Editar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatMini label="Gasto total" value={fmtMoney(client.totalGasto)} color="#10b981" />
        <StatMini label="Visitas" value={String(client.totalVisitas)} color="#6082dc" />
        <StatMini label="Ticket medio" value={fmtMoney(history?.stats?.ticketMedio)} color="#d2a032" />
        <StatMini label="Puntos" value={String(client.puntosSaldo)} color="#f59e0b" />
      </div>

      {/* Info */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-2.5 text-sm">
        {client.direccion && <InfoRow icon={<MapPin size={13} />} label={client.direccion} />}
        {client.fechaNacimiento && <InfoRow icon={<Calendar size={13} />} label={`Nac: ${fmtDate(client.fechaNacimiento)}`} />}
        <InfoRow icon={<Clock size={13} />} label={`Última visita: ${fmtDate(client.ultimaVisita)}`} />
        <InfoRow icon={<Shield size={13} />} label={client.rgpdConsentimiento ? 'RGPD: Consentimiento otorgado' : 'RGPD: Sin consentimiento'} />
        {client.observaciones && <InfoRow icon={<AlertCircle size={13} />} label={client.observaciones} />}
      </div>

      {/* Recent orders */}
      {history?.orders?.length > 0 && (
        <div>
          <h3 className="font-black text-sm mb-2 text-muted-foreground uppercase tracking-wide">Últimas visitas</h3>
          <div className="space-y-1">
            {history.orders.slice(0, 5).map((o: any) => (
              <div key={o.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-secondary text-sm">
                <span className="text-muted-foreground">{fmtDate(o.createdAt)}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${o.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {o.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Points history */}
      {history?.points?.length > 0 && (
        <div>
          <h3 className="font-black text-sm mb-2 text-muted-foreground uppercase tracking-wide">Movimientos de puntos</h3>
          <div className="space-y-1">
            {history.points.slice(0, 5).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-secondary text-sm">
                <span>{p.descripcion}</span>
                <span className={`font-black ${p.puntos > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {p.puntos > 0 ? '+' : ''}{p.puntos} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gift cards */}
      {history?.giftCards?.length > 0 && (
        <div>
          <h3 className="font-black text-sm mb-2 text-muted-foreground uppercase tracking-wide">Tarjetas regalo</h3>
          <div className="space-y-1">
            {history.giftCards.map((g: any) => (
              <div key={g.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-secondary text-sm">
                <span className="font-mono font-semibold">{g.codigo}</span>
                <span className="text-emerald-400 font-black">{fmtMoney(g.saldoActual)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 2: Fidelización
// ═══════════════════════════════════════════════════════════════════════════

function FidelizacionTab() {
  const [config, setConfig] = useState<LoyaltyConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<LoyaltyConfig>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<LoyaltyConfig>(API('/crm/loyalty/config'));
      setConfig(data);
      setForm(data);
    } catch { /* manager/admin only */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const data = await customFetch<LoyaltyConfig>(API('/crm/loyalty/config'), {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setConfig(data as any);
      setEditing(false);
      toast.success('Configuración guardada');
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  if (!config) return <LoadingState label="Cargando configuración…" />;

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg">Programa de Fidelización</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/30 transition-colors flex items-center gap-1.5">
            <Edit2 size={13} /> Configurar
          </button>
        )}
      </div>

      {/* Status badge */}
      <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold ${config.activo ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-secondary text-muted-foreground border border-border'}`}>
        <Star size={16} />
        {config.activo ? 'Programa activo' : 'Programa desactivado'}
      </div>

      {editing ? (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.activo ?? false} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} className="rounded" />
            Programa activo
          </label>
          <Row label="Puntos por euro">
            <input type="number" step="0.1" min="0" value={form.puntosPorEuro ?? ''} onChange={e => setForm(f => ({ ...f, puntosPorEuro: e.target.value }))} className={inputCls} />
          </Row>
          <Row label="Valor de 1 punto (€)">
            <input type="number" step="0.001" min="0" value={form.valorPunto ?? ''} onChange={e => setForm(f => ({ ...f, valorPunto: e.target.value }))} className={inputCls} />
          </Row>
          <Row label="Mínimo para canjear (pts)">
            <input type="number" step="1" min="0" value={form.canjeMinimo ?? ''} onChange={e => setForm(f => ({ ...f, canjeMinimo: parseInt(e.target.value) }))} className={inputCls} />
          </Row>
          <Row label="Caducidad (días, 0 = nunca)">
            <input type="number" step="1" min="0" value={form.caducidadDias ?? ''} onChange={e => setForm(f => ({ ...f, caducidadDias: parseInt(e.target.value) }))} className={inputCls} />
          </Row>
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setEditing(false); setForm(config); }} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600 transition-colors disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <ConfigRow label="Puntos por euro" value={config.puntosPorEuro} />
          <ConfigRow label="Valor por punto" value={`${config.valorPunto} €`} />
          <ConfigRow label="Mínimo para canjear" value={`${config.canjeMinimo} pts`} />
          <ConfigRow label="Caducidad" value={config.caducidadDias > 0 ? `${config.caducidadDias} días` : 'Sin caducidad'} />
        </div>
      )}

      {/* Quick issue / redeem */}
      <QuickPointsPanel />
    </div>
  );
}

function QuickPointsPanel() {
  const [clientQ, setClientQ] = useState('');
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<CrmClient | null>(null);
  const [puntos, setPuntos] = useState('');
  const [accion, setAccion] = useState<'issue' | 'redeem'>('issue');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!clientQ.trim()) { setClients([]); return; }
    const t = setTimeout(async () => {
      const data = await apiFetch<CrmClient[]>(API(`/crm/clients?q=${encodeURIComponent(clientQ)}`));
      setClients(data.slice(0, 5));
    }, 250);
    return () => clearTimeout(t);
  }, [clientQ]);

  const execute = async () => {
    if (!selectedClient || !puntos) return;
    setWorking(true);
    try {
      const path = accion === 'issue'
        ? API(`/crm/clients/${selectedClient.id}/points/issue`)
        : API(`/crm/clients/${selectedClient.id}/points/redeem`);
      await customFetch(path, { method: 'POST', body: JSON.stringify({ puntos: parseInt(puntos) }) });
      toast.success(accion === 'issue' ? `+${puntos} pts emitidos` : `${puntos} pts canjeados`);
      setPuntos('');
      setSelectedClient(null);
      setClientQ('');
    } catch (e: any) { toast.error(e?.message ?? 'Error'); }
    finally { setWorking(false); }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-black text-sm">Emisión / Canje rápido de puntos</h3>
      <div className="flex gap-2">
        <button onClick={() => setAccion('issue')} className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${accion === 'issue' ? 'bg-emerald-500 text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>Emitir +</button>
        <button onClick={() => setAccion('redeem')} className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${accion === 'redeem' ? 'bg-amber-500 text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>Canjear −</button>
      </div>
      {selectedClient ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm">
          <Users size={13} className="text-emerald-400" />
          <span className="font-semibold flex-1">{selectedClient.nombre} {selectedClient.apellidos}</span>
          <span className="text-emerald-400 font-black">{selectedClient.puntosSaldo} pts</span>
          <button onClick={() => { setSelectedClient(null); setClientQ(''); }} className="text-muted-foreground hover:text-foreground ml-1"><X size={13} /></button>
        </div>
      ) : (
        <div className="relative">
          <input value={clientQ} onChange={e => setClientQ(e.target.value)} placeholder="Buscar cliente…" className={inputCls} />
          {clients.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-border bg-card shadow-xl z-10 overflow-hidden">
              {clients.map(c => (
                <button key={c.id} onClick={() => { setSelectedClient(c); setClients([]); setClientQ(c.nombre + ' ' + c.apellidos); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-secondary transition-colors text-sm flex items-center justify-between">
                  <span>{c.nombre} {c.apellidos}</span>
                  <span className="text-emerald-400 font-black text-xs">{c.puntosSaldo} pts</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <Row label="Puntos">
        <input type="number" min="1" value={puntos} onChange={e => setPuntos(e.target.value)} className={inputCls} placeholder="100" />
      </Row>
      <button onClick={execute} disabled={!selectedClient || !puntos || working} className="w-full py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600 transition-colors disabled:opacity-50">
        {working ? 'Procesando…' : accion === 'issue' ? 'Emitir puntos' : 'Canjear puntos'}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 3: Tarjetas Regalo
// ═══════════════════════════════════════════════════════════════════════════

function TarjetasTab() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<GiftCard | null>(null);
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<GiftCard[]>(API(`/crm/gift-cards${q ? `?q=${encodeURIComponent(q)}` : ''}`));
      setCards(data);
    } catch { toast.error('Error al cargar tarjetas'); }
  }, [q]);

  useEffect(() => { void load(); }, [load]);

  const loadDetail = async (id: string) => {
    try {
      const data = await apiFetch<any>(API(`/crm/gift-cards/${id}`));
      setDetail(data);
    } catch { }
  };

  const selectCard = (c: GiftCard) => {
    setSelected(c);
    setShowCreate(false);
    void loadDetail(c.id);
  };

  const toggleBlock = async (card: GiftCard) => {
    try {
      await customFetch(API(`/crm/gift-cards/${card.id}/block`), { method: 'POST' });
      toast.success(card.estado === 'bloqueada' ? 'Tarjeta desbloqueada' : 'Tarjeta bloqueada');
      await load();
      await loadDetail(card.id);
    } catch { toast.error('Error'); }
  };

  const estadoColor: Record<string, string> = {
    activa: 'text-emerald-400 bg-emerald-500/10',
    bloqueada: 'text-amber-400 bg-amber-500/10',
    consumida: 'text-muted-foreground bg-secondary',
    caducada: 'text-red-400 bg-red-500/10',
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left */}
      <div className="w-72 shrink-0 flex flex-col border-r border-border bg-card">
        <div className="p-3 border-b border-border flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar código…" className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          </div>
          <button onClick={() => { setSelected(null); setShowCreate(true); setDetail(null); }} className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shrink-0">
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {cards.map(c => (
            <button key={c.id} onClick={() => selectCard(c)} className={`w-full text-left px-3 py-3 border-b border-border/50 hover:bg-secondary transition-colors ${selected?.id === c.id ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500' : ''}`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-mono font-black text-sm">{c.codigo}</span>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${estadoColor[c.estado] ?? ''}`}>{c.estado}</span>
              </div>
              <p className="text-xs text-muted-foreground">Saldo: <span className="text-emerald-400 font-bold">{fmtMoney(c.saldoActual)}</span></p>
            </button>
          ))}
          {cards.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Sin tarjetas</p>}
        </div>
      </div>

      {/* Right */}
      <div className="flex-1 overflow-y-auto p-6">
        {showCreate && (
          <GiftCardCreateForm onSave={async () => { setShowCreate(false); await load(); }} onCancel={() => setShowCreate(false)} />
        )}
        {selected && !showCreate && detail && (
          <GiftCardDetail card={detail.card} transactions={detail.transactions} onBlock={() => toggleBlock(detail.card)} onRecharge={async () => { await load(); await loadDetail(selected.id); }} />
        )}
        {!selected && !showCreate && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Gift size={40} className="opacity-30" />
            <p className="text-sm">Selecciona una tarjeta o crea una nueva</p>
          </div>
        )}
      </div>
    </div>
  );
}

function GiftCardCreateForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [saldo, setSaldo] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = parseFloat(saldo);
    if (isNaN(n) || n <= 0) { toast.error('Saldo inválido'); return; }
    setSaving(true);
    try {
      await customFetch(API('/crm/gift-cards'), {
        method: 'POST',
        body: JSON.stringify({ saldo, notas }),
      });
      toast.success('Tarjeta creada');
      onSave();
    } catch { toast.error('Error al crear'); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-black text-lg">Nueva tarjeta regalo</h2>
        <button onClick={onCancel}><X size={18} className="text-muted-foreground" /></button>
      </div>
      <Row label="Saldo inicial (€)">
        <input type="number" min="0.01" step="0.01" value={saldo} onChange={e => setSaldo(e.target.value)} className={inputCls} placeholder="50.00" />
      </Row>
      <Row label="Notas">
        <input value={notas} onChange={e => setNotas(e.target.value)} className={inputCls} placeholder="Notas opcionales" />
      </Row>
      <div className="flex gap-3 pt-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors">Cancelar</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600 transition-colors disabled:opacity-50">
          {saving ? 'Creando…' : 'Crear tarjeta'}
        </button>
      </div>
    </div>
  );
}

function GiftCardDetail({ card, transactions, onBlock, onRecharge }: { card: GiftCard; transactions: any[]; onBlock: () => void; onRecharge: () => void }) {
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [recharging, setRecharging] = useState(false);

  const recharge = async () => {
    const n = parseFloat(rechargeAmount);
    if (isNaN(n) || n <= 0) { toast.error('Importe inválido'); return; }
    setRecharging(true);
    try {
      await customFetch(API(`/crm/gift-cards/${card.id}/recharge`), { method: 'POST', body: JSON.stringify({ importe: rechargeAmount }) });
      toast.success('Tarjeta recargada');
      setRechargeAmount('');
      onRecharge();
    } catch { toast.error('Error al recargar'); }
    finally { setRecharging(false); }
  };

  const estadoColor: Record<string, string> = {
    activa: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    bloqueada: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    consumida: 'text-muted-foreground bg-secondary border-border',
    caducada: 'text-red-400 bg-red-500/10 border-red-500/30',
  };

  return (
    <div className="max-w-lg space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono font-black text-2xl">{card.codigo}</p>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border mt-1 ${estadoColor[card.estado] ?? ''}`}>{card.estado}</span>
        </div>
        <button
          onClick={onBlock}
          disabled={card.estado === 'consumida' || card.estado === 'caducada'}
          className="px-3 py-2 rounded-xl border border-border text-sm font-semibold flex items-center gap-1.5 hover:bg-secondary transition-colors disabled:opacity-40"
        >
          {card.estado === 'bloqueada' ? <><Unlock size={13} /> Desbloquear</> : <><Lock size={13} /> Bloquear</>}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatMini label="Saldo actual" value={fmtMoney(card.saldoActual)} color="#10b981" />
        <StatMini label="Saldo inicial" value={fmtMoney(card.saldoInicial)} color="#6082dc" />
      </div>

      {card.estado === 'activa' && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-black text-sm">Recargar</h3>
          <div className="flex gap-2">
            <input type="number" min="0.01" step="0.01" value={rechargeAmount} onChange={e => setRechargeAmount(e.target.value)} className={inputCls + ' flex-1'} placeholder="Importe (€)" />
            <button onClick={recharge} disabled={recharging} className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600 transition-colors disabled:opacity-50">
              {recharging ? '…' : 'Recargar'}
            </button>
          </div>
        </div>
      )}

      <div>
        <h3 className="font-black text-sm mb-2 text-muted-foreground uppercase tracking-wide">Movimientos</h3>
        <div className="space-y-1">
          {transactions.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-secondary text-sm">
              <div>
                <span className="font-semibold capitalize">{t.tipo}</span>
                <span className="text-muted-foreground text-xs ml-2">{fmtDate(t.createdAt)}</span>
              </div>
              <span className={`font-black ${t.tipo === 'pago' ? 'text-red-400' : 'text-emerald-400'}`}>
                {t.tipo === 'pago' ? '-' : '+'}{fmtMoney(t.importe)}
              </span>
            </div>
          ))}
          {transactions.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Sin movimientos</p>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 4: Promociones
// ═══════════════════════════════════════════════════════════════════════════

function PromocionesTab() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [validator, setValidator] = useState({ show: false, amount: '', promoId: '', result: null as any });

  const load = async () => {
    try {
      const data = await apiFetch<Promotion[]>(API('/crm/promotions'));
      setPromos(data);
    } catch { }
  };

  useEffect(() => { void load(); }, []);

  const deletePromo = async (id: string) => {
    if (!confirm('¿Eliminar esta promoción?')) return;
    try {
      await customFetch(API(`/crm/promotions/${id}`), { method: 'DELETE' });
      toast.success('Promoción eliminada');
      await load();
    } catch { toast.error('Error al eliminar'); }
  };

  const validate = async () => {
    if (!validator.amount || !validator.promoId) return;
    try {
      const data = await customFetch(API('/crm/promotions/validate'), {
        method: 'POST',
        body: JSON.stringify({ promoId: validator.promoId, orderAmount: parseFloat(validator.amount) }),
      });
      setValidator(v => ({ ...v, result: data }));
    } catch { toast.error('Error al validar'); }
  };

  const tipoLabel: Record<string, string> = {
    descuento_fijo: 'Desc. fijo',
    descuento_porcentual: 'Desc. %',
    '2x1': '2×1',
    menu_promocional: 'Menú promo',
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg">Promociones & Cupones</h2>
        <button onClick={() => setShowCreate(true)} className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600 transition-colors flex items-center gap-1.5">
          <Plus size={14} /> Nueva promoción
        </button>
      </div>

      {showCreate && (
        <PromoForm
          onSave={async () => { setShowCreate(false); await load(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Validator */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-black text-sm flex items-center gap-2"><Check size={14} className="text-emerald-400" /> Validar promoción</h3>
        <div className="flex gap-2 flex-wrap">
          <select value={validator.promoId} onChange={e => setValidator(v => ({ ...v, promoId: e.target.value, result: null }))} className={inputCls + ' flex-1 min-w-32'}>
            <option value="">Seleccionar promoción…</option>
            {promos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <input type="number" min="0" step="0.01" value={validator.amount} onChange={e => setValidator(v => ({ ...v, amount: e.target.value, result: null }))} className={inputCls + ' w-32'} placeholder="Importe €" />
          <button onClick={validate} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">Validar</button>
        </div>
        {validator.result && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold ${(validator.result as any).valid ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
            {(validator.result as any).valid ? <Check size={14} /> : <X size={14} />}
            {(validator.result as any).valid
              ? `Válida — Descuento: ${fmtMoney((validator.result as any).descuento)}`
              : (validator.result as any).reason}
          </div>
        )}
      </div>

      {/* Promo list */}
      <div className="space-y-2">
        {promos.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Sin promociones</p>}
        {promos.map(p => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-border bg-card hover:bg-secondary transition-colors">
            <div className={`w-2 h-2 rounded-full shrink-0 ${p.activo ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm truncate">{p.nombre}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{tipoLabel[p.tipo] ?? p.tipo}</span>
                {p.codigo && <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">{p.codigo}</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {p.tipo === 'descuento_porcentual' ? `${p.valor}% desc.` : p.tipo === 'descuento_fijo' ? `${p.valor}€ desc.` : ''}
                {p.montoMinimo !== '0' ? ` · Mín. ${fmtMoney(p.montoMinimo)}` : ''}
                {p.usoMaximo > 0 ? ` · ${p.usoActual}/${p.usoMaximo} usos` : ''}
                {p.fechaFin ? ` · hasta ${fmtDate(p.fechaFin)}` : ''}
              </p>
            </div>
            <button onClick={() => deletePromo(p.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PromoForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ nombre: '', tipo: 'descuento_porcentual', valor: '', codigo: '', activo: true, montoMinimo: '0', usoMaximo: '0', fechaFin: '', descripcion: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.nombre || !form.tipo) { toast.error('Nombre y tipo son obligatorios'); return; }
    setSaving(true);
    try {
      await customFetch(API('/crm/promotions'), {
        method: 'POST',
        body: JSON.stringify({ ...form, usoMaximo: parseInt(form.usoMaximo) || 0, fechaFin: form.fechaFin || null }),
      });
      toast.success('Promoción creada');
      onSave();
    } catch { toast.error('Error al crear'); }
    finally { setSaving(false); }
  };

  const up = (k: keyof typeof form, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-black">Nueva promoción</h3>
        <button onClick={onCancel}><X size={16} className="text-muted-foreground" /></button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Row label="Nombre *">
          <input value={form.nombre} onChange={e => up('nombre', e.target.value)} className={inputCls} placeholder="Happy Hour" />
        </Row>
        <Row label="Tipo">
          <select value={form.tipo} onChange={e => up('tipo', e.target.value)} className={inputCls}>
            <option value="descuento_porcentual">Descuento %</option>
            <option value="descuento_fijo">Descuento fijo €</option>
            <option value="2x1">2×1</option>
            <option value="menu_promocional">Menú promocional</option>
          </select>
        </Row>
        <Row label="Valor">
          <input type="number" min="0" step="0.01" value={form.valor} onChange={e => up('valor', e.target.value)} className={inputCls} placeholder="10" />
        </Row>
        <Row label="Código cupón (opcional)">
          <input value={form.codigo} onChange={e => up('codigo', e.target.value.toUpperCase())} className={inputCls + ' font-mono'} placeholder="VERANO25" />
        </Row>
        <Row label="Importe mínimo (€)">
          <input type="number" min="0" step="0.01" value={form.montoMinimo} onChange={e => up('montoMinimo', e.target.value)} className={inputCls} />
        </Row>
        <Row label="Usos máximos (0=ilimitado)">
          <input type="number" min="0" step="1" value={form.usoMaximo} onChange={e => up('usoMaximo', e.target.value)} className={inputCls} />
        </Row>
        <Row label="Válida hasta">
          <input type="date" value={form.fechaFin} onChange={e => up('fechaFin', e.target.value)} className={inputCls} />
        </Row>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={form.activo} onChange={e => up('activo', e.target.checked)} className="rounded" />
          <label className="text-sm">Activa</label>
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors">Cancelar</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600 transition-colors disabled:opacity-50">
          {saving ? 'Guardando…' : 'Crear'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 5: Informes
// ═══════════════════════════════════════════════════════════════════════════

function InformesTab() {
  const [reports, setReports] = useState<CrmReports | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<CrmReports>(API('/admin/crm/reports'));
      setReports(data);
    } catch { toast.error('Error al cargar informes (requiere rol admin)'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState label="Calculando informes…" />;
  if (!reports) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sin acceso</div>;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg">Informes CRM</h2>
        <button onClick={load} className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-secondary transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Client overview */}
      <div>
        <h3 className="font-black text-sm text-muted-foreground uppercase tracking-wide mb-3">Clientes</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatMini label="Total" value={String(reports.clientes.total)} color="#10b981" />
          <StatMini label="Activos" value={String(reports.clientes.activos)} color="#6082dc" />
          <StatMini label="Nuevos 30d" value={String(reports.clientes.nuevos30d)} color="#d2a032" />
          <StatMini label="Inactivos 90d" value={String(reports.clientes.inactivos90d)} color="#f06464" />
        </div>
        <div className="mt-3">
          <StatMini label="Gasto total acumulado" value={fmtMoney(reports.clientes.gastoTotal)} color="#10b981" />
        </div>
      </div>

      {/* Points */}
      <div>
        <h3 className="font-black text-sm text-muted-foreground uppercase tracking-wide mb-3">Puntos de fidelización</h3>
        <div className="grid grid-cols-2 gap-3">
          <StatMini label="Puntos emitidos" value={String(reports.puntos?.totalEmitidos ?? 0)} color="#f59e0b" />
          <StatMini label="Puntos canjeados" value={String(reports.puntos?.totalCanjeados ?? 0)} color="#a064dc" />
        </div>
      </div>

      {/* Gift cards */}
      <div>
        <h3 className="font-black text-sm text-muted-foreground uppercase tracking-wide mb-3">Tarjetas regalo</h3>
        <div className="grid grid-cols-3 gap-3">
          <StatMini label="Activas" value={String(reports.tarjetasRegalo?.totalActivas ?? 0)} color="#10b981" />
          <StatMini label="Consumidas" value={String(reports.tarjetasRegalo?.totalConsumidas ?? 0)} color="#8282a0" />
          <StatMini label="Saldo en circulación" value={fmtMoney(reports.tarjetasRegalo?.saldoTotal)} color="#d2a032" />
        </div>
      </div>

      {/* Promotions */}
      <div>
        <h3 className="font-black text-sm text-muted-foreground uppercase tracking-wide mb-3">Promociones</h3>
        <div className="grid grid-cols-3 gap-3">
          <StatMini label="Total" value={String(reports.promociones?.totalPromociones ?? 0)} color="#6082dc" />
          <StatMini label="Activas" value={String(reports.promociones?.activas ?? 0)} color="#10b981" />
          <StatMini label="Usos totales" value={String(reports.promociones?.totalUsos ?? 0)} color="#f59e0b" />
        </div>
      </div>

      {/* Top clients */}
      {reports.topClientes?.length > 0 && (
        <div>
          <h3 className="font-black text-sm text-muted-foreground uppercase tracking-wide mb-3">Top 10 clientes por gasto</h3>
          <div className="space-y-1">
            {reports.topClientes.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border">
                <span className="text-xs font-black text-muted-foreground w-5 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{c.nombre} {c.apellidos}</p>
                  <p className="text-xs text-muted-foreground">{c.totalVisitas} visitas · {c.puntosSaldo} pts</p>
                </div>
                <span className="text-emerald-400 font-black text-sm">{fmtMoney(c.totalGasto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function StatMini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 space-y-1">
      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-xl font-black leading-none" style={{ color }}>{value}</p>
    </div>
  );
}

function InfoRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-start gap-2 text-muted-foreground">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-black">{value}</span>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
      <RefreshCw size={24} className="animate-spin opacity-50" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
