/**
 * DevicesPage — gestión de dispositivos offline
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft, Smartphone, Wifi, WifiOff, RefreshCw, ShieldOff,
  AlertTriangle, CheckCircle, Clock, Loader2, Plus,
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
  return new Date(d).toLocaleDateString('es-ES');
}

interface Device {
  id: string; name: string; deviceType: string; fingerprint: string;
  status: string; pendingOps: number; lastSeenAt: string | null;
  lastSyncAt: string | null; offlinePerms: string[]; isDemo: boolean;
}

interface QueueItem {
  id: string; operationType: string; status: string;
  createdAt: string; lastError: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  online: 'text-green-400 bg-green-950/40 border-green-800',
  offline: 'text-muted-foreground bg-secondary border-border',
  syncing: 'text-blue-400 bg-blue-950/40 border-blue-800',
  blocked: 'text-orange-400 bg-orange-950/40 border-orange-800',
  revoked: 'text-red-400 bg-red-950/40 border-red-800',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  online: <Wifi size={11} />,
  offline: <WifiOff size={11} />,
  syncing: <RefreshCw size={11} className="animate-spin" />,
  blocked: <AlertTriangle size={11} />,
  revoked: <ShieldOff size={11} />,
};

const DEVICE_TYPE_ICON: Record<string, React.ReactNode> = {
  tpv: <Smartphone size={18} />,
  kds: <Smartphone size={18} />,
  tablet: <Smartphone size={18} />,
  mobile: <Smartphone size={18} />,
};

export default function DevicesPage() {
  const [, setLocation] = useLocation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'devices' | 'queue'>('devices');
  const [selected, setSelected] = useState<Device | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('tpv');

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

  useEffect(() => { void loadDevices(); void loadQueue(); }, [loadDevices, loadQueue]);

  async function updateDeviceStatus(id: string, status: string) {
    const r = await apiFetch(`/offline/devices/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    if (r.ok) {
      toast.success(`Dispositivo ${status}`);
      await loadDevices();
      setSelected(null);
    } else toast.error('Error');
  }

  async function resolveQueueItem(id: string, resolution: string) {
    await apiFetch(`/offline/queue/${id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution }) });
    await loadQueue();
    toast.success('Operación resuelta');
  }

  async function registerDevice() {
    if (!newName) { toast.error('Introduce un nombre'); return; }
    const r = await apiFetch('/offline/devices', { method: 'POST', body: JSON.stringify({ name: newName, deviceType: newType }) });
    if (r.ok) {
      toast.success('Dispositivo registrado');
      setShowRegister(false); setNewName(''); setNewType('tpv');
      await loadDevices();
    } else toast.error('Error al registrar');
  }

  const pendingQueue = queue.filter(q => ['pending', 'conflict', 'failed'].includes(q.status));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-14 shrink-0 flex items-center px-4 bg-card border-b border-border gap-3">
        <button onClick={() => setLocation('/admin')} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors">
          <ArrowLeft size={16} />
        </button>
        <Smartphone size={18} className="text-cyan-400" />
        <h1 className="font-black text-base">Dispositivos Offline</h1>
        <div className="flex-1" />
        <button onClick={() => setShowRegister(!showRegister)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-xl text-xs font-bold hover:bg-secondary transition-colors">
          <Plus size={12} /> Registrar
        </button>
      </header>

      {/* Register form */}
      {showRegister && (
        <div className="px-4 py-3 bg-card border-b border-border flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Nombre</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="TPV Terraza…"
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-cyan-500/60" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Tipo</label>
            <select value={newType} onChange={e => setNewType(e.target.value)}
              className="px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none">
              {['tpv','kds','tablet','mobile','kiosk'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button onClick={registerDevice} className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-sm rounded-xl transition-colors">
            Registrar
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-0 shrink-0">
        {[
          { id: 'devices' as const, label: `Dispositivos (${devices.length})` },
          { id: 'queue' as const, label: `Cola offline${pendingQueue.length > 0 ? ` (${pendingQueue.length})` : ''}` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-t-lg text-xs font-bold border-b-2 transition-all ${tab === t.id ? 'bg-card border-cyan-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-card/60'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {tab === 'devices' && (
          <>
            {loading && devices.length === 0 && (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
            )}

            {devices.length === 0 && !loading && (
              <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
                <Smartphone size={28} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">Sin dispositivos registrados</p>
                <p className="text-xs mt-1">Los dispositivos se registran automáticamente al conectar</p>
              </div>
            )}

            {devices.map(dev => (
              <div key={dev.id} className={`bg-card border rounded-xl p-4 transition-all ${selected?.id === dev.id ? 'border-cyan-700' : 'border-border'}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground shrink-0">
                    {DEVICE_TYPE_ICON[dev.deviceType] ?? <Smartphone size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black">{dev.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 ${STATUS_STYLE[dev.status] ?? STATUS_STYLE.offline}`}>
                        {STATUS_ICON[dev.status]}{dev.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground capitalize">{dev.deviceType}</span>
                      {dev.isDemo && <span className="text-[10px] text-yellow-400 border border-yellow-800 px-1.5 py-0.5 rounded-full">demo</span>}
                    </div>
                    <div className="flex gap-4 mt-1 flex-wrap">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock size={10} /> Visto: {fmtDate(dev.lastSeenAt)}
                      </span>
                      {dev.lastSyncAt && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <RefreshCw size={10} /> Sync: {fmtDate(dev.lastSyncAt)}
                        </span>
                      )}
                      {dev.pendingOps > 0 && (
                        <span className="text-[11px] text-yellow-400 flex items-center gap-1">
                          <AlertTriangle size={10} /> {dev.pendingOps} ops pendientes
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {dev.offlinePerms.map(p => (
                        <span key={p} className="text-[9px] bg-secondary/60 text-muted-foreground px-1.5 py-0.5 rounded-md">{p}</span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setSelected(selected?.id === dev.id ? null : dev)}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary transition-colors shrink-0">
                    Gestionar
                  </button>
                </div>

                {selected?.id === dev.id && (
                  <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2">
                    {dev.status !== 'online' && (
                      <button onClick={() => updateDeviceStatus(dev.id, 'online')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-950/40 text-green-400 border border-green-800 text-xs font-bold hover:bg-green-950/60 transition-colors">
                        <Wifi size={12} /> Marcar online
                      </button>
                    )}
                    {dev.status !== 'blocked' && dev.status !== 'revoked' && (
                      <button onClick={() => updateDeviceStatus(dev.id, 'blocked')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-950/40 text-orange-400 border border-orange-800 text-xs font-bold hover:bg-orange-950/60 transition-colors">
                        <AlertTriangle size={12} /> Bloquear
                      </button>
                    )}
                    {dev.status !== 'revoked' && (
                      <button onClick={() => updateDeviceStatus(dev.id, 'revoked')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/40 text-red-400 border border-red-800 text-xs font-bold hover:bg-red-950/60 transition-colors">
                        <ShieldOff size={12} /> Revocar
                      </button>
                    )}
                    <span className="text-[10px] text-muted-foreground/60 font-mono self-center ml-auto">
                      {dev.fingerprint.slice(0, 12)}…
                    </span>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'queue' && (
          <>
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
                          className="text-[10px] px-2 py-1 rounded-lg bg-green-950/40 text-green-400 border border-green-800 hover:bg-green-950/60 transition-colors font-bold">
                          Aceptar
                        </button>
                        <button onClick={() => resolveQueueItem(item.id, 'skip')}
                          className="text-[10px] px-2 py-1 rounded-lg bg-secondary text-muted-foreground border border-border hover:bg-secondary/80 transition-colors font-bold">
                          Ignorar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
