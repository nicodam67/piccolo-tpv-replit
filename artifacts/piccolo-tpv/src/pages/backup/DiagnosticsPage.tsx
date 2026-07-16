/**
 * DiagnosticsPage — estado del sistema, eventos técnicos, mantenimiento
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft, Activity, Database, HardDrive, PrinterIcon, Wifi,
  AlertTriangle, CheckCircle, XCircle, RefreshCw, Download, Wrench,
  Info, AlertCircle, Filter, Loader2,
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
  if (!d) return '—';
  return new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

interface StatusSection {
  ok?: boolean;
  message?: string;
  [key: string]: unknown;
}

interface TechEvent {
  id: string;
  level: string;
  module: string;
  message: string;
  code?: string;
  createdAt: string;
  resolved: boolean;
}

const LEVEL_STYLE: Record<string, string> = {
  info: 'text-blue-400 bg-blue-950/40 border-blue-800',
  warning: 'text-yellow-400 bg-yellow-950/40 border-yellow-800',
  error: 'text-red-400 bg-red-950/40 border-red-800',
  critical: 'text-red-300 bg-red-950/60 border-red-600',
};
const LEVEL_ICON: Record<string, React.ReactNode> = {
  info: <Info size={12} />,
  warning: <AlertTriangle size={12} />,
  error: <XCircle size={12} />,
  critical: <AlertCircle size={12} />,
};

const SECTION_ICON: Record<string, React.ReactNode> = {
  database: <Database size={20} />,
  storage: <HardDrive size={20} />,
  printers: <PrinterIcon size={20} />,
  print_queue: <PrinterIcon size={20} />,
  backups: <HardDrive size={20} />,
  offline_queue: <Wifi size={20} />,
  alerts: <AlertTriangle size={20} />,
};

type MaintenanceAction = 'clear_events' | 'repair_queue' | 'reindex' | 'all';

export default function DiagnosticsPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<Record<string, StatusSection>>({});
  const [statusOk, setStatusOk] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [connectivity, setConnectivity] = useState<Record<string, unknown>>({});
  const [events, setEvents] = useState<TechEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [levelFilter, setLevelFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [tab, setTab] = useState<'status' | 'events' | 'maintenance'>('status');
  const [loading, setLoading] = useState(false);
  const [maintenanceResult, setMaintenanceResult] = useState<Record<string, string> | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, cr] = await Promise.all([
        apiFetch('/diagnostics/status'),
        apiFetch('/diagnostics/connectivity'),
      ]);
      if (sr.ok) {
        const d = await sr.json();
        setStatus(d.status ?? {});
        setStatusOk(d.ok);
        setCheckedAt(d.checkedAt);
      }
      if (cr.ok) setConnectivity(await cr.json());
    } finally { setLoading(false); }
  }, []);

  const loadEvents = useCallback(async () => {
    const params = new URLSearchParams();
    if (levelFilter) params.set('level', levelFilter);
    if (moduleFilter) params.set('module', moduleFilter);
    params.set('limit', '100');
    const r = await apiFetch(`/diagnostics/events?${params}`);
    if (r.ok) {
      const d = await r.json();
      setEvents(d.data ?? []);
      setEventsTotal(d.total ?? 0);
    }
  }, [levelFilter, moduleFilter]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => { void loadEvents(); }, [loadEvents]);

  async function downloadReport() {
    const token = localStorage.getItem('token') ?? '';
    const r = await fetch(`${BASE}/api/diagnostics/report`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { toast.error('Error al descargar'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'piccolo_diagnostics.json'; a.click();
    URL.revokeObjectURL(url); toast.success('Informe descargado');
  }

  async function runMaintenance(action: MaintenanceAction) {
    if (!confirm(`¿Ejecutar mantenimiento: ${action}?`)) return;
    const r = await apiFetch('/diagnostics/maintenance', { method: 'POST', body: JSON.stringify({ action }) });
    const d = await r.json();
    if (d.ok) { setMaintenanceResult(d.results); toast.success('Mantenimiento completado'); await loadStatus(); }
    else toast.error('Error en mantenimiento');
  }

  async function resolveEvent(id: string) {
    await apiFetch(`/diagnostics/events/${id}/resolve`, { method: 'PATCH' });
    await loadEvents();
  }

  const SECTIONS = Object.entries(status);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-14 shrink-0 flex items-center px-4 bg-card border-b border-border gap-3">
        <button onClick={() => setLocation('/admin')} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors">
          <ArrowLeft size={16} />
        </button>
        <Activity size={18} className="text-emerald-400" />
        <h1 className="font-black text-base">Diagnóstico Técnico</h1>
        <div className="flex-1" />
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${statusOk ? 'bg-green-950/40 text-green-400 border-green-800' : 'bg-red-950/40 text-red-400 border-red-800'}`}>
          {statusOk ? <CheckCircle size={11} /> : <XCircle size={11} />}
          {statusOk ? 'Sistema OK' : 'Problemas detectados'}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-0 shrink-0">
        {[
          { id: 'status' as const, label: 'Estado', icon: <Activity size={14} /> },
          { id: 'events' as const, label: `Eventos${eventsTotal > 0 ? ` (${eventsTotal})` : ''}`, icon: <AlertTriangle size={14} /> },
          { id: 'maintenance' as const, label: 'Mantenimiento', icon: <Wrench size={14} /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-bold border-b-2 transition-all ${tab === t.id ? 'bg-card border-emerald-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-card/60'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {tab === 'status' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {checkedAt ? `Última comprobación: ${fmtDate(checkedAt)}` : 'Cargando…'}
              </p>
              <button onClick={loadStatus} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary transition-colors">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Actualizar
              </button>
            </div>

            {/* Connectivity card */}
            {Object.keys(connectivity).length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Conectividad</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Latencia BD</p>
                    <p className="text-sm font-black tabular-nums">{(connectivity as { dbLatencyMs?: number }).dbLatencyMs ?? '—'} ms</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Uptime</p>
                    <p className="text-sm font-black tabular-nums">{Math.round(((connectivity as { uptime?: number }).uptime ?? 0) / 60)} min</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Node.js</p>
                    <p className="text-sm font-black">{(connectivity as { nodeVersion?: string }).nodeVersion ?? '—'}</p>
                  </div>
                </div>
              </div>
            )}

            {loading && SECTIONS.length === 0 && (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SECTIONS.map(([key, section]) => {
                const ok = section?.ok !== false;
                return (
                  <div key={key} className={`bg-card border rounded-xl p-4 ${ok ? 'border-border' : 'border-red-800/60'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ok ? 'bg-green-950/40 text-green-400' : 'bg-red-950/40 text-red-400'}`}>
                        {SECTION_ICON[key] ?? <Activity size={18} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {ok ? <CheckCircle size={12} className="text-green-400 shrink-0" /> : <XCircle size={12} className="text-red-400 shrink-0" />}
                          <p className="text-xs font-black capitalize">{key.replace(/_/g, ' ')}</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{section?.message as string ?? '—'}</p>
                        {key === 'storage' && (section as { pct?: number; usedMb?: number; availMb?: number }).pct !== undefined && (
                          <div className="mt-2">
                            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${(section as { pct?: number }).pct! > 80 ? 'bg-red-500' : 'bg-emerald-500'}`}
                                style={{ width: `${(section as { pct?: number }).pct}%` }} />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">{(section as { usedMb?: number }).usedMb} MB usados · {(section as { availMb?: number }).availMb} MB libres</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={downloadReport}
              className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-xl text-xs font-bold hover:bg-secondary transition-colors">
              <Download size={13} /> Descargar informe de soporte
            </button>
          </>
        )}

        {tab === 'events' && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
                className="px-3 py-2 bg-card border border-border rounded-xl text-xs focus:outline-none">
                <option value="">Todos los niveles</option>
                {['info','warning','error','critical'].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}
                className="px-3 py-2 bg-card border border-border rounded-xl text-xs focus:outline-none">
                <option value="">Todos los módulos</option>
                {['backup','printer','offline','system','maintenance'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <button onClick={loadEvents} className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl text-xs hover:bg-secondary transition-colors">
                <Filter size={12} /> Aplicar
              </button>
            </div>

            {events.length === 0 && (
              <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
                <CheckCircle size={28} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">Sin eventos registrados</p>
              </div>
            )}

            {events.map(e => (
              <div key={e.id} className={`bg-card border rounded-xl p-3 ${e.resolved ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 shrink-0 mt-0.5 ${LEVEL_STYLE[e.level] ?? LEVEL_STYLE.info}`}>
                    {LEVEL_ICON[e.level]}{e.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">{e.module}</span>
                      <span className="text-xs text-muted-foreground/60">{fmtDate(e.createdAt)}</span>
                      {e.resolved && <span className="text-[10px] text-green-400">✓ resuelto</span>}
                    </div>
                    <p className="text-xs mt-0.5 leading-snug">{e.message}</p>
                    {e.code && <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">{e.code}</p>}
                  </div>
                  {!e.resolved && (
                    <button onClick={() => resolveEvent(e.id)} className="text-[10px] px-2 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors shrink-0">
                      Resolver
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'maintenance' && (
          <div className="max-w-md space-y-4">
            <div className="bg-amber-950/20 border border-amber-700/40 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-400 mt-0.5" />
                <p className="text-xs text-amber-300/90 leading-relaxed">
                  Las acciones de mantenimiento pueden afectar al rendimiento temporalmente. Ejecuta en horario de baja actividad.
                </p>
              </div>
            </div>

            {[
              { action: 'clear_events' as const, label: 'Limpiar eventos resueltos', desc: 'Elimina eventos técnicos resueltos de más de 30 días', icon: <Trash2 size={14} /> },
              { action: 'repair_queue' as const, label: 'Reparar cola offline', desc: 'Reinicia operaciones bloqueadas en estado "enviando"', icon: <RefreshCw size={14} /> },
              { action: 'reindex' as const, label: 'Reindexar base de datos', desc: 'VACUUM ANALYZE — optimiza consultas y limpia bloat', icon: <Database size={14} /> },
            ].map(item => (
              <div key={item.action} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <button onClick={() => runMaintenance(item.action)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-xs font-bold hover:bg-secondary transition-colors shrink-0">
                  {item.icon} Ejecutar
                </button>
              </div>
            ))}

            {maintenanceResult && (
              <div className="bg-card border border-green-800/40 rounded-xl p-4">
                <p className="text-xs font-bold text-green-400 mb-2">✓ Mantenimiento completado</p>
                {Object.entries(maintenanceResult).map(([k, v]) => (
                  <p key={k} className="text-xs text-muted-foreground">{k}: {v}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Missing import
function Trash2({ size, className }: { size?: number; className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size ?? 16} height={size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/></svg>;
}
