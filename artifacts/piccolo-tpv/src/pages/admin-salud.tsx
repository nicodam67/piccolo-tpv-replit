import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import {
  Activity, ChevronLeft, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  Clock, Database, HardDrive, Printer, Shield, Wifi, Archive, Server,
  Cpu, Zap, Download, AlertTriangle, Info, Circle,
  BarChart2, Monitor,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TrafficLight = 'green' | 'yellow' | 'red' | 'unknown';

interface StatusItem {
  ok: boolean;
  message?: string;
  [key: string]: unknown;
}

interface SystemStatus {
  ok: boolean;
  checkedAt: string;
  status: {
    database?: StatusItem;
    storage?: StatusItem & { usedMb?: number; availMb?: number; totalMb?: number; pct?: number };
    printers?: StatusItem & { total?: number; down?: number; devices?: Array<{ name: string; status: string; lastSeenAt: string | null }> };
    print_queue?: StatusItem & { errorJobs?: number };
    backups?: StatusItem & { lastBackupAt?: string | null; verified?: boolean };
    offline_queue?: StatusItem & { pendingOps?: number };
    alerts?: StatusItem & { criticalUnresolved?: number };
  };
}

interface Connectivity {
  ok: boolean;
  dbLatencyMs: number;
  serverTime: string;
  uptime: number;
  nodeVersion: string;
}

interface TechEvent {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  module: string;
  message: string;
  resolved: boolean;
  createdAt: string;
}

interface TechEventsResponse {
  rows: TechEvent[];
  total: number;
}

interface VersionInfo {
  version: string;
  releaseDate: string;
  migrationsApplied: number | null;
  dbLatencyMs: number | null;
  nodeVersion: string;
  uptimeSeconds: number;
  environment: string;
  changelog: Array<{
    version: string;
    date: string;
    highlights: string[];
    migrations: number;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────



function light(ok: boolean | undefined): TrafficLight {
  if (ok === undefined) return 'unknown';
  return ok ? 'green' : 'red';
}

function lightFromPct(pct: number | undefined): TrafficLight {
  if (pct === undefined) return 'unknown';
  if (pct < 70) return 'green';
  if (pct < 90) return 'yellow';
  return 'red';
}

const LIGHT_CONFIG: Record<TrafficLight, { dot: string; bg: string; border: string; text: string; label: string }> = {
  green:   { dot: 'bg-emerald-400', bg: 'bg-emerald-500/8',  border: 'border-emerald-500/25', text: 'text-emerald-400',  label: 'OK' },
  yellow:  { dot: 'bg-amber-400',   bg: 'bg-amber-500/8',    border: 'border-amber-500/25',   text: 'text-amber-400',    label: 'Aviso' },
  red:     { dot: 'bg-red-400',     bg: 'bg-red-500/8',      border: 'border-red-500/25',     text: 'text-red-400',      label: 'Error' },
  unknown: { dot: 'bg-slate-400',   bg: 'bg-slate-500/8',    border: 'border-slate-500/25',   text: 'text-slate-400',    label: '—' },
};

const LEVEL_CONFIG: Record<string, { color: string; Icon: typeof AlertCircle }> = {
  info:     { color: 'text-blue-400',    Icon: Info },
  warning:  { color: 'text-amber-400',   Icon: AlertTriangle },
  error:    { color: 'text-red-400',     Icon: XCircle },
  critical: { color: 'text-red-500',     Icon: AlertCircle },
};

function fmtUptime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function backupAge(iso: string | null | undefined): TrafficLight {
  if (!iso) return 'red';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 26 * 3600_000) return 'green';
  if (diff < 72 * 3600_000) return 'yellow';
  return 'red';
}

// ─── StatusCard ───────────────────────────────────────────────────────────────

function StatusCard({
  icon: Icon,
  title,
  light: tl,
  main,
  sub,
  children,
}: {
  icon: typeof Activity;
  title: string;
  light: TrafficLight;
  main: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  const cfg = LIGHT_CONFIG[tl];
  return (
    <div className={`rounded-xl border p-5 space-y-3 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-background/50`}>
            <Icon size={18} className={cfg.text} />
          </div>
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className={`font-bold text-sm mt-0.5 ${cfg.text}`}>{main}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.text} bg-background/40 border ${cfg.border}`}>
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminSalud() {
  const [eventsPage, setEventsPage] = useState(0);

  const { data: sysStatus, isLoading: loadingStatus, refetch: refetchStatus, dataUpdatedAt } = useQuery<SystemStatus>({
    queryKey: ['diagnostics-status'],
    queryFn: () => customFetch<SystemStatus>(`/api/diagnostics/status`),
    refetchInterval: 30_000,
  });

  const { data: conn } = useQuery<Connectivity>({
    queryKey: ['diagnostics-connectivity'],
    queryFn: () => customFetch<Connectivity>(`/api/diagnostics/connectivity`),
    refetchInterval: 60_000,
  });

  const { data: version } = useQuery<VersionInfo>({
    queryKey: ['system-version'],
    queryFn: () => customFetch<VersionInfo>(`/api/admin/system/version`),
  });

  const { data: events } = useQuery<TechEventsResponse>({
    queryKey: ['diagnostics-events', eventsPage],
    queryFn: () => customFetch<TechEventsResponse>(`/api/diagnostics/events?limit=20&offset=${eventsPage * 20}`),
    refetchInterval: 60_000,
  });

  const st = sysStatus?.status ?? {};
  const overallLight: TrafficLight = sysStatus === undefined ? 'unknown'
    : sysStatus.ok ? 'green' : 'red';

  // Calculate a yellow overall if any sub-status is not ok
  const subLights = [
    light(st.database?.ok),
    light(st.printers?.ok),
    light(st.backups?.ok),
    light(st.alerts?.ok),
    light(st.offline_queue?.ok),
    light(st.print_queue?.ok),
    lightFromPct(st.storage?.pct),
  ];
  const effectiveLight: TrafficLight = overallLight === 'red'
    ? (subLights.some(l => l === 'red') ? 'red' : 'yellow')
    : overallLight;

  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      version: version?.version,
      systemStatus: sysStatus,
      connectivity: conn,
      recentEvents: events?.rows?.slice(0, 20),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `piccolo-salud-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/admin">
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft size={16} /> Panel
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-black flex items-center gap-2">
              <Activity size={20} className="text-primary" />
              Salud del sistema
            </h1>
            {sysStatus && (
              <p className="text-xs text-muted-foreground">
                Última comprobación: {fmtDate(sysStatus.checkedAt)}
              </p>
            )}
          </div>
          <button
            onClick={() => refetchStatus()}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-secondary transition-colors"
          >
            <RefreshCw size={13} className={loadingStatus ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-secondary transition-colors"
          >
            <Download size={13} /> Exportar
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        {/* ── Overall health banner ──────────────────────────────────────────── */}
        <div className={`rounded-2xl border-2 p-6 flex items-center gap-6 ${LIGHT_CONFIG[effectiveLight].border} ${LIGHT_CONFIG[effectiveLight].bg}`}>
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center bg-background/60 border ${LIGHT_CONFIG[effectiveLight].border}`}>
            {effectiveLight === 'green' ? (
              <CheckCircle2 size={32} className="text-emerald-400" />
            ) : effectiveLight === 'yellow' ? (
              <AlertCircle size={32} className="text-amber-400" />
            ) : effectiveLight === 'red' ? (
              <XCircle size={32} className="text-red-400" />
            ) : (
              <Circle size={32} className="text-slate-400" />
            )}
          </div>
          <div className="flex-1">
            <p className={`text-xl font-black ${LIGHT_CONFIG[effectiveLight].text}`}>
              {effectiveLight === 'green' ? 'Sistema en buen estado' :
               effectiveLight === 'yellow' ? 'Sistema con advertencias' :
               effectiveLight === 'red' ? 'Se detectaron errores' :
               'Obteniendo estado…'}
            </p>
            <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
              {conn && (
                <>
                  <span className="flex items-center gap-1"><Cpu size={11} /> {conn.nodeVersion}</span>
                  <span className="flex items-center gap-1"><Server size={11} /> Activo {fmtUptime(conn.uptime)}</span>
                  <span className="flex items-center gap-1"><Database size={11} /> DB {conn.dbLatencyMs}ms</span>
                </>
              )}
              {version && (
                <span className="flex items-center gap-1"><BarChart2 size={11} /> v{version.version} · {version.migrationsApplied} migraciones</span>
              )}
            </div>
          </div>
          {/* Semaphore dots */}
          <div className="flex flex-col gap-2 items-end shrink-0">
            {subLights.filter(l => l !== 'unknown').map((l, i) => (
              <span key={i} className={`w-3 h-3 rounded-full ${LIGHT_CONFIG[l].dot}`} />
            ))}
          </div>
        </div>

        {/* ── Status grid ───────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground mb-3">Indicadores en tiempo real</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            {/* Database */}
            <StatusCard
              icon={Database}
              title="Base de datos"
              light={light(st.database?.ok)}
              main={st.database?.ok ? 'Conectada' : 'Sin conexión'}
              sub={conn ? `${conn.dbLatencyMs}ms de latencia` : undefined}
            />

            {/* Storage */}
            <StatusCard
              icon={HardDrive}
              title="Almacenamiento"
              light={lightFromPct(st.storage?.pct)}
              main={st.storage?.message ?? '—'}
              sub={st.storage?.availMb != null ? `${st.storage.availMb} MB disponibles de ${st.storage.totalMb} MB` : undefined}
            >
              {st.storage?.pct != null && (
                <div className="w-full bg-secondary rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      (st.storage.pct ?? 0) < 70 ? 'bg-emerald-500' :
                      (st.storage.pct ?? 0) < 90 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${st.storage.pct}%` }}
                  />
                </div>
              )}
            </StatusCard>

            {/* Printers */}
            <StatusCard
              icon={Printer}
              title="Impresoras"
              light={light(st.printers?.ok)}
              main={st.printers?.message ?? '—'}
              sub={st.printers?.total != null ? `${st.printers.total} activas` : undefined}
            />

            {/* Print queue */}
            <StatusCard
              icon={Zap}
              title="Cola de impresión"
              light={light(st.print_queue?.ok)}
              main={st.print_queue?.message ?? '—'}
              sub={st.print_queue?.errorJobs ? `${st.print_queue.errorJobs} trabajos en error` : undefined}
            />

            {/* Backups */}
            <StatusCard
              icon={Archive}
              title="Copia de seguridad"
              light={backupAge(st.backups?.lastBackupAt as string | undefined)}
              main={st.backups?.ok ? 'Copia reciente' : 'Sin copia reciente'}
              sub={st.backups?.lastBackupAt ? `Última: ${fmtDate(st.backups.lastBackupAt as string)}` : 'Sin registro de copias'}
            />

            {/* Offline queue */}
            <StatusCard
              icon={Wifi}
              title="Cola offline"
              light={light(st.offline_queue?.ok)}
              main={st.offline_queue?.message ?? '—'}
              sub={st.offline_queue?.pendingOps ? `${st.offline_queue.pendingOps} operaciones > 2h pendientes` : undefined}
            />

            {/* Alerts */}
            <StatusCard
              icon={Shield}
              title="Alertas críticas"
              light={light(st.alerts?.ok)}
              main={st.alerts?.ok ? 'Sin alertas activas' : st.alerts?.message ?? '—'}
              sub={(st.alerts as { criticalUnresolved?: number })?.criticalUnresolved
                ? `${(st.alerts as { criticalUnresolved?: number }).criticalUnresolved} alerta(s) sin resolver`
                : undefined}
            />

            {/* Uptime */}
            <StatusCard
              icon={Clock}
              title="Tiempo activo"
              light={conn ? 'green' : 'unknown'}
              main={conn ? fmtUptime(conn.uptime) : '—'}
              sub={conn ? `Servidor activo desde el inicio` : undefined}
            />

            {/* Environment */}
            <StatusCard
              icon={Monitor}
              title="Entorno"
              light="green"
              main={version?.environment === 'production' ? 'Producción' : version?.environment === 'development' ? 'Desarrollo' : version?.environment ?? '—'}
              sub={version ? `v${version.version} · ${version.nodeVersion}` : undefined}
            />
          </div>
        </div>

        {/* ── Printers detail ───────────────────────────────────────────────── */}
        {(st.printers?.devices ?? []).length > 0 && (
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground mb-3">Detalle de impresoras</h2>
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {(st.printers!.devices!).map((p, i) => {
                const ok = p.status === 'ok' || p.status === 'online';
                return (
                  <div key={i} className="flex items-center gap-4 px-5 py-3">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="flex-1 text-sm font-medium">{p.name}</span>
                    <span className={`text-xs ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{p.status}</span>
                    <span className="text-xs text-muted-foreground">{p.lastSeenAt ? fmtDate(p.lastSeenAt) : '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Version & changelog ───────────────────────────────────────────── */}
        {version && (
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground mb-3">Versión y registro de cambios</h2>
            <div className="space-y-3">
              {version.changelog.map((entry) => (
                <div key={entry.version} className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-black text-primary">v{entry.version}</span>
                    <span className="text-xs text-muted-foreground">{entry.date}</span>
                    {entry.migrations > 0 && (
                      <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                        {entry.migrations} migración{entry.migrations !== 1 ? 'es' : ''}
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {entry.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="text-primary mt-1 shrink-0">·</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Technical events log ─────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground mb-3">
            Registro de eventos técnicos
            {events?.total != null && (
              <span className="ml-2 font-normal text-xs normal-case">({events.total} total)</span>
            )}
          </h2>
          {(events?.rows ?? []).length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Sin eventos técnicos registrados</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {(events!.rows).map((ev) => {
                const cfg = LEVEL_CONFIG[ev.level] ?? LEVEL_CONFIG['info'];
                const { Icon } = cfg;
                return (
                  <div key={ev.id} className="flex items-start gap-4 px-5 py-3">
                    <Icon size={14} className={`mt-0.5 shrink-0 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold ${cfg.color} uppercase`}>{ev.level}</span>
                        <span className="text-xs text-muted-foreground">{ev.module}</span>
                        {ev.resolved && (
                          <span className="text-xs bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">Resuelto</span>
                        )}
                      </div>
                      <p className="text-sm mt-0.5 truncate">{ev.message}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtDate(ev.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
          {/* Pagination */}
          {events?.total != null && events.total > 20 && (
            <div className="flex justify-center gap-3 mt-3">
              <button
                disabled={eventsPage === 0}
                onClick={() => setEventsPage(p => p - 1)}
                className="px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-secondary disabled:opacity-40 transition-colors"
              >
                ← Anterior
              </button>
              <span className="text-sm text-muted-foreground self-center">
                Página {eventsPage + 1} de {Math.ceil(events.total / 20)}
              </span>
              <button
                disabled={(eventsPage + 1) * 20 >= events.total}
                onClick={() => setEventsPage(p => p + 1)}
                className="px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-secondary disabled:opacity-40 transition-colors"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>

        {/* ── Quick links ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Diagnóstico de módulos', href: '/admin/sistema', Icon: Activity },
            { label: 'Inventario de instalación', href: '/admin/instalacion', Icon: Monitor },
            { label: 'Copias de seguridad', href: '/admin/backup', Icon: Archive },
          ].map(({ label, href, Icon }) => (
            <Link key={href} href={href}>
              <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:bg-secondary/30 transition-colors cursor-pointer">
                <Icon size={16} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{label}</span>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
