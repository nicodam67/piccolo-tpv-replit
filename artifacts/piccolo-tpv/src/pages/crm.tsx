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
  ChevronRight, Eye, Megaphone, Trophy, Wallet, Coins,
  Target, Hash, QrCode, SendHorizontal, Zap, Play,
  Filter, Download, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../lib/api-client';
import {
  blockCrmGiftCard,
  createCrmGiftCard,
  getCrmGiftCard,
  getCrmGiftCards,
  rechargeCrmGiftCard,
} from '@workspace/api-client-react/wallet';
import type { CrmGiftCard, CrmGiftCardTransaction } from '@workspace/api-client-react/wallet';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CrmClient {
  id: string; nombre: string; apellidos: string; telefono: string;
  email: string; fechaNacimiento: string | null; direccion: string;
  observaciones: string; activo: boolean; rgpdConsentimiento: boolean;
  totalGasto: string; totalVisitas: number; ultimaVisita: string | null;
  puntosSaldo: number; createdAt: string;
  // v2 fields
  numCliente?: number; qrToken?: string;
  nivelId?: string | null; nivelNombre?: string;
  saldoMonedero?: string;
}

interface LoyaltyLevel {
  id: string; nombre: string; descripcion: string; orden: number;
  requisitosGasto: string; requisitosVisitas: number;
  multiplicadorPuntos: string; descuentoPct: string;
  beneficios: string[]; color: string; icono: string; activo: boolean;
}

interface LoyaltyConfig {
  id: string; activo: boolean; puntosPorEuro: string; valorPunto: string;
  caducidadDias: number; canjeMinimo: number;
  // v2
  puntosExtraCumpleanos?: number; puntosExtraPrimeraCompra?: number;
  puntosExtraReserva?: number; puntosExtraOnline?: number;
  canjeMaxPorOperacion?: number; caducidadAvisoDias?: number;
  nivelesActivos?: boolean; monederoActivo?: boolean;
}

interface CrmWallet {
  id: string; clientId: string;
  saldoReal: string; saldoPromo: string; saldoCompensacion: string;
  updatedAt: string;
}

interface CrmCampaign {
  id: string; nombre: string; descripcion: string; tipo: string;
  estado: string; canal: string; asunto: string; contenido: string;
  segmento: Record<string, unknown>;
  fechaEnvio: string | null;
  totalDestinatarios: number; totalEnviados: number;
  totalFallidos: number; totalUsados: number;
  promotionId: string | null; empleadoNombre: string; createdAt: string;
}

interface LoyaltyPoint {
  id: string; clientId: string; tipo: string; puntos: number;
  saldoAnterior: number; saldoPosterior: number; descripcion: string;
  empleadoNombre: string; createdAt: string;
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
  { id: 'niveles',      label: 'Niveles',          icon: Trophy },
  { id: 'tarjetas',     label: 'Tarjetas Regalo',  icon: Gift },
  { id: 'promociones',  label: 'Promociones',      icon: Tag },
  { id: 'campanas',     label: 'Campañas',         icon: Megaphone },
  { id: 'informes',     label: 'Informes',         icon: BarChart3 },
];

// ═══════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════

