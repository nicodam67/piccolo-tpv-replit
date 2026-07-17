/**
 * DevicesPage — Hardware inventory, tablet management, IP registry, network diagnostics
 * Replaces the previous minimal devices screen with full hardware management.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft, Smartphone, Monitor, Printer, Wifi, WifiOff, RefreshCw,
  ShieldOff, AlertTriangle, CheckCircle, Clock, Loader2, Plus,
  Edit3, Save, X, Network, Activity, Server, Tablet, Globe,
  Cpu, ChevronDown, MapPin, User, FileText, History, Zap,
  Router, TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('token') ?? '';
  return fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return 'Nunca';
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return 'Hace un momento';
  if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)} h`;
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Device {
  id: string;
  name: string;
  deviceType: string;
  deviceSubtype: string;
  fingerprint: string;
  status: string;
  pendingOps: number;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  offlinePerms: string[];
  isDemo: boolean;
  ipAddress: string | null;
  macAddress: string | null;
  os: string | null;
  browserVersion: string | null;
  assignedZoneId: string | null;
  defaultPrinterId: string | null;
  cobroPermitido: boolean;
  offlineAutorizado: boolean;
  usuarioHabitual: string | null;
  notes: string | null;
}

interface QueueItem {
  id: string;
  operationType: string;
  status: string;
  createdAt: string;
  lastError: string | null;
}

interface Zone { id: string; name: string; }
interface Printer { id: string; name: string; }
interface Employee { id: string; nombre: string; apellidos?: string; }

interface PingResult {
  deviceId: string;
  deviceName: string;
  ipAddress: string | null;
  checkedAt: string;
  lan: { reachable: boolean; latencyMs: number | null; error?: string };
  api: { reachable: boolean; latencyMs: number | null };
  printer: { reachable: boolean | null; latencyMs: number | null };
  internet: { reachable: boolean; latencyMs: number | null };
}

interface DiagnosticsResult {
  serverInternet: { reachable: boolean; latencyMs: number | null };
  checkedAt: string;
  devices: PingResult[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUBTYPE_LABELS: Record<string, string> = {
  ordenador_principal: 'Ordenador principal',
  tablet_tpv: 'Tablet TPV',
  kds: 'KDS cocina',
  impresora: 'Impresora',
  caja_autocobro: 'Caja autocobro',
  otro: 'Otro',
};

const STATUS_STYLE: Record<string, string> = {
  online:  'text-green-400 bg-green-950/40 border-green-800',
  offline: 'text-muted-foreground bg-secondary border-border',
  syncing: 'text-blue-400 bg-blue-950/40 border-blue-800',
  blocked: 'text-orange-400 bg-orange-950/40 border-orange-800',
  revoked: 'text-red-400 bg-red-950/40 border-red-800',
  pending: 'text-yellow-400 bg-yellow-950/30 border-yellow-800',
  error:   'text-red-400 bg-red-950/40 border-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  online: 'En línea', offline: 'Sin conexión', syncing: 'Sincronizando',
  blocked: 'Bloqueado', revoked: 'Revocado', pending: 'Pendiente', error: 'Error',
};

function SubtypeIcon({ subtype, size = 18 }: { subtype: string; size?: number }) {
  switch (subtype) {
    case 'ordenador_principal': return <Server size={size} />;
    case 'tablet_tpv': return <Tablet size={size} />;
    case 'kds': return <Monitor size={size} />;
    case 'impresora': return <Printer size={size} />;
    case 'caja_autocobro': return <Cpu size={size} />;
    default: return <Smartphone size={size} />;
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 shrink-0 ${STATUS_STYLE[status] ?? STATUS_STYLE.offline}`}>
      {status === 'online' ? <Wifi size={9} /> : status === 'syncing' ? <RefreshCw size={9} className="animate-spin" /> : status === 'blocked' ? <AlertTriangle size={9} /> : status === 'revoked' ? <ShieldOff size={9} /> : <WifiOff size={9} />}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Edit Drawer ──────────────────────────────────────────────────────────────

interface EditDrawerProps {
  device: Device;
  zones: Zone[];
  printers: Printer[];
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}

function EditDrawer({ device, zones, printers, employees, onClose, onSaved }: EditDrawerProps) {
  const [form, setForm] = useState({
    name: device.name,
    deviceSubtype: device.deviceSubtype,
    ipAddress: device.ipAddress ?? '',
    macAddress: device.macAddress ?? '',
    os: device.os ?? '',
    browserVersion: device.browserVersion ?? '',
    assignedZoneId: device.assignedZoneId ?? '',
    defaultPrinterId: device.defaultPrinterId ?? '',
    cobroPermitido: device.cobroPermitido,
    offlineAutorizado: device.offlineAutorizado,
    usuarioHabitual: device.usuarioHabitual ?? '',
    notes: device.notes ?? '',
    status: device.status,
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const r = await apiFetch(`/offline/devices/${device.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...form,
          assignedZoneId: form.assignedZoneId || null,
          defaultPrinterId: form.defaultPrinterId || null,
          usuarioHabitual: form.usuarioHabitual || null,
          ipAddress: form.ipAddress || null,
          macAddress: form.macAddress || null,
          os: form.os || null,
          browserVersion: form.browserVersion || null,
          notes: form.notes || null,
        }),
      });
      if (r.ok) {
        toast.success('Dispositivo actualizado');
        onSaved();
        onClose();
      } else {
        const e = await r.json().catch(() => ({}));
        toast.error(e.error ?? 'Error al guardar');
      }
    } finally { setSaving(false); }
  }

  const field = (label: string, children: React.ReactNode) => (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );

  const input = (key: keyof typeof form, placeholder = '') => (
    <input
      value={String(form[key])}
      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      placeholder={placeholder}
      className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-cyan-500/60"
    />
  );

  const select = (key: keyof typeof form, opts: Array<{ value: string; label: string }>) => (
    <div className="relative">
      <select
        value={String(form[key])}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none appearance-none pr-8"
      >
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
    </div>
  );

  const toggle = (key: 'cobroPermitido' | 'offlineAutorizado', label: string) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <button
        onClick={() => setForm(f => ({ ...f, [key]: !f[key] }))}
        className={`w-10 h-5 rounded-full transition-colors relative ${form[key] ? 'bg-cyan-600' : 'bg-secondary'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${form[key] ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[380px] bg-card border-l border-border flex flex-col overflow-hidden">
        <div className="h-14 shrink-0 flex items-center px-4 border-b border-border gap-3">
          <SubtypeIcon subtype={form.deviceSubtype} size={16} />
          <h2 className="font-black text-sm flex-1 truncate">{form.name}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors text-muted-foreground">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {field('Nombre', input('name', 'Nombre del dispositivo'))}
          {field('Tipo', select('deviceSubtype', Object.entries(SUBTYPE_LABELS).map(([value, label]) => ({ value, label }))))}
          {field('Estado', select('status', [
            { value: 'online', label: 'En línea' }, { value: 'offline', label: 'Sin conexión' },
            { value: 'pending', label: 'Pendiente' }, { value: 'blocked', label: 'Bloqueado' },
            { value: 'revoked', label: 'Revocado' },
          ]))}

          <div className="border-t border-border pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Red</p>
            {field('Dirección IP', input('ipAddress', '192.168.1.10'))}
            {field('Dirección MAC', input('macAddress', 'AA:BB:CC:DD:EE:FF'))}
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Sistema</p>
            {field('Sistema operativo', input('os', 'Android 13 / iPadOS 17'))}
            {field('Versión navegador/app', input('browserVersion', 'Chrome 120'))}
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Asignación</p>
            {field('Zona habitual', (
              <div className="relative">
                <select
                  value={form.assignedZoneId}
                  onChange={e => setForm(f => ({ ...f, assignedZoneId: e.target.value }))}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none appearance-none pr-8"
                >
                  <option value="">Sin asignar</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            ))}
            {field('Impresora predeterminada', (
              <div className="relative">
                <select
                  value={form.defaultPrinterId}
                  onChange={e => setForm(f => ({ ...f, defaultPrinterId: e.target.value }))}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none appearance-none pr-8"
                >
                  <option value="">Sin asignar</option>
                  {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            ))}
            {field('Usuario habitual', (
              <div className="relative">
                <select
                  value={form.usuarioHabitual}
                  onChange={e => setForm(f => ({ ...f, usuarioHabitual: e.target.value }))}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none appearance-none pr-8"
                >
                  <option value="">Sin asignar</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.nombre} {e.apellidos ?? ''}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Permisos</p>
            {toggle('cobroPermitido', 'Cobro permitido')}
            {toggle('offlineAutorizado', 'Modo offline autorizado')}
          </div>

          {field('Notas', (
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Notas internas…"
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-cyan-500/60 resize-none"
            />
          ))}
        </div>

        <div className="p-4 border-t border-border shrink-0">
          <button onClick={save} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-60">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Traffic light cell ───────────────────────────────────────────────────────

function TrafficLight({ value, latencyMs }: { value: boolean | null; latencyMs: number | null }) {
  if (value === null) return <span className="text-[10px] text-muted-foreground/40">—</span>;
  if (value) return (
    <span className="flex items-center gap-1 text-green-400">
      <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
      <span className="text-[10px]">{latencyMs != null ? `${latencyMs}ms` : 'OK'}</span>
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-red-400">
      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
      <span className="text-[10px]">Fallo</span>
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DevicesPage() {
  const [, setLocation] = useLocation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'devices' | 'registry' | 'diagnostics' | 'queue'>('devices');
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSubtype, setFilterSubtype] = useState('');
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [pingLoading, setPingLoading] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Record<string, PingResult>>({});
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/offline/devices');
      if (r.ok) setDevices(await r.json());
    } finally { setLoading(false); }
  }, []);

  const loadQueue = useCallback(async () => {
    const r = await apiFetch('/offline/queue?limit=100');
    if (r.ok) { const d = await r.json(); setQueue(d.data ?? []); }
  }, []);

  const loadLookups = useCallback(async () => {
    const [zr, pr, er] = await Promise.all([
      apiFetch('/zones'),
      apiFetch('/admin/printers'),
      apiFetch('/hr/employees?limit=200'),
    ]);
    if (zr.ok) setZones(await zr.json());
    if (pr.ok) { const d = await pr.json(); setPrinters(d.data ?? d ?? []); }
    if (er.ok) { const d = await er.json(); setEmployees(d.data ?? d ?? []); }
  }, []);

  useEffect(() => {
    void loadDevices();
    void loadQueue();
    void loadLookups();
  }, [loadDevices, loadQueue, loadLookups]);

  async function runAllDiagnostics() {
    setDiagLoading(true);
    try {
      const r = await apiFetch('/offline/network-diagnostics');
      if (r.ok) setDiagnostics(await r.json());
      else toast.error('Error al ejecutar diagnóstico');
    } finally { setDiagLoading(false); }
  }

  async function pingDevice(id: string) {
    setPingLoading(id);
    try {
      const r = await apiFetch(`/offline/devices/${id}/ping`, { method: 'POST' });
      if (r.ok) {
        const data = await r.json() as PingResult;
        setPingResults(prev => ({ ...prev, [id]: data }));
      } else toast.error('Error al probar dispositivo');
    } finally { setPingLoading(null); }
  }

  async function loadHistory(id: string) {
    const r = await apiFetch(`/offline/devices/${id}/history`);
    if (r.ok) { setHistory(await r.json()); setShowHistory(id); }
  }

  async function resolveQueueItem(id: string, resolution: string) {
    await apiFetch(`/offline/queue/${id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution }) });
    await loadQueue();
    toast.success('Operación resuelta');
  }

  // Detect duplicate IPs
  const ipMap = devices.reduce<Record<string, string[]>>((acc, d) => {
    if (d.ipAddress) { (acc[d.ipAddress] ??= []).push(d.id); }
    return acc;
  }, {});
  const duplicateIps = Object.entries(ipMap).filter(([, ids]) => ids.length > 1).map(([ip]) => ip);

  const filteredDevices = devices.filter(d => {
    if (filterStatus && d.status !== filterStatus) return false;
    if (filterSubtype && d.deviceSubtype !== filterSubtype) return false;
    return true;
  });

  const pendingQueue = queue.filter(q => ['pending', 'conflict', 'failed'].includes(q.status));

  const zoneMap = Object.fromEntries(zones.map(z => [z.id, z.name]));
  const printerMap = Object.fromEntries(printers.map(p => [p.id, p.name]));
  const employeeMap = Object.fromEntries(employees.map(e => [e.id, `${e.nombre} ${e.apellidos ?? ''}`.trim()]));

  const TABS = [
    { id: 'devices' as const, label: `Dispositivos (${devices.length})`, icon: <Smartphone size={12} /> },
    { id: 'registry' as const, label: `Registro IP${duplicateIps.length > 0 ? ` ⚠️${duplicateIps.length}` : ''}`, icon: <Router size={12} /> },
    { id: 'diagnostics' as const, label: 'Diagnóstico de red', icon: <Activity size={12} /> },
    { id: 'queue' as const, label: `Cola offline${pendingQueue.length > 0 ? ` (${pendingQueue.length})` : ''}`, icon: <Network size={12} /> },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* Header */}
      <header className="h-14 shrink-0 flex items-center px-4 bg-card border-b border-border gap-3">
        <button onClick={() => setLocation('/admin')} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors">
          <ArrowLeft size={16} />
        </button>
        <Server size={18} className="text-cyan-400" />
        <h1 className="font-black text-base">Dispositivos e Inventario</h1>
        <div className="flex-1" />
        <button onClick={() => { void loadDevices(); void loadQueue(); }}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {/* Duplicate IP warning banner */}
      {duplicateIps.length > 0 && (
        <div className="mx-4 mt-3 px-4 py-2.5 bg-orange-950/40 border border-orange-800 rounded-xl flex items-center gap-2">
          <TriangleAlert size={14} className="text-orange-400 shrink-0" />
          <p className="text-xs text-orange-300 font-semibold">
            IPs duplicadas detectadas: {duplicateIps.join(', ')} — dos o más dispositivos comparten la misma dirección.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-bold border-b-2 whitespace-nowrap transition-all ${tab === t.id ? 'bg-card border-cyan-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-card/60'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">

        {/* ── Tab: Dispositivos ────────────────────────────────────────────── */}
        {tab === 'devices' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="pl-3 pr-7 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none appearance-none">
                  <option value="">Todos los estados</option>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              <div className="relative">
                <select value={filterSubtype} onChange={e => setFilterSubtype(e.target.value)}
                  className="pl-3 pr-7 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none appearance-none">
                  <option value="">Todos los tipos</option>
                  {Object.entries(SUBTYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {loading && devices.length === 0 && (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
            )}
            {devices.length === 0 && !loading && (
              <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
                <Server size={28} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">Sin dispositivos registrados</p>
              </div>
            )}

            {filteredDevices.map(dev => {
              const isDupIp = dev.ipAddress ? duplicateIps.includes(dev.ipAddress) : false;
              return (
                <div key={dev.id} className={`bg-card border rounded-xl p-4 ${isDupIp ? 'border-orange-700' : 'border-border'}`}>
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground shrink-0">
                      <SubtypeIcon subtype={dev.deviceSubtype} size={18} />
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black">{dev.name}</span>
                        <StatusBadge status={dev.status} />
                        <span className="text-[10px] text-muted-foreground">{SUBTYPE_LABELS[dev.deviceSubtype] ?? dev.deviceSubtype}</span>
                        {dev.isDemo && <span className="text-[10px] text-yellow-400 border border-yellow-800 px-1.5 py-0.5 rounded-full">demo</span>}
                        {isDupIp && <span className="text-[10px] text-orange-400 border border-orange-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><TriangleAlert size={8} />IP duplicada</span>}
                      </div>

                      {/* Network row */}
                      <div className="flex gap-4 mt-1.5 flex-wrap">
                        {dev.ipAddress && (
                          <span className="text-[11px] text-cyan-400/80 font-mono flex items-center gap-1">
                            <Globe size={9} /> {dev.ipAddress}
                          </span>
                        )}
                        {dev.macAddress && (
                          <span className="text-[11px] text-muted-foreground font-mono">{dev.macAddress}</span>
                        )}
                        {dev.os && <span className="text-[11px] text-muted-foreground">{dev.os}</span>}
                      </div>

                      {/* Assignment row */}
                      <div className="flex gap-4 mt-1 flex-wrap">
                        {dev.assignedZoneId && zoneMap[dev.assignedZoneId] && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <MapPin size={9} /> {zoneMap[dev.assignedZoneId]}
                          </span>
                        )}
                        {dev.defaultPrinterId && printerMap[dev.defaultPrinterId] && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Printer size={9} /> {printerMap[dev.defaultPrinterId]}
                          </span>
                        )}
                        {dev.usuarioHabitual && employeeMap[dev.usuarioHabitual] && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <User size={9} /> {employeeMap[dev.usuarioHabitual]}
                          </span>
                        )}
                      </div>

                      {/* Perms + timestamps */}
                      <div className="flex gap-4 mt-1 flex-wrap">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock size={9} /> {fmtDate(dev.lastSeenAt)}
                        </span>
                        {!dev.cobroPermitido && (
                          <span className="text-[10px] text-orange-400/80">Cobro no permitido</span>
                        )}
                        {!dev.offlineAutorizado && (
                          <span className="text-[10px] text-yellow-400/80">Sin offline</span>
                        )}
                        {dev.pendingOps > 0 && (
                          <span className="text-[11px] text-yellow-400 flex items-center gap-1">
                            <AlertTriangle size={9} /> {dev.pendingOps} ops pendientes
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => setEditDevice(dev)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs font-bold hover:bg-secondary/80 transition-colors">
                        <Edit3 size={11} /> Editar
                      </button>
                      <button onClick={() => loadHistory(dev.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs font-bold hover:bg-secondary/80 transition-colors text-muted-foreground">
                        <History size={11} /> Historial
                      </button>
                    </div>
                  </div>

                  {dev.notes && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-[11px] text-muted-foreground italic flex items-start gap-1">
                        <FileText size={9} className="mt-0.5 shrink-0" /> {dev.notes}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tab: Registro IP ─────────────────────────────────────────────── */}
        {tab === 'registry' && (
          <div className="space-y-3">
            {duplicateIps.length > 0 && (
              <div className="px-4 py-3 bg-orange-950/40 border border-orange-800 rounded-xl">
                <p className="text-xs font-bold text-orange-400 flex items-center gap-2 mb-1">
                  <TriangleAlert size={13} /> IPs duplicadas — revisar configuración de red
                </p>
                {duplicateIps.map(ip => {
                  const devs = devices.filter(d => d.ipAddress === ip);
                  return (
                    <p key={ip} className="text-xs text-orange-300/80 ml-5">
                      {ip} → {devs.map(d => d.name).join(', ')}
                    </p>
                  );
                })}
              </div>
            )}

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-4 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Dispositivo</th>
                    <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">IP</th>
                    <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">MAC</th>
                    <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Tipo</th>
                    <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Zona</th>
                    <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Estado</th>
                    <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Última conexión</th>
                  </tr>
                </thead>
                <tbody>
                  {[...devices].sort((a, b) => (a.ipAddress ?? 'zzz').localeCompare(b.ipAddress ?? 'zzz')).map(dev => {
                    const isDup = dev.ipAddress ? duplicateIps.includes(dev.ipAddress) : false;
                    return (
                      <tr key={dev.id} className={`border-b border-border/60 hover:bg-secondary/20 transition-colors ${isDup ? 'bg-orange-950/20' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <SubtypeIcon subtype={dev.deviceSubtype} size={12} />
                            <span className="font-semibold">{dev.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {dev.ipAddress
                            ? <span className={`font-mono ${isDup ? 'text-orange-400 font-bold' : 'text-cyan-400/80'}`}>{dev.ipAddress}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                          {isDup && <span className="ml-1 text-[9px] text-orange-400">⚠</span>}
                        </td>
                        <td className="px-3 py-3 font-mono text-muted-foreground">{dev.macAddress ?? <span className="opacity-30">—</span>}</td>
                        <td className="px-3 py-3 text-muted-foreground">{SUBTYPE_LABELS[dev.deviceSubtype] ?? dev.deviceSubtype}</td>
                        <td className="px-3 py-3 text-muted-foreground">{dev.assignedZoneId ? (zoneMap[dev.assignedZoneId] ?? '—') : '—'}</td>
                        <td className="px-3 py-3"><StatusBadge status={dev.status} /></td>
                        <td className="px-3 py-3 text-muted-foreground">{fmtDate(dev.lastSeenAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {devices.length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-xs">Sin dispositivos registrados</div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Diagnóstico de red ──────────────────────────────────────── */}
        {tab === 'diagnostics' && (
          <div className="space-y-4">
            {/* Internet status */}
            {diagnostics && (
              <div className={`px-4 py-3 border rounded-xl flex items-center gap-3 ${diagnostics.serverInternet.reachable ? 'bg-green-950/30 border-green-800' : 'bg-red-950/30 border-red-800'}`}>
                <Globe size={16} className={diagnostics.serverInternet.reachable ? 'text-green-400' : 'text-red-400'} />
                <div>
                  <p className={`text-sm font-bold ${diagnostics.serverInternet.reachable ? 'text-green-400' : 'text-red-400'}`}>
                    Internet: {diagnostics.serverInternet.reachable ? 'Conectado' : 'Sin conexión'}
                  </p>
                  {diagnostics.serverInternet.latencyMs != null && (
                    <p className="text-[11px] text-muted-foreground">{diagnostics.serverInternet.latencyMs}ms · última comprobación: {fmtDate(diagnostics.checkedAt)}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={runAllDiagnostics} disabled={diagLoading}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-60">
                {diagLoading ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                {diagLoading ? 'Probando…' : 'Probar todo'}
              </button>
            </div>

            {diagnostics || devices.length > 0 ? (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left px-4 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Dispositivo</th>
                      <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">IP</th>
                      <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">LAN</th>
                      <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">API</th>
                      <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Impresora</th>
                      <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Internet</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map(dev => {
                      const diagDev = diagnostics?.devices.find(d => d.deviceId === dev.id);
                      const pResult = pingResults[dev.id] ?? diagDev;
                      const isProbing = pingLoading === dev.id;
                      return (
                        <tr key={dev.id} className="border-b border-border/60 hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <SubtypeIcon subtype={dev.deviceSubtype} size={11} />
                              <span className="font-semibold">{dev.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 font-mono text-cyan-400/70 text-[10px]">{dev.ipAddress ?? <span className="text-muted-foreground/40">—</span>}</td>
                          <td className="px-3 py-3">
                            {pResult ? <TrafficLight value={pResult.lan?.reachable ?? false} latencyMs={pResult.lan?.latencyMs ?? null} /> : <span className="text-muted-foreground/30 text-[10px]">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            {pResult ? <TrafficLight value={pResult.api?.reachable ?? null} latencyMs={pResult.api?.latencyMs ?? null} /> : <span className="text-muted-foreground/30 text-[10px]">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            {pResult ? <TrafficLight value={pResult.printer?.reachable ?? null} latencyMs={pResult.printer?.latencyMs ?? null} /> : <span className="text-muted-foreground/30 text-[10px]">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            {pResult ? <TrafficLight value={pResult.internet?.reachable ?? null} latencyMs={pResult.internet?.latencyMs ?? null} /> : <span className="text-muted-foreground/30 text-[10px]">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => pingDevice(dev.id)}
                              disabled={isProbing}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary border border-border text-[10px] font-bold hover:bg-secondary/80 transition-colors disabled:opacity-50 text-muted-foreground">
                              {isProbing ? <Loader2 size={9} className="animate-spin" /> : <Zap size={9} />}
                              {isProbing ? '…' : 'Probar'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {devices.length === 0 && (
                  <div className="py-8 text-center text-muted-foreground text-xs">Sin dispositivos registrados</div>
                )}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
                <Activity size={28} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">Pulsa "Probar todo" para iniciar el diagnóstico</p>
                <p className="text-xs mt-1">Se comprobará la conectividad de cada dispositivo registrado</p>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Cola offline ────────────────────────────────────────────── */}
        {tab === 'queue' && (
          <div className="space-y-3">
            {queue.length === 0 && (
              <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
                <CheckCircle size={28} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">Cola offline vacía</p>
              </div>
            )}
            {queue.map(item => {
              const statusColor: Record<string, string> = {
                synced: 'text-green-400', pending: 'text-yellow-400',
                conflict: 'text-orange-400', failed: 'text-red-400',
                sending: 'text-blue-400', skipped: 'text-muted-foreground',
              };
              return (
                <div key={item.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black">{item.operationType.replace(/_/g, ' ')}</span>
                        <span className={`text-[10px] font-bold ${statusColor[item.status] ?? 'text-muted-foreground'}`}>{item.status}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(item.createdAt)}</p>
                      {item.lastError && <p className="text-[10px] text-red-400/80 mt-0.5">{item.lastError}</p>}
                    </div>
                    {['conflict', 'failed', 'pending'].includes(item.status) && (
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => resolveQueueItem(item.id, 'accept_server')}
                          className="text-[10px] px-2 py-1 rounded-lg bg-green-950/40 text-green-400 border border-green-800 hover:bg-green-950/60 transition-colors font-bold">Aceptar</button>
                        <button onClick={() => resolveQueueItem(item.id, 'skip')}
                          className="text-[10px] px-2 py-1 rounded-lg bg-secondary text-muted-foreground border border-border hover:bg-secondary/80 transition-colors font-bold">Ignorar</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit drawer */}
      {editDevice && (
        <EditDrawer
          device={editDevice}
          zones={zones}
          printers={printers}
          employees={employees}
          onClose={() => setEditDevice(null)}
          onSaved={loadDevices}
        />
      )}

      {/* Audit history modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowHistory(null)} />
          <div className="relative bg-card border border-border rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden">
            <div className="h-12 flex items-center px-4 border-b border-border gap-2 shrink-0">
              <History size={14} className="text-muted-foreground" />
              <h3 className="text-sm font-black">Historial de cambios</h3>
              <button onClick={() => setShowHistory(null)} className="ml-auto text-muted-foreground hover:text-foreground"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {history.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Sin historial de cambios</p>}
              {history.map((h: any) => (
                <div key={h.id} className="bg-secondary/30 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-cyan-400/80 uppercase">{h.event.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{fmtDate(h.createdAt)}</span>
                  </div>
                  {(h.oldValue || h.newValue) && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {h.oldValue} → {h.newValue}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
