/**
 * Admin · Configuración de Pedidos Online
 * Route: /admin/online-orders-config
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft, Save, Settings, Clock, MapPin, Users,
  Plus, Trash2, Truck, Pause, Play, Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { customFetch } from '@workspace/api-client-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const api = (path: string, opts?: RequestInit) =>
  customFetch(`${BASE}${path}`, opts);
const apiJSON = (path: string, method: string, body?: object) =>
  api(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

// ── Types ──────────────────────────────────────────────────────────────────────

interface OnlineConfig {
  id?: string;
  takeawayEnabled: boolean;
  deliveryEnabled: boolean;
  schedule?: Record<string, { open: string; close: string; open2?: string; close2?: string }> | null;
  prepTimeMinutes: number;
  minOrder: string;
  minOrderDelivery: string;
  deliveryFee: string;
  freeDeliveryFrom?: string | null;
  maxAdvanceHours: number;
  maxOrdersPerSlot: number;
  paused: boolean;
  pauseReason: string;
}

interface DeliveryZone {
  id: string;
  name: string;
  type: string;
  value: { postalCodes?: string[]; cities?: string[] };
  deliveryFee: string;
  minOrder: string;
  estimatedMinutes: number;
  active: boolean;
}

interface Courier {
  id: string;
  name: string;
  phone: string;
  status: string;
}

const DAYS = [
  { key: 'mon', label: 'Lunes' },
  { key: 'tue', label: 'Martes' },
  { key: 'wed', label: 'Miércoles' },
  { key: 'thu', label: 'Jueves' },
  { key: 'fri', label: 'Viernes' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

const TAB_STYLE = (active: boolean) =>
  `px-4 py-2 text-sm font-semibold rounded-xl transition-all ${active
    ? 'bg-amber-500/20 text-amber-400'
    : 'text-zinc-400 hover:text-white'}`;

const INPUT_STYLE = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500';
const LABEL_STYLE = 'block text-xs text-zinc-400 font-semibold uppercase tracking-widest mb-1';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-emerald-500' : 'bg-zinc-700'}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${value ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

// ── Tab: General ──────────────────────────────────────────────────────────────

function TabGeneral({ cfg, onChange, onSave, saving }: {
  cfg: OnlineConfig;
  onChange: (f: Partial<OnlineConfig>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Status toggles */}
      <div className="bg-zinc-800 rounded-2xl p-4 space-y-4">
        <Row label="Habilitar recogida en local">
          <Toggle value={cfg.takeawayEnabled} onChange={v => onChange({ takeawayEnabled: v })} />
        </Row>
        <Row label="Habilitar reparto a domicilio">
          <Toggle value={cfg.deliveryEnabled} onChange={v => onChange({ deliveryEnabled: v })} />
        </Row>
        <Row label="Pausar servicio temporalmente">
          <Toggle value={cfg.paused} onChange={v => onChange({ paused: v })} />
        </Row>
        {cfg.paused && (
          <div>
            <label className={LABEL_STYLE}>Motivo de pausa</label>
            <input
              className={INPUT_STYLE}
              placeholder="Ej. Sin personal esta noche"
              value={cfg.pauseReason}
              onChange={e => onChange({ pauseReason: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* Times */}
      <div className="bg-zinc-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tiempo de preparación (min)" value={String(cfg.prepTimeMinutes)}
          onChange={v => onChange({ prepTimeMinutes: parseInt(v) || 30 })} type="number" />
        <Field label="Horas máx. con antelación" value={String(cfg.maxAdvanceHours)}
          onChange={v => onChange({ maxAdvanceHours: parseInt(v) || 48 })} type="number" />
        <Field label="Máx. pedidos por franja" value={String(cfg.maxOrdersPerSlot)}
          onChange={v => onChange({ maxOrdersPerSlot: parseInt(v) || 10 })} type="number" />
      </div>

      {/* Money */}
      <div className="bg-zinc-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Pedido mínimo — Recogida (€)" value={cfg.minOrder}
          onChange={v => onChange({ minOrder: v })} type="number" step="0.50" />
        <Field label="Pedido mínimo — Reparto (€)" value={cfg.minOrderDelivery}
          onChange={v => onChange({ minOrderDelivery: v })} type="number" step="0.50" />
        <Field label="Precio de envío (€)" value={cfg.deliveryFee}
          onChange={v => onChange({ deliveryFee: v })} type="number" step="0.50" />
        <Field label="Envío gratis a partir de (€, opcional)" value={cfg.freeDeliveryFrom ?? ''}
          onChange={v => onChange({ freeDeliveryFrom: v || null })} type="number" step="0.50" placeholder="Sin mínimo" />
      </div>

      <button onClick={onSave} disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors disabled:opacity-50">
        <Save size={16} />
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-zinc-300">{label}</span>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', step, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; step?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className={LABEL_STYLE}>{label}</label>
      <input
        className={INPUT_STYLE}
        type={type}
        step={step}
        placeholder={placeholder ?? ''}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Tab: Horarios ─────────────────────────────────────────────────────────────

function TabHorarios({ schedule, onChange, onSave, saving }: {
  schedule: Record<string, { open: string; close: string; open2?: string; close2?: string }>;
  onChange: (s: Record<string, { open: string; close: string; open2?: string; close2?: string }>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const update = (key: string, field: string, value: string | undefined) => {
    onChange({ ...schedule, [key]: { ...(schedule[key] ?? { open: '10:00', close: '22:00' }), [field]: value } });
  };
  const toggle = (key: string) => {
    if (schedule[key]) {
      const next = { ...schedule };
      delete next[key];
      onChange(next);
    } else {
      onChange({ ...schedule, [key]: { open: '10:00', close: '22:00' } });
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        Define los horarios en que los clientes pueden hacer pedidos online. Deja el día en blanco para cerrarlo.
      </p>
      <div className="bg-zinc-800 rounded-2xl divide-y divide-zinc-700">
        {DAYS.map(({ key, label }) => {
          const slot = schedule[key];
          return (
            <div key={key} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Toggle value={!!slot} onChange={() => toggle(key)} />
                <span className="font-semibold text-sm text-white">{label}</span>
                {!slot && <span className="text-xs text-zinc-500 ml-auto">Cerrado</span>}
              </div>
              {slot && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pl-14">
                  <TimeField label="Apertura 1" value={slot.open} onChange={v => update(key, 'open', v)} />
                  <TimeField label="Cierre 1" value={slot.close} onChange={v => update(key, 'close', v)} />
                  <TimeField label="Apertura 2" value={slot.open2 ?? ''} onChange={v => update(key, 'open2', v || undefined)} />
                  <TimeField label="Cierre 2" value={slot.close2 ?? ''} onChange={v => update(key, 'close2', v || undefined)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={onSave} disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors disabled:opacity-50">
        <Save size={16} />
        {saving ? 'Guardando…' : 'Guardar horarios'}
      </button>
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1">{label}</label>
      <input type="time" className={INPUT_STYLE} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

// ── Tab: Zonas ────────────────────────────────────────────────────────────────

function TabZonas({ zones, onRefresh }: { zones: DeliveryZone[]; onRefresh: () => void }) {
  const [newZone, setNewZone] = useState({
    name: '', type: 'postal_code', rawValue: '', deliveryFee: '3', minOrder: '15', estimatedMinutes: 45,
  });
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newZone.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    setAdding(true);
    try {
      const raw = newZone.rawValue.split(',').map(s => s.trim()).filter(Boolean);
      const value = newZone.type === 'postal_code' ? { postalCodes: raw } : { cities: raw };
      await apiJSON('/api/admin/delivery-zones', 'POST', {
        name: newZone.name.trim(), type: newZone.type, value,
        deliveryFee: newZone.deliveryFee, minOrder: newZone.minOrder,
        estimatedMinutes: newZone.estimatedMinutes,
      });
      toast.success('Zona añadida');
      setNewZone({ name: '', type: 'postal_code', rawValue: '', deliveryFee: '3', minOrder: '15', estimatedMinutes: 45 });
      onRefresh();
    } catch { toast.error('Error al añadir zona'); }
    finally { setAdding(false); }
  };

  const handleDelete = async (id: string) => {
    await apiJSON(`/api/admin/delivery-zones/${id}`, 'DELETE');
    toast.success('Zona eliminada');
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {zones.length === 0 && (
          <div className="text-center py-10 text-zinc-500 text-sm">Sin zonas configuradas aún.</div>
        )}
        {zones.map(z => (
          <div key={z.id} className="flex items-center gap-3 bg-zinc-800 rounded-2xl p-4">
            <MapPin size={18} className="text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{z.name}</div>
              <div className="text-xs text-zinc-400">
                {z.type === 'postal_code' ? `CPs: ${(z.value.postalCodes ?? []).join(', ')}` : `Ciudades: ${(z.value.cities ?? []).join(', ')}`}
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Envío: {parseFloat(z.deliveryFee).toFixed(2)}€ · Mín: {parseFloat(z.minOrder).toFixed(2)}€ · ~{z.estimatedMinutes} min
              </div>
            </div>
            <button onClick={() => handleDelete(z.id)} className="text-red-400 hover:text-red-300 p-1">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="bg-zinc-800/60 border border-zinc-700 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Nueva zona</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nombre" value={newZone.name} onChange={v => setNewZone(p => ({ ...p, name: v }))} />
          <div>
            <label className={LABEL_STYLE}>Tipo</label>
            <select className={INPUT_STYLE} value={newZone.type}
              onChange={e => setNewZone(p => ({ ...p, type: e.target.value }))}>
              <option value="postal_code">Código postal</option>
              <option value="city">Ciudad</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_STYLE}>
              {newZone.type === 'postal_code' ? 'Códigos postales (separados por coma)' : 'Ciudades (separadas por coma)'}
            </label>
            <input className={INPUT_STYLE} placeholder={newZone.type === 'postal_code' ? '28001, 28002, 28003' : 'Madrid, Alcorcón'}
              value={newZone.rawValue} onChange={e => setNewZone(p => ({ ...p, rawValue: e.target.value }))} />
          </div>
          <Field label="Precio envío (€)" value={newZone.deliveryFee} type="number" step="0.50"
            onChange={v => setNewZone(p => ({ ...p, deliveryFee: v }))} />
          <Field label="Pedido mínimo (€)" value={newZone.minOrder} type="number" step="0.50"
            onChange={v => setNewZone(p => ({ ...p, minOrder: v }))} />
          <Field label="Tiempo estimado (min)" value={String(newZone.estimatedMinutes)} type="number"
            onChange={v => setNewZone(p => ({ ...p, estimatedMinutes: parseInt(v) || 45 }))} />
        </div>
        <button onClick={handleAdd} disabled={adding}
          className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm disabled:opacity-50">
          <Plus size={15} /> Añadir zona
        </button>
      </div>
    </div>
  );
}

// ── Tab: Repartidores ─────────────────────────────────────────────────────────

function TabRepartidores({ couriers, onRefresh }: { couriers: Courier[]; onRefresh: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '' });
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    setAdding(true);
    try {
      await apiJSON('/api/admin/couriers', 'POST', { name: form.name.trim(), phone: form.phone.trim() });
      toast.success('Repartidor añadido');
      setForm({ name: '', phone: '' });
      onRefresh();
    } catch { toast.error('Error al añadir repartidor'); }
    finally { setAdding(false); }
  };

  const handleDelete = async (id: string) => {
    await apiJSON(`/api/admin/couriers/${id}`, 'DELETE');
    toast.success('Repartidor eliminado');
    onRefresh();
  };

  const handleStatus = async (id: string, status: string) => {
    await apiJSON(`/api/admin/couriers/${id}`, 'PATCH', { status });
    onRefresh();
  };

  const STATUS_COLORS: Record<string, string> = {
    available: 'bg-emerald-500/20 text-emerald-400',
    busy: 'bg-amber-500/20 text-amber-400',
    off: 'bg-zinc-700 text-zinc-400',
  };
  const STATUS_LABELS: Record<string, string> = {
    available: 'Disponible', busy: 'Ocupado', off: 'No disponible',
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {couriers.length === 0 && (
          <div className="text-center py-10 text-zinc-500 text-sm">Sin repartidores configurados.</div>
        )}
        {couriers.map(c => (
          <div key={c.id} className="flex items-center gap-3 bg-zinc-800 rounded-2xl p-4">
            <Truck size={18} className="text-blue-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{c.name}</div>
              {c.phone && <div className="text-xs text-zinc-400">{c.phone}</div>}
            </div>
            <select
              className="bg-zinc-700 rounded-xl px-2 py-1 text-xs font-semibold border-0 focus:outline-none"
              value={c.status}
              onChange={e => handleStatus(c.id, e.target.value)}
            >
              <option value="available">Disponible</option>
              <option value="busy">Ocupado</option>
              <option value="off">No disponible</option>
            </select>
            <span className={`px-2 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[c.status] ?? STATUS_COLORS.off}`}>
              {STATUS_LABELS[c.status] ?? c.status}
            </span>
            <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-300 p-1">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="bg-zinc-800/60 border border-zinc-700 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Nuevo repartidor</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nombre" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} />
          <Field label="Teléfono" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} />
        </div>
        <button onClick={handleAdd} disabled={adding}
          className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm disabled:opacity-50">
          <Plus size={15} /> Añadir repartidor
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DEFAULT_CFG: OnlineConfig = {
  takeawayEnabled: false, deliveryEnabled: false, prepTimeMinutes: 30,
  minOrder: '0', minOrderDelivery: '15', deliveryFee: '3',
  freeDeliveryFrom: null, maxAdvanceHours: 48, maxOrdersPerSlot: 10,
  paused: false, pauseReason: '',
};

export default function OnlineConfig() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<'general' | 'horarios' | 'zonas' | 'repartidores'>('general');
  const [cfg, setCfg] = useState<OnlineConfig>(DEFAULT_CFG);
  const [schedule, setSchedule] = useState<Record<string, { open: string; close: string; open2?: string; close2?: string }>>({});
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await api('/api/admin/online-config') as { config: OnlineConfig; zones: DeliveryZone[]; couriers: Courier[] };
      if (data.config) {
        setCfg(data.config);
        setSchedule((data.config.schedule as any) ?? {});
      }
      setZones(data.zones ?? []);
      setCouriers(data.couriers ?? []);
    } catch { toast.error('Error cargando la configuración'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiJSON('/api/admin/online-config', 'PATCH', { ...cfg, schedule });
      toast.success('Configuración guardada');
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const TABS = [
    { key: 'general', label: '⚙️ General', icon: <Settings size={14} /> },
    { key: 'horarios', label: '🕐 Horarios', icon: <Clock size={14} /> },
    { key: 'zonas', label: '📍 Zonas', icon: <MapPin size={14} /> },
    { key: 'repartidores', label: '🚴 Repartidores', icon: <Truck size={14} /> },
  ] as const;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/admin')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors">
            <ArrowLeft size={17} />
          </button>
          <div>
            <h1 className="font-black text-xl">Pedidos Online</h1>
            <p className="text-xs text-zinc-500">Recogida y reparto a domicilio</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-2xl p-1 mb-6 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} className={TAB_STYLE(activeTab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-zinc-500">Cargando…</div>
        ) : (
          <>
            {activeTab === 'general' && (
              <TabGeneral cfg={cfg} onChange={f => setCfg(p => ({ ...p, ...f }))} onSave={handleSave} saving={saving} />
            )}
            {activeTab === 'horarios' && (
              <TabHorarios schedule={schedule} onChange={setSchedule} onSave={handleSave} saving={saving} />
            )}
            {activeTab === 'zonas' && (
              <TabZonas zones={zones} onRefresh={load} />
            )}
            {activeTab === 'repartidores' && (
              <TabRepartidores couriers={couriers} onRefresh={load} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