export default function Crm() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState('clientes');

  // Auth is enforced by the router (RequireRole) — no localStorage guard needed.

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
        {tab === 'niveles'      && <NivelesTab />}
        {tab === 'tarjetas'     && <TarjetasTab />}
        {tab === 'promociones'  && <PromocionesTab />}
        {tab === 'campanas'     && <CampañasTab />}
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
      const data = await api.get<CrmClient[]>(`/api/crm/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setClients(data);
    } catch { toast.error('Error al cargar clientes'); }
  }, [q]);

  useEffect(() => { void load(); }, [load]);

  const loadHistory = async (id: string) => {
    try {
      const data = await api.get<any>(`/api/crm/clients/${id}/history`);
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
        saved = await api.patch<CrmClient>(`/api/crm/clients/${initial!.id}`, { nombre, apellidos, telefono, email, direccion, observaciones, rgpdConsentimiento: rgpd });
        toast.success('Cliente actualizado');
      } else {
        // Create new client via POST
        saved = await api.post<CrmClient>('/api/crm/clients', { nombre, apellidos, telefono, email, direccion, observaciones, rgpdConsentimiento: rgpd });
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatMini label="Gasto total" value={fmtMoney(client.totalGasto)} color="#10b981" />
        <StatMini label="Visitas" value={String(client.totalVisitas)} color="#6082dc" />
        <StatMini label="Puntos" value={String(client.puntosSaldo)} color="#f59e0b" />
        {parseFloat(client.saldoMonedero ?? '0') > 0 && (
          <StatMini label="Monedero" value={fmtMoney(client.saldoMonedero)} color="#a855f7" />
        )}
        {client.nivelNombre && (
          <div className="rounded-2xl border border-border bg-card p-3 space-y-1 col-span-1">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Nivel</p>
            <p className="text-base font-black leading-none" style={{ color: '#10b981' }}>
              {client.nivelNombre}
            </p>
          </div>
        )}
        {client.numCliente && (
          <div className="rounded-2xl border border-border bg-card p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Nº cliente</p>
            <p className="text-base font-black leading-none font-mono">#{client.numCliente}</p>
          </div>
        )}
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
      const data = await api.get<LoyaltyConfig>('/api/crm/loyalty/config');
      setConfig(data);
      setForm(data);
    } catch { /* manager/admin only */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const data = await api.put<LoyaltyConfig>('/api/crm/loyalty/config', form);
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
          <div className="pt-1">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-wide mb-3">Puntos bonificados</h3>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Bonus cumpleaños (pts)">
                <input type="number" step="1" min="0" value={form.puntosExtraCumpleanos ?? 0} onChange={e => setForm(f => ({ ...f, puntosExtraCumpleanos: parseInt(e.target.value) }))} className={inputCls} />
              </Row>
              <Row label="Bonus 1ª compra (pts)">
                <input type="number" step="1" min="0" value={form.puntosExtraPrimeraCompra ?? 0} onChange={e => setForm(f => ({ ...f, puntosExtraPrimeraCompra: parseInt(e.target.value) }))} className={inputCls} />
              </Row>
              <Row label="Bonus reserva (pts)">
                <input type="number" step="1" min="0" value={form.puntosExtraReserva ?? 0} onChange={e => setForm(f => ({ ...f, puntosExtraReserva: parseInt(e.target.value) }))} className={inputCls} />
              </Row>
              <Row label="Bonus pedido online (pts)">
                <input type="number" step="1" min="0" value={form.puntosExtraOnline ?? 0} onChange={e => setForm(f => ({ ...f, puntosExtraOnline: parseInt(e.target.value) }))} className={inputCls} />
              </Row>
            </div>
          </div>
          <div className="pt-1 space-y-2">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-wide">Módulos</h3>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.nivelesActivos ?? false} onChange={e => setForm(f => ({ ...f, nivelesActivos: e.target.checked }))} className="rounded" />
              <Trophy size={14} className="text-amber-400" /> Niveles de fidelización activos
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.monederoActivo ?? false} onChange={e => setForm(f => ({ ...f, monederoActivo: e.target.checked }))} className="rounded" />
              <Wallet size={14} className="text-purple-400" /> Monedero (wallet) activo
            </label>
          </div>
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
          {(config.puntosExtraCumpleanos ?? 0) > 0 && <ConfigRow label="Bonus cumpleaños" value={`+${config.puntosExtraCumpleanos} pts`} />}
          {(config.puntosExtraPrimeraCompra ?? 0) > 0 && <ConfigRow label="Bonus 1ª compra" value={`+${config.puntosExtraPrimeraCompra} pts`} />}
          {(config.puntosExtraReserva ?? 0) > 0 && <ConfigRow label="Bonus reserva" value={`+${config.puntosExtraReserva} pts`} />}
          {(config.puntosExtraOnline ?? 0) > 0 && <ConfigRow label="Bonus online" value={`+${config.puntosExtraOnline} pts`} />}
          {config.nivelesActivos && <ConfigRow label="Niveles" value="✓ Activos" />}
          {config.monederoActivo && <ConfigRow label="Monedero" value="✓ Activo" />}
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
      const data = await api.get<CrmClient[]>(`/api/crm/clients?q=${encodeURIComponent(clientQ)}`);
      setClients(data.slice(0, 5));
    }, 250);
    return () => clearTimeout(t);
  }, [clientQ]);

  const execute = async () => {
    if (!selectedClient || !puntos) return;
    setWorking(true);
    try {
      const pointsPath = accion === 'issue'
        ? `/api/crm/clients/${selectedClient.id}/points/issue`
        : `/api/crm/clients/${selectedClient.id}/points/redeem`;
      await api.post(pointsPath, { puntos: parseInt(puntos) });
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
  const [cards, setCards] = useState<CrmGiftCard[]>([]);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<CrmGiftCard | null>(null);
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const data = await getCrmGiftCards(q ? { q } : undefined);
      setCards(data);
    } catch { toast.error('Error al cargar tarjetas'); }
  }, [q]);

  useEffect(() => { void load(); }, [load]);

  const loadDetail = async (id: string) => {
    try {
      const data = await getCrmGiftCard(id);
      setDetail(data);
    } catch { }
  };

  const selectCard = (c: CrmGiftCard) => {
    setSelected(c);
    setShowCreate(false);
    void loadDetail(c.id);
  };

  const toggleBlock = async (card: CrmGiftCard) => {
    try {
      await blockCrmGiftCard(card.id);
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
      await createCrmGiftCard({ saldo, notas });
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

function GiftCardDetail({ card, transactions, onBlock, onRecharge }: { card: CrmGiftCard; transactions: CrmGiftCardTransaction[]; onBlock: () => void; onRecharge: () => void }) {
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [recharging, setRecharging] = useState(false);

  const recharge = async () => {
    const n = parseFloat(rechargeAmount);
    if (isNaN(n) || n <= 0) { toast.error('Importe inválido'); return; }
    setRecharging(true);
    try {
      await rechargeCrmGiftCard(card.id, { importe: rechargeAmount });
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
      const data = await api.get<Promotion[]>('/api/crm/promotions');
      setPromos(data);
    } catch { }
  };

  useEffect(() => { void load(); }, []);

  const deletePromo = async (id: string) => {
    if (!confirm('¿Eliminar esta promoción?')) return;
    try {
      await api.delete(`/api/crm/promotions/${id}`);
      toast.success('Promoción eliminada');
      await load();
    } catch { toast.error('Error al eliminar'); }
  };

  const validate = async () => {
    if (!validator.amount || !validator.promoId) return;
    try {
      const data = await api.post('/api/crm/promotions/validate', { promoId: validator.promoId, orderAmount: parseFloat(validator.amount) });
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
      await api.post('/api/crm/promotions', { ...form, usoMaximo: parseInt(form.usoMaximo) || 0, fechaFin: form.fechaFin || null });
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
      const data = await api.get<CrmReports>('/api/admin/crm/reports');
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

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Niveles de Fidelización
// ═══════════════════════════════════════════════════════════════════════════

function NivelesTab() {
  const [levels, setLevels] = useState<LoyaltyLevel[]>([]);
  const [editing, setEditing] = useState<LoyaltyLevel | null | 'new'>(null);
  const [loading, setLoading] = useState(true);
  const [demoLoading, setDemoLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<LoyaltyLevel[]>('/api/crm/loyalty/levels');
      setLevels(data);
    } catch { toast.error('Error al cargar niveles'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const del = async (id: string) => {
    if (!confirm('¿Eliminar este nivel?')) return;
    try {
      await api.delete(`/api/crm/loyalty/levels/${id}`);
      toast.success('Nivel eliminado');
      void load();
    } catch { toast.error('Error al eliminar'); }
  };

  const runDemoData = async () => {
    setDemoLoading(true);
    try {
      const res = await api.post<{ created: number }>('/api/crm/demo-data');
      toast.success(`Datos de demo creados (${(res as any).created} registros)`);
      void load();
    } catch { toast.error('Error al crear datos demo'); }
    finally { setDemoLoading(false); }
  };

  const reviewLevels = async () => {
    try {
      const res = await api.post<{ updated: number }>('/api/crm/auto/review-levels');
      toast.success(`Niveles recalculados: ${(res as any).updated} clientes actualizados`);
    } catch { toast.error('Error al recalcular'); }
  };

  if (loading) return <LoadingState label="Cargando niveles…" />;

  const TIER_COLORS: Record<string, string> = { Bronce: '#cd7f32', Plata: '#c0c0c0', Oro: '#ffd700', VIP: '#a855f7' };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-black text-lg">Niveles de Fidelización</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Define los niveles automáticos según gasto y visitas</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reviewLevels}
            className="px-3 py-2 rounded-xl border border-border text-sm font-semibold flex items-center gap-1.5 hover:bg-secondary transition-colors"
          >
            <RefreshCw size={13} /> Recalcular
          </button>
          <button
            onClick={() => setEditing('new')}
            className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
          >
            <Plus size={13} /> Nuevo nivel
          </button>
        </div>
      </div>

      {/* Level cards */}
      {levels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
          <Trophy size={36} className="opacity-30" />
          <p className="text-sm">Sin niveles. Crea uno o genera datos de demo.</p>
          <button
            onClick={runDemoData}
            disabled={demoLoading}
            className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/30 transition-colors"
          >
            {demoLoading ? 'Creando…' : '⚡ Generar datos de demo'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {levels.map(l => (
            <div key={l.id} className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="h-1.5" style={{ background: l.color }} />
              <div className="p-4 flex items-center gap-4">
                <div className="text-3xl shrink-0">{l.icono}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-black text-base">{l.nombre}</p>
                    {!l.activo && <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-xs">Inactivo</span>}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>≥ {fmtMoney(l.requisitosGasto)} gasto</span>
                    {l.requisitosVisitas > 0 && <span>≥ {l.requisitosVisitas} visitas</span>}
                    <span className="text-amber-400 font-semibold">×{parseFloat(l.multiplicadorPuntos).toFixed(2)} puntos</span>
                    {parseFloat(l.descuentoPct) > 0 && <span className="text-emerald-400 font-semibold">{l.descuentoPct}% dto.</span>}
                  </div>
                  {l.beneficios?.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{l.beneficios.join(' · ')}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setEditing(l)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-secondary transition-colors">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => del(l.id)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {levels.length > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={runDemoData}
            disabled={demoLoading}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <Zap size={12} /> {demoLoading ? 'Creando…' : 'Generar datos de demo'}
          </button>
        </div>
      )}

      {/* Create / Edit form */}
      {editing !== null && (
        <NivelForm
          initial={editing === 'new' ? undefined : editing}
          onSave={async () => { setEditing(null); await load(); }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function NivelForm({ initial, onSave, onCancel }: { initial?: LoyaltyLevel; onSave: () => void; onCancel: () => void }) {
  const isNew = !initial?.id;
  const [form, setForm] = useState({
    nombre: initial?.nombre ?? '',
    descripcion: initial?.descripcion ?? '',
    orden: initial?.orden ?? 1,
    requisitosGasto: initial?.requisitosGasto ?? '0',
    requisitosVisitas: initial?.requisitosVisitas ?? 0,
    multiplicadorPuntos: initial?.multiplicadorPuntos ?? '1.00',
    descuentoPct: initial?.descuentoPct ?? '0',
    color: initial?.color ?? '#10b981',
    icono: initial?.icono ?? '⭐',
    activo: initial?.activo ?? true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      if (isNew) {
        await api.post('/api/crm/loyalty/levels', form);
        toast.success('Nivel creado');
      } else {
        await api.patch(`/api/crm/loyalty/levels/${initial!.id}`, form);
        toast.success('Nivel actualizado');
      }
      onSave();
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const ICON_OPTIONS = ['⭐','🥉','🥈','🥇','💜','💎','👑','🔥','🌟'];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-lg">{isNew ? 'Nuevo nivel' : `Editar: ${initial!.nombre}`}</h3>
          <button onClick={onCancel}><X size={18} className="text-muted-foreground" /></button>
        </div>
        <Row label="Nombre">
          <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className={inputCls} placeholder="Ej: Plata" />
        </Row>
        <Row label="Descripción">
          <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} className={inputCls} placeholder="Descripción del nivel" />
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Ícono">
            <select value={form.icono} onChange={e => setForm(f => ({ ...f, icono: e.target.value }))} className={inputCls}>
              {ICON_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </Row>
          <Row label="Color">
            <div className="flex gap-2 items-center">
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="h-9 w-12 rounded-lg border border-border cursor-pointer bg-secondary" />
              <input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className={inputCls} />
            </div>
          </Row>
        </div>
        <Row label="Gasto mínimo acumulado (€)">
          <input type="number" step="1" min="0" value={form.requisitosGasto} onChange={e => setForm(f => ({ ...f, requisitosGasto: e.target.value }))} className={inputCls} />
        </Row>
        <Row label="Visitas mínimas">
          <input type="number" step="1" min="0" value={form.requisitosVisitas} onChange={e => setForm(f => ({ ...f, requisitosVisitas: parseInt(e.target.value) }))} className={inputCls} />
        </Row>
        <Row label="Multiplicador de puntos (ej. 1.5 = ×1.5)">
          <input type="number" step="0.1" min="1" value={form.multiplicadorPuntos} onChange={e => setForm(f => ({ ...f, multiplicadorPuntos: e.target.value }))} className={inputCls} />
        </Row>
        <Row label="Descuento base (%)">
          <input type="number" step="0.5" min="0" max="100" value={form.descuentoPct} onChange={e => setForm(f => ({ ...f, descuentoPct: e.target.value }))} className={inputCls} />
        </Row>
        <Row label="Orden (menor = nivel más bajo)">
          <input type="number" step="1" min="1" value={form.orden} onChange={e => setForm(f => ({ ...f, orden: parseInt(e.target.value) }))} className={inputCls} />
        </Row>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} className="rounded" />
          Nivel activo
        </label>
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600 transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : isNew ? 'Crear nivel' : 'Actualizar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Campañas de Marketing
// ═══════════════════════════════════════════════════════════════════════════

const CAMPAIGN_ESTADO_STYLE: Record<string, string> = {
  borrador:   'bg-secondary text-muted-foreground border-border',
  programada: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  enviando:   'bg-amber-500/10 text-amber-400 border-amber-500/30',
  completada: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  pausada:    'bg-red-500/10 text-red-400 border-red-500/30',
};

const CANAL_ICONS: Record<string, string> = {
  email: '📧', sms: '💬', whatsapp: '🟢', web: '🌐', ticket: '🧾', cupon_cuenta: '🎫',
};

function CampañasTab() {
  const [campaigns, setCampaigns] = useState<CrmCampaign[]>([]);
  const [selected, setSelected] = useState<CrmCampaign | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<CrmCampaign[]>('/api/crm/campaigns');
      setCampaigns(data);
    } catch { toast.error('Error al cargar campañas'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sendCampaign = async (id: string) => {
    if (!confirm('¿Enviar esta campaña ahora?')) return;
    setSending(id);
    try {
      const res = await api.post<{ destinatarios: number; enviados: number }>(`/api/crm/campaigns/${id}/send`);
      toast.success(`Campaña enviada a ${(res as any).destinatarios} clientes`);
      void load();
    } catch { toast.error('Error al enviar'); }
    finally { setSending(null); }
  };

  const del = async (id: string) => {
    if (!confirm('¿Eliminar esta campaña?')) return;
    try {
      await api.delete(`/api/crm/campaigns/${id}`);
      toast.success('Campaña eliminada');
      setSelected(null);
      void load();
    } catch { toast.error('Error al eliminar'); }
  };

  if (loading) return <LoadingState label="Cargando campañas…" />;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left list */}
      <div className="w-72 shrink-0 flex flex-col border-r border-border bg-card">
        <div className="p-3 border-b border-border flex gap-2 items-center">
          <p className="font-black text-sm flex-1">Campañas</p>
          <button
            onClick={() => { setSelected(null); setShowCreate(true); }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shrink-0"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {campaigns.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Sin campañas</p>
          )}
          {campaigns.map(c => (
            <button
              key={c.id}
              onClick={() => { setSelected(c); setShowCreate(false); }}
              className={`w-full text-left px-3 py-3 border-b border-border/50 hover:bg-secondary transition-colors ${selected?.id === c.id ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500' : ''}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-base shrink-0 mt-0.5">{CANAL_ICONS[c.canal] ?? '📢'}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{c.nombre}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold border ${CAMPAIGN_ESTADO_STYLE[c.estado] ?? ''}`}>
                      {c.estado}
                    </span>
                  </div>
                </div>
                {c.totalDestinatarios > 0 && (
                  <span className="text-xs text-muted-foreground shrink-0">{c.totalDestinatarios}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail or create form */}
      <div className="flex-1 overflow-y-auto p-6">
        {showCreate && (
          <CampaignForm
            onSave={async () => { setShowCreate(false); await load(); }}
            onCancel={() => setShowCreate(false)}
          />
        )}
        {selected && !showCreate && (
          <CampaignDetail
            campaign={selected}
            sending={sending === selected.id}
            onSend={() => sendCampaign(selected.id)}
            onDelete={() => del(selected.id)}
            onRefresh={async () => { await load(); }}
          />
        )}
        {!selected && !showCreate && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Megaphone size={40} className="opacity-30" />
            <p className="text-sm">Selecciona una campaña o crea una nueva</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('manual');
  const [canal, setCanal] = useState('email');
  const [asunto, setAsunto] = useState('');
  const [contenido, setContenido] = useState('');
  const [seg, setSeg] = useState<Record<string, string | boolean | number>>({});
  const [preview, setPreview] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const previewSegment = async () => {
    setPreviewLoading(true);
    try {
      const res = await api.post<{ total: number }>('/api/crm/segment/preview', seg);
      setPreview((res as any).total ?? 0);
    } catch { toast.error('Error al previsualizar'); }
    finally { setPreviewLoading(false); }
  };

  const save = async () => {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      await api.post('/api/crm/campaigns', { nombre, tipo, canal, asunto, contenido, segmento: seg });
      toast.success('Campaña creada');
      onSave();
    } catch { toast.error('Error al crear'); }
    finally { setSaving(false); }
  };

  const TIPOS = [
    { value: 'manual', label: 'Manual' },
    { value: 'automatica', label: 'Automática' },
    { value: 'cumpleanos', label: 'Cumpleaños' },
    { value: 'inactividad', label: 'Inactividad' },
    { value: 'puntos_caducidad', label: 'Puntos próximos a caducar' },
  ];
  const CANALES = [
    { value: 'email', label: '📧 Email' },
    { value: 'sms', label: '💬 SMS' },
    { value: 'whatsapp', label: '🟢 WhatsApp' },
    { value: 'ticket', label: '🧾 Ticket / Mensaje en TPV' },
  ];

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg">Nueva campaña</h2>
        <button onClick={onCancel}><X size={18} className="text-muted-foreground" /></button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Row label="Nombre *">
          <input value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls} placeholder="Ej: Cumpleaños junio" />
        </Row>
        <Row label="Tipo">
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls}>
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Row>
        <Row label="Canal">
          <select value={canal} onChange={e => setCanal(e.target.value)} className={inputCls}>
            {CANALES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Row>
        <Row label="Asunto">
          <input value={asunto} onChange={e => setAsunto(e.target.value)} className={inputCls} placeholder="Asunto del mensaje" />
        </Row>
      </div>

      <Row label="Contenido del mensaje">
        <textarea
          value={contenido} onChange={e => setContenido(e.target.value)}
          className={inputCls + ' h-28 resize-none'}
          placeholder="Escribe el mensaje para tus clientes…"
        />
      </Row>

      {/* Segment builder */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-black text-sm flex items-center gap-2"><Target size={14} className="text-emerald-400" /> Segmentación de destinatarios</h3>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Gasto mínimo (€)">
            <input type="number" min="0" step="10"
              value={(seg.gastoMinimo as number) ?? ''}
              onChange={e => setSeg(s => e.target.value ? { ...s, gastoMinimo: e.target.value } : Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'gastoMinimo')))}
              className={inputCls} placeholder="0 = todos" />
          </Row>
          <Row label="Mínimo de visitas">
            <input type="number" min="0" step="1"
              value={(seg.visitasMinimas as number) ?? ''}
              onChange={e => setSeg(s => e.target.value ? { ...s, visitasMinimas: parseInt(e.target.value) } : Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'visitasMinimas')))}
              className={inputCls} placeholder="0 = todos" />
          </Row>
          <Row label="Puntos mínimos">
            <input type="number" min="0" step="50"
              value={(seg.puntosMinimos as number) ?? ''}
              onChange={e => setSeg(s => e.target.value ? { ...s, puntosMinimos: parseInt(e.target.value) } : Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'puntosMinimos')))}
              className={inputCls} placeholder="0 = todos" />
          </Row>
          <Row label="Inactivo hace (días)">
            <input type="number" min="0" step="10"
              value={(seg.inactivoDias as number) ?? ''}
              onChange={e => setSeg(s => e.target.value ? { ...s, inactivoDias: parseInt(e.target.value) } : Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'inactivoDias')))}
              className={inputCls} placeholder="Ej: 90" />
          </Row>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox"
              checked={!!seg.cumpleanosEsteMes}
              onChange={e => setSeg(s => e.target.checked ? { ...s, cumpleanosEsteMes: true } : Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'cumpleanosEsteMes')))}
              className="rounded" />
            Cumpleaños este mes
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox"
              checked={!!seg.requiereConsentimientoMarketing}
              onChange={e => setSeg(s => e.target.checked ? { ...s, requiereConsentimientoMarketing: true } : Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'requiereConsentimientoMarketing')))}
              className="rounded" />
            Solo con consentimiento marketing
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={previewSegment}
            disabled={previewLoading}
            className="px-4 py-2 rounded-xl border border-emerald-500/40 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/10 transition-colors flex items-center gap-1.5"
          >
            <Eye size={13} /> {previewLoading ? 'Calculando…' : 'Previsualizar destinatarios'}
          </button>
          {preview !== null && (
            <span className="text-sm font-black text-emerald-400">{preview} cliente{preview !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors">Cancelar</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600 transition-colors disabled:opacity-50">
          {saving ? 'Creando…' : 'Crear campaña'}
        </button>
      </div>
    </div>
  );
}

function CampaignDetail({ campaign, sending, onSend, onDelete, onRefresh }: {
  campaign: CrmCampaign; sending: boolean;
  onSend: () => void; onDelete: () => void; onRefresh: () => void;
}) {
  const canSend = campaign.estado !== 'completada' && campaign.estado !== 'enviando';

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">{campaign.nombre}</h2>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${CAMPAIGN_ESTADO_STYLE[campaign.estado] ?? ''}`}>
              {campaign.estado}
            </span>
            <span className="text-sm text-muted-foreground">{CANAL_ICONS[campaign.canal] ?? '📢'} {campaign.canal}</span>
            <span className="text-sm text-muted-foreground capitalize">{campaign.tipo.replace(/_/g, ' ')}</span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={onRefresh} className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-secondary transition-colors">
            <RefreshCw size={15} />
          </button>
          <button
            onClick={onDelete}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Stats */}
      {campaign.totalDestinatarios > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <StatMini label="Destinatarios" value={String(campaign.totalDestinatarios)} color="#6b7280" />
          <StatMini label="Enviados" value={String(campaign.totalEnviados)} color="#3b82f6" />
          <StatMini label="Fallidos" value={String(campaign.totalFallidos)} color="#ef4444" />
          <StatMini label="Usados" value={String(campaign.totalUsados)} color="#10b981" />
        </div>
      )}

      {/* Content preview */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        {campaign.asunto && <p className="font-black text-sm">{campaign.asunto}</p>}
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{campaign.contenido || '(Sin contenido)'}</p>
      </div>

      {/* Segmentation */}
      {Object.keys(campaign.segmento ?? {}).length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <h3 className="font-black text-xs text-muted-foreground uppercase tracking-wide">Segmento</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(campaign.segmento).map(([k, v]) => (
              <span key={k} className="px-2 py-0.5 rounded-full bg-secondary text-xs font-semibold">
                {k}: {String(v)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Send button */}
      {canSend && (
        <button
          onClick={onSend}
          disabled={sending}
          className="w-full py-3 rounded-2xl bg-emerald-500 text-white font-black hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <SendHorizontal size={16} />
          {sending ? 'Enviando…' : 'Enviar campaña ahora'}
        </button>
      )}

      {campaign.estado === 'completada' && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-semibold">
          <Check size={16} /> Campaña completada · {campaign.totalEnviados} envíos realizados
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
