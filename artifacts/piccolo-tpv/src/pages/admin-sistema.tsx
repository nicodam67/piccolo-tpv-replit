import { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  RefreshCw,
  Download,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CircleDashed,
  AlertCircle,
  Filter,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
} from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ModuleStatus = 'ok' | 'warning' | 'partial' | 'critical' | 'simulated';

interface AuditModule {
  id: string;
  name: string;
  area: string;
  description: string;
  baseStatus: ModuleStatus;
  effectiveStatus: ModuleStatus;
  statusLabel: string;
  knownIssues: string[];
  activeFindings: number;
  findings: Array<{
    id: string;
    severity: string;
    title: string;
    description: string;
    detectedAt: string;
  }>;
}

interface AuditSummary {
  total: number;
  ok: number;
  warning: number;
  partial: number;
  critical: number;
  simulated: number;
  readyPct: number;
}

interface ModulesResponse {
  modules: AuditModule[];
  summary: AuditSummary;
}

interface RunResult {
  runId: string;
  modulesChecked: number;
  findingsInserted: number;
  criticalCount: number;
  warningCount: number;
  durationMs: number;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ModuleStatus, {
  label: string;
  icon: React.FC<{ size?: number; className?: string }>;
  color: string;
  bg: string;
  border: string;
  dot: string;
}> = {
  ok: {
    label: 'Funcional',
    icon: CheckCircle2,
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.08)',
    border: 'rgba(34,197,94,0.25)',
    dot: '#22c55e',
  },
  warning: {
    label: 'Con incidencias',
    icon: AlertTriangle,
    color: '#eab308',
    bg: 'rgba(234,179,8,0.08)',
    border: 'rgba(234,179,8,0.28)',
    dot: '#eab308',
  },
  partial: {
    label: 'Parcialmente funcional',
    icon: AlertCircle,
    color: '#f97316',
    bg: 'rgba(249,115,22,0.08)',
    border: 'rgba(249,115,22,0.28)',
    dot: '#f97316',
  },
  critical: {
    label: 'No usar en producción',
    icon: XCircle,
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.28)',
    dot: '#ef4444',
  },
  simulated: {
    label: 'Simulado / Sin conectar',
    icon: CircleDashed,
    color: '#6b7280',
    bg: 'rgba(107,114,128,0.08)',
    border: 'rgba(107,114,128,0.25)',
    dot: '#9ca3af',
  },
};

const SEVERITY_ORDER: ModuleStatus[] = ['critical', 'partial', 'warning', 'simulated', 'ok'];

function StatusBadge({ status, size = 'sm' }: { status: ModuleStatus; size?: 'sm' | 'md' }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size === 'md' ? 6 : 4,
        padding: size === 'md' ? '4px 10px' : '2px 8px',
        borderRadius: 6,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
        fontSize: size === 'md' ? 13 : 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={size === 'md' ? 14 : 12} />
      {cfg.label}
    </span>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ summary }: { summary: AuditSummary }) {
  const segments: Array<{ status: ModuleStatus; count: number }> = (
    [
      { status: 'ok' as ModuleStatus, count: summary.ok },
      { status: 'warning' as ModuleStatus, count: summary.warning },
      { status: 'partial' as ModuleStatus, count: summary.partial },
      { status: 'critical' as ModuleStatus, count: summary.critical },
      { status: 'simulated' as ModuleStatus, count: summary.simulated },
    ] as Array<{ status: ModuleStatus; count: number }>
  ).filter((s) => s.count > 0);

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Progress bar */}
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1, marginBottom: 16 }}>
        {segments.map(({ status, count }) => (
          <div
            key={status}
            style={{
              flex: count,
              background: STATUS_CONFIG[status].dot,
              minWidth: 4,
            }}
            title={`${STATUS_CONFIG[status].label}: ${count}`}
          />
        ))}
      </div>

      {/* Counts row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {([
          ['ok', '🟢', 'Funcional'],
          ['warning', '🟡', 'Con incidencias'],
          ['partial', '🟠', 'Parcial'],
          ['critical', '🔴', 'Crítico'],
          ['simulated', '⚫', 'Simulado'],
        ] as [ModuleStatus, string, string][]).map(([status, emoji, label]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>{emoji}</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: STATUS_CONFIG[status].color }}>
              {summary[status]}
            </span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: summary.readyPct >= 80 ? '#22c55e' : summary.readyPct >= 60 ? '#eab308' : '#ef4444' }}>
            {summary.readyPct}%
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Preparación go-live</div>
        </div>
      </div>
    </div>
  );
}

// ─── Module card ──────────────────────────────────────────────────────────────

function ModuleCard({ mod }: { mod: AuditModule }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[mod.effectiveStatus];
  const hasIssues = mod.knownIssues.length > 0 || mod.activeFindings > 0;

  return (
    <div
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 10,
        padding: '14px 16px',
        cursor: hasIssues ? 'pointer' : 'default',
        transition: 'border-color 0.2s',
      }}
      onClick={() => hasIssues && setExpanded((v) => !v)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Status dot */}
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: cfg.dot,
            flexShrink: 0,
            marginTop: 4,
          }}
        />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#f3f4f6' }}>{mod.name}</span>
            <StatusBadge status={mod.effectiveStatus} />
            {mod.activeFindings > 0 && (
              <span style={{
                fontSize: 11, background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, padding: '1px 6px', fontWeight: 600,
              }}>
                {mod.activeFindings} hallazgo{mod.activeFindings > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{mod.description}</div>
        </div>

        {/* Expand icon */}
        {hasIssues && (
          <div style={{ color: '#6b7280', flexShrink: 0 }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        )}
      </div>

      {/* Expanded issues */}
      {expanded && hasIssues && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${cfg.border}` }}>
          {mod.knownIssues.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Incidencias conocidas
              </div>
              {mod.knownIssues.map((issue, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <AlertTriangle size={13} style={{ color: cfg.color, flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 12, color: '#d1d5db', lineHeight: 1.5 }}>{issue}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Area group ───────────────────────────────────────────────────────────────

function AreaGroup({ area, modules }: { area: string; modules: AuditModule[] }) {
  const worstStatus = [...modules]
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.effectiveStatus) - SEVERITY_ORDER.indexOf(b.effectiveStatus))[0]
    ?.effectiveStatus ?? 'ok';
  const cfg = STATUS_CONFIG[worstStatus];

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {area}
        </span>
        <span style={{
          fontSize: 11, padding: '1px 7px', borderRadius: 4,
          background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, fontWeight: 600,
        }}>
          {modules.length} módulo{modules.length > 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...modules]
          .sort((a, b) => SEVERITY_ORDER.indexOf(a.effectiveStatus) - SEVERITY_ORDER.indexOf(b.effectiveStatus))
          .map((m) => (
            <ModuleCard key={m.id} mod={m} />
          ))}
      </div>
    </div>
  );
}

// ─── Duplications panel ───────────────────────────────────────────────────────

function DuplicationsPanel() {
  const duplications = [
    {
      title: "online-orders.ts (v1) + online-orders-v2.ts registrados simultáneamente",
      description: "Ambas versiones usan la tabla 'orders' y exponen rutas públicas distintas. La v1 (POST /public/orders/online) y la v2 (POST /public/orders/online-v2) coexisten activamente. El cliente QR usa v2 pero la inbox y algunos webhooks apuntan a v1.",
      severity: "partial" as ModuleStatus,
    },
    {
      title: "generateOrderNumber() duplicado en dos archivos",
      description: "La función generateOrderNumber() está implementada dos veces con lógica idéntica (Math.random) en online-orders.ts y online-orders-v2.ts. Riesgo de colisión de número de pedido si ambas están activas.",
      severity: "warning" as ModuleStatus,
    },
    {
      title: "Ruta GET /public/online-config registrada en v1 y v2",
      description: "El endpoint GET /public/online-config está declarado en online-orders.ts. La v2 asume que hereda esta configuración pero añade campos (tipEnabled, tableOrderingEnabled) en la misma respuesta. El router usa el primero que coincida — en el orden actual, v1 gana.",
      severity: "warning" as ModuleStatus,
    },
  ];

  return (
    <div style={{
      background: 'rgba(249,115,22,0.05)',
      border: '1px solid rgba(249,115,22,0.2)',
      borderRadius: 12,
      padding: 20,
      marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <AlertCircle size={18} style={{ color: '#f97316' }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f3f4f6' }}>Duplicaciones detectadas</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {duplications.map((d, i) => (
          <div key={i} style={{
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 8,
            padding: '12px 14px',
            borderLeft: `3px solid ${STATUS_CONFIG[d.severity].dot}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', marginBottom: 4 }}>{d.title}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>{d.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminSistema() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [filterArea, setFilterArea] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [lastRun, setLastRun] = useState<RunResult | null>(null);

  const { data, isLoading, isError } = useQuery<ModulesResponse>({
    queryKey: ['audit-modules'],
    queryFn: async () => {
      const r = await customFetch('/api/admin/audit/modules') as Response;
      if (!r.ok) throw new Error('Error cargando módulos');
      return r.json() as Promise<ModulesResponse>;
    },
    staleTime: 30_000,
  });

  const runMutation = useMutation<RunResult>({
    mutationFn: async () => {
      const r = await customFetch('/api/admin/audit/run', { method: 'POST' }) as Response;
      if (!r.ok) throw new Error('Error ejecutando auditoría');
      return r.json() as Promise<RunResult>;
    },
    onSuccess: (result) => {
      setLastRun(result);
      qc.invalidateQueries({ queryKey: ['audit-modules'] });
    },
  });

  const downloadReport = useCallback(async (format: 'json' | 'md') => {
    const r = await customFetch(`/api/admin/audit/report?format=${format}`, {
      headers: format === 'md' ? { Accept: 'text/markdown' } : {},
    }) as Response;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `piccolo-audit-${Date.now()}.${format === 'md' ? 'md' : 'json'}`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Gather unique areas for filter
  const areas = data ? ['all', ...Array.from(new Set(data.modules.map((m) => m.area))).sort()] : ['all'];
  const statusOptions = ['all', 'ok', 'warning', 'partial', 'critical', 'simulated'];

  // Apply filters
  const filtered = data?.modules.filter((m) => {
    if (filterArea !== 'all' && m.area !== filterArea) return false;
    if (filterStatus !== 'all' && m.effectiveStatus !== filterStatus) return false;
    return true;
  }) ?? [];

  // Group by area
  const byArea = new Map<string, AuditModule[]>();
  for (const m of filtered) {
    if (!byArea.has(m.area)) byArea.set(m.area, []);
    byArea.get(m.area)!.push(m);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1117',
      color: '#f3f4f6',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(15,17,23,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, height: 60 }}>
          <button
            onClick={() => navigate('/admin')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0',
            }}
          >
            <ChevronLeft size={18} />
            <span style={{ fontSize: 14 }}>Admin</span>
          </button>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />

          <Activity size={20} style={{ color: '#6366f1' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Estado del sistema</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Diagnóstico y clasificación de módulos</div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button
              onClick={() => downloadReport('md')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 7,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#d1d5db', fontSize: 13, cursor: 'pointer',
              }}
            >
              <Download size={14} />
              Informe .md
            </button>
            <button
              onClick={() => downloadReport('json')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 7,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#d1d5db', fontSize: 13, cursor: 'pointer',
              }}
            >
              <Download size={14} />
              JSON
            </button>
            <button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 7,
                background: runMutation.isPending ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.35)',
                color: '#818cf8', fontSize: 13, cursor: runMutation.isPending ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              {runMutation.isPending
                ? <Loader2 size={14} className="animate-spin" />
                : <RefreshCw size={14} />}
              {runMutation.isPending ? 'Analizando…' : 'Ejecutar auditoría'}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>

        {/* Last run result */}
        {lastRun && (
          <div style={{
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <CheckCircle2 size={16} style={{ color: '#6366f1' }} />
            <span style={{ fontSize: 13, color: '#a5b4fc' }}>
              Auditoría completada en {lastRun.durationMs}ms —{' '}
              <strong>{lastRun.modulesChecked}</strong> módulos · <strong>{lastRun.findingsInserted}</strong> hallazgos registrados
              {lastRun.criticalCount > 0 && (
                <span style={{ color: '#ef4444' }}> · {lastRun.criticalCount} críticos</span>
              )}
            </span>
          </div>
        )}

        {/* Loading / error */}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#6b7280', padding: '40px 0' }}>
            <Loader2 size={20} className="animate-spin" />
            <span>Cargando estado del sistema…</span>
          </div>
        )}

        {isError && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 10, padding: 20, color: '#ef4444', fontSize: 14,
          }}>
            Error cargando el estado del sistema. Verifica que el servidor API está en marcha.
          </div>
        )}

        {data && (
          <>
            {/* Summary bar */}
            <SummaryBar summary={data.summary} />

            {/* Duplications */}
            <DuplicationsPanel />

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <Filter size={15} style={{ color: '#6b7280' }} />
              <span style={{ fontSize: 12, color: '#6b7280' }}>Área:</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {areas.map((area) => (
                  <button
                    key={area}
                    onClick={() => setFilterArea(area)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 12,
                      background: filterArea === area ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${filterArea === area ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      color: filterArea === area ? '#818cf8' : '#9ca3af',
                      cursor: 'pointer',
                    }}
                  >
                    {area === 'all' ? 'Todas las áreas' : area}
                  </button>
                ))}
              </div>

              <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>Estado:</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {statusOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 12,
                      background: filterStatus === s ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${filterStatus === s ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      color: filterStatus === s ? '#818cf8' : '#9ca3af',
                      cursor: 'pointer',
                    }}
                  >
                    {s === 'all' ? 'Todos los estados'
                      : s === 'ok' ? '🟢 Funcional'
                      : s === 'warning' ? '🟡 Incidencias'
                      : s === 'partial' ? '🟠 Parcial'
                      : s === 'critical' ? '🔴 Crítico'
                      : '⚫ Simulado'}
                  </button>
                ))}
              </div>

              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
                {filtered.length} de {data.modules.length} módulos
              </span>
            </div>

            {/* Module grid by area */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                No hay módulos que coincidan con los filtros seleccionados.
              </div>
            ) : (
              Array.from(byArea.entries()).map(([area, mods]) => (
                <AreaGroup key={area} area={area} modules={mods} />
              ))
            )}

            {/* Legend */}
            <div style={{
              marginTop: 32, padding: 16, borderRadius: 10,
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Leyenda
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {(['ok', 'warning', 'partial', 'critical', 'simulated'] as ModuleStatus[]).map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: cfg.color, display: 'flex' }}><Icon size={14} /></span>
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>
                        <strong style={{ color: cfg.color }}>{cfg.label}</strong>
                        {s === 'ok' && ' — listo para producción'}
                        {s === 'warning' && ' — funciona con riesgos conocidos'}
                        {s === 'partial' && ' — funcionalidad incompleta o duplicada'}
                        {s === 'critical' && ' — no apto para uso en producción'}
                        {s === 'simulated' && ' — sin integración real, usa simulador'}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280' }}>
                <Clock size={12} />
                <span style={{ fontSize: 11 }}>
                  Haz clic en cualquier módulo con incidencias para ver los detalles. Usa "Ejecutar auditoría" para actualizar hallazgos dinámicos desde la BD.
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
