/**
 * BackupPage — Copias de seguridad, programación y exportación de emergencia
 * Tabs: Historial | Crear | Programadas | Restaurar | Exportación
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft, HardDrive, Plus, Calendar, RefreshCw, Download, Eye,
  Trash2, Shield, ShieldOff, CheckCircle, XCircle, Clock, AlertTriangle,
  FileDown, Package, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../lib/api-client';

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

function fmtSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes > 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

const STATUS_STYLE: Record<string, string> = {
  valid: 'text-green-400',
  pending: 'text-yellow-400',
  corrupted: 'text-red-400',
  incomplete: 'text-orange-400',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  valid: <CheckCircle size={13} className="text-green-400" />,
  pending: <Loader2 size={13} className="text-yellow-400 animate-spin" />,
  corrupted: <XCircle size={13} className="text-red-400" />,
  incomplete: <AlertTriangle size={13} className="text-orange-400" />,
};

type Tab = 'historial' | 'crear' | 'programadas' | 'restaurar' | 'exportar';

interface BackupRecord {
  id: string; createdAt: string; createdByName: string;
  backupType: string; status: string; sizeBytes: number | null;
  verified: boolean; protected: boolean; notes: string | null;
  tablesIncluded: string[] | null; recordCounts: Record<string, number> | null;
  integrityHash: string | null;
}
interface Schedule {
  id: string; name: string; frequency: string; hour: number;
  backupType: string; retention: number; active: boolean;
  lastRunAt: string | null; nextRunAt: string | null; lastStatus: string;
}

export default function BackupPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>('historial');
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createType, setCreateType] = useState('full');
  const [createNotes, setCreateNotes] = useState('');
  const [inspecting, setInspecting] = useState<BackupRecord | null>(null);
  const [dryRunResult, setDryRunResult] = useState<Record<string, unknown> | null>(null);
  const [restoreId, setRestoreId] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [exportModules, setExportModules] = useState<string[]>(['all']);
  const [exportFormat, setExportFormat] = useState('json');

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ data: BackupRecord[] }>('/api/backup/list');
      setBackups(d.data ?? []);
    } finally { setLoading(false); }
  }, []);

  const loadSchedules = useCallback(async () => {
    setSchedules(await api.get<Schedule[]>('/api/backup/schedules'));
  }, []);

  useEffect(() => { void loadBackups(); void loadSchedules(); }, [loadBackups, loadSchedules]);

  // Poll for pending backups
  useEffect(() => {
    if (!backups.some(b => b.status === 'pending')) return;
    const t = setTimeout(() => void loadBackups(), 3000);
    return () => clearTimeout(t);
  }, [backups, loadBackups]);

  async function createBackup() {
    setCreating(true);
    try {
      await api.post('/api/backup/create', { backupType: createType, notes: createNotes });
      toast.success('Copia iniciada'); await loadBackups(); setCreateNotes('');
    } finally { setCreating(false); }
  }

  async function verifyBackup(id: string) {
    const d = await api.post<{ ok: boolean }>(`/api/backup/${id}/verify`);
    if (d.ok) toast.success('Integridad verificada ✓');
    else toast.error('Hash no coincide — copia corrupta');
    await loadBackups();
  }

  async function downloadBackup(id: string) {
    const a = document.createElement('a');
    a.href = `${BASE}/api/backup/${id}/download`;
    const r = await fetch(a.href, { credentials: 'include' });
    if (!r.ok) { toast.error('Error al descargar'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = `backup_${id.slice(0,8)}.enc`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Descarga iniciada');
  }

  async function toggleProtect(id: string, isProtected: boolean) {
    await api.patch(`/api/backup/${id}/protect`, { protect: !isProtected });
    await loadBackups();
  }

  async function deleteBackup(id: string) {
    if (!confirm('¿Eliminar esta copia? Esta acción no se puede deshacer.')) return;
    const d = await api.delete<{ ok: boolean; error?: string }>(`/api/backup/${id}`);
    if (d.ok) { toast.success('Copia eliminada'); await loadBackups(); }
    else toast.error(d.error ?? 'Error');
  }

  async function dryRun(id: string) {
    setDryRunResult(null);
    const d = await api.post<{ ok: boolean; summary?: Record<string, unknown>; error?: string }>(`/api/backup/${id}/dry-run`);
    if (d.ok) { setDryRunResult(d.summary ?? null); toast.success('Dry-run completado — ningún dato modificado'); }
    else toast.error(d.error ?? 'Error');
  }

  async function restoreBackup() {
    if (!restoreId) { toast.error('Selecciona una copia'); return; }
    if (!restoreConfirm) { toast.error('Confirma la restauración'); return; }
    const d = await api.post<{ ok: boolean; message?: string; error?: string }>(`/api/backup/${restoreId}/restore`, { confirm: true });
    if (d.ok) toast.success(d.message ?? 'Restaurado');
    else toast.error(d.error ?? 'Error');
  }

  async function emergencyExport() {
    const r = await fetch(`${BASE}/api/backup/emergency-export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ modules: exportModules, format: exportFormat }),
    });
    if (!r.ok) { toast.error('Error en exportación'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `piccolo_export_${new Date().toISOString().slice(0,10)}.${exportFormat}`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('Exportación descargada');
  }

  async function deleteSchedule(id: string) {
    await api.delete(`/api/backup/schedules/${id}`);
    await loadSchedules();
    toast.success('Programación eliminada');
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'historial', label: 'Historial', icon: <Clock size={15} /> },
    { id: 'crear', label: 'Crear copia', icon: <Plus size={15} /> },
    { id: 'programadas', label: 'Programadas', icon: <Calendar size={15} /> },
    { id: 'restaurar', label: 'Restaurar', icon: <RefreshCw size={15} /> },
    { id: 'exportar', label: 'Exportar', icon: <FileDown size={15} /> },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="h-14 shrink-0 flex items-center px-4 bg-card border-b border-border gap-3">
        <button onClick={() => setLocation('/admin')} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors">
          <ArrowLeft size={16} />
        </button>
        <HardDrive size={18} className="text-indigo-400" />
        <h1 className="font-black text-base">Copias de Seguridad</h1>
        <div className="flex-1" />
        <button onClick={() => { void api.post('/api/backup/demo-data').then(() => { void loadBackups(); toast.success('Demo cargada'); }); }}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary transition-colors">
          + Demo
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-0 shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-bold border-b-2 transition-all whitespace-nowrap ${tab === t.id ? 'bg-card border-indigo-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-card/60'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Historial ────────────────────────────────────────────── */}
        {tab === 'historial' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{backups.length} copi{backups.length !== 1 ? 'as' : 'a'}</p>
              <button onClick={loadBackups} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary transition-colors">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Actualizar
              </button>
            </div>

            {loading && backups.length === 0 && (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
            )}

            {backups.map(b => (
              <div key={b.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {STATUS_ICON[b.status]}
                      <span className="text-sm font-bold capitalize">{b.backupType}</span>
                      <span className={`text-xs font-semibold ${STATUS_STYLE[b.status] ?? 'text-muted-foreground'}`}>{b.status}</span>
                      {b.verified && <span className="text-[10px] bg-green-950/60 text-green-400 border border-green-800 px-2 py-0.5 rounded-full font-bold">✓ Verificada</span>}
                      {b.protected && <span className="text-[10px] bg-indigo-950/60 text-indigo-400 border border-indigo-800 px-2 py-0.5 rounded-full font-bold">🔒 Protegida</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{fmtDate(b.createdAt)} · {b.createdByName} · {fmtSize(b.sizeBytes)}</p>
                    {b.notes && <p className="text-xs text-muted-foreground/70 mt-0.5">{b.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {b.status === 'valid' && !b.verified && (
                      <button onClick={() => verifyBackup(b.id)} title="Verificar" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-yellow-400 hover:text-yellow-300 transition-colors">
                        <CheckCircle size={14} />
                      </button>
                    )}
                    <button onClick={() => { setInspecting(b); void dryRun(b.id); }} title="Dry-run" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      <Eye size={14} />
                    </button>
                    <button onClick={() => downloadBackup(b.id)} title="Descargar" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      <Download size={14} />
                    </button>
                    <button onClick={() => toggleProtect(b.id, b.protected)} title={b.protected ? "Desproteger" : "Proteger"} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      {b.protected ? <ShieldOff size={14} /> : <Shield size={14} />}
                    </button>
                    {!b.protected && (
                      <button onClick={() => deleteBackup(b.id)} title="Eliminar" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-950 text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {b.recordCounts && Object.keys(b.recordCounts).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(b.recordCounts).map(([table, count]) => (
                      <span key={table} className="text-[10px] bg-secondary/60 text-muted-foreground px-2 py-0.5 rounded-md">
                        {table}: {count.toLocaleString()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {!loading && backups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <HardDrive size={36} className="opacity-20" />
                <p className="text-sm font-semibold">Sin copias de seguridad</p>
                <button onClick={() => setTab('crear')} className="text-xs text-indigo-400 hover:text-indigo-300">Crear la primera copia →</button>
              </div>
            )}
          </div>
        )}

        {/* ── Crear ────────────────────────────────────────────────── */}
        {tab === 'crear' && (
          <div className="max-w-md space-y-4">
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <h3 className="font-black text-sm">Nueva copia de seguridad</h3>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  {[['full','Completa','Todos los datos'],['config','Configuración','Solo ajustes'],['incremental','Incremental','Cambios recientes'],['docs','Documentos','Facturas y docs']].map(([v,l,d]) => (
                    <button key={v} onClick={() => setCreateType(v)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${createType === v ? 'border-indigo-500 bg-indigo-950/30' : 'border-border bg-secondary/30 hover:border-border/80'}`}>
                      <p className="text-xs font-black">{l}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{d}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Notas (opcional)</label>
                <input value={createNotes} onChange={e => setCreateNotes(e.target.value)}
                  placeholder="Motivo de la copia…"
                  className="w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500/60" />
              </div>

              <button onClick={createBackup} disabled={creating}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {creating ? 'Creando…' : 'Crear copia ahora'}
              </button>
            </div>

            <div className="bg-card/50 border border-border/50 rounded-xl p-4">
              <p className="text-xs text-muted-foreground">
                Las copias se cifran con AES-256 y se verifica su integridad con SHA-256.
                Se almacenan localmente en el servidor y se pueden descargar desde el historial.
              </p>
            </div>
          </div>
        )}

        {/* ── Programadas ──────────────────────────────────────────── */}
        {tab === 'programadas' && (
          <div className="space-y-3">
            {schedules.length === 0 && (
              <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                <Calendar size={28} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">Sin programaciones activas</p>
                <p className="text-xs mt-1">Las copias programadas se gestionan desde el servidor</p>
              </div>
            )}
            {schedules.map(s => (
              <div key={s.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black">{s.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${s.active ? 'bg-green-950/40 text-green-400 border-green-800' : 'bg-secondary text-muted-foreground border-border'}`}>
                        {s.active ? 'Activa' : 'Inactiva'}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${s.lastStatus === 'ok' ? 'bg-green-950/40 text-green-400 border-green-800' : 'bg-red-950/40 text-red-400 border-red-800'}`}>
                        {s.lastStatus}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {s.frequency} · {s.backupType} · retención: {s.retention} copias · {s.hour}:00h
                    </p>
                    {s.nextRunAt && <p className="text-xs text-muted-foreground/70 mt-0.5">Próxima: {fmtDate(s.nextRunAt)}</p>}
                    {s.lastRunAt && <p className="text-xs text-muted-foreground/70">Última: {fmtDate(s.lastRunAt)}</p>}
                  </div>
                  <button onClick={() => deleteSchedule(s.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-950 text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Restaurar ────────────────────────────────────────────── */}
        {tab === 'restaurar' && (
          <div className="max-w-md space-y-4">
            <div className="bg-amber-950/20 border border-amber-700/40 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300/90 leading-relaxed">
                  La restauración sobreescribe los datos actuales. Se creará automáticamente una copia
                  del estado actual antes de restaurar. Esta acción requiere confirmación explícita.
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <h3 className="font-black text-sm">Restaurar desde copia</h3>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Seleccionar copia</label>
                <select value={restoreId} onChange={e => { setRestoreId(e.target.value); setDryRunResult(null); }}
                  className="w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-indigo-500/60">
                  <option value="">— Selecciona una copia —</option>
                  {backups.filter(b => b.status === 'valid').map(b => (
                    <option key={b.id} value={b.id}>
                      {fmtDate(b.createdAt)} · {b.backupType} · {fmtSize(b.sizeBytes)}{b.verified ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {restoreId && (
                <button onClick={() => void dryRun(restoreId)}
                  className="w-full py-2.5 border border-border rounded-xl text-sm font-bold hover:bg-secondary transition-colors flex items-center justify-center gap-2">
                  <Eye size={14} /> Vista previa (dry-run)
                </button>
              )}

              {dryRunResult && (
                <div className="bg-secondary/40 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-green-400">✓ Dry-run completado — sin cambios en producción</p>
                  <p className="text-xs text-muted-foreground">Versión: {(dryRunResult as { version?: string }).version} · {(dryRunResult as { totalRows?: number }).totalRows?.toLocaleString()} filas totales</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {((dryRunResult as { tables?: Array<{ name: string; rowCount: number }> }).tables ?? []).map((t) => (
                      <span key={t.name} className="text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-md">{t.name}: {t.rowCount}</span>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={restoreConfirm} onChange={e => setRestoreConfirm(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded" />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  Confirmo que quiero restaurar esta copia y entiendo que los datos actuales se sobreescribirán
                </span>
              </label>

              <button onClick={restoreBackup} disabled={!restoreId || !restoreConfirm}
                className="w-full py-3 bg-red-800 hover:bg-red-700 text-white font-black text-sm rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                <RefreshCw size={14} /> Restaurar copia
              </button>
            </div>
          </div>
        )}

        {/* ── Exportar ─────────────────────────────────────────────── */}
        {tab === 'exportar' && (
          <div className="max-w-md space-y-4">
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <h3 className="font-black text-sm">Exportación de emergencia</h3>
              <p className="text-xs text-muted-foreground">Exporta datos críticos sin cifrado especial para recuperación de emergencia.</p>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Módulos</label>
                <div className="grid grid-cols-2 gap-2">
                  {[['all','Todo'],['ventas','Ventas'],['caja','Caja'],['clientes','Clientes'],['empleados','Empleados'],['stock','Stock'],['reservas','Reservas'],['productos','Productos']].map(([v,l]) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox"
                        checked={exportModules.includes(v) || (v !== 'all' && exportModules.includes('all'))}
                        onChange={e => {
                          if (v === 'all') { setExportModules(e.target.checked ? ['all'] : []); return; }
                          setExportModules(prev => {
                            const without = prev.filter(x => x !== 'all' && x !== v);
                            return e.target.checked ? [...without, v] : without;
                          });
                        }}
                        className="w-4 h-4 rounded" />
                      <span className="text-xs font-semibold">{l}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Formato</label>
                <div className="flex gap-2">
                  {[['json','JSON'],['csv','CSV'],['xlsx','Excel']].map(([v,l]) => (
                    <button key={v} onClick={() => setExportFormat(v)}
                      className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all ${exportFormat === v ? 'border-indigo-500 bg-indigo-950/30' : 'border-border bg-secondary/30'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={emergencyExport}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm rounded-xl transition-colors flex items-center justify-center gap-2">
                <FileDown size={14} /> Exportar y descargar
              </button>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-black text-muted-foreground uppercase tracking-wider">Informe de soporte</h4>
              <p className="text-xs text-muted-foreground">Paquete JSON con diagnóstico técnico, sin datos personales ni credenciales.</p>
              <button onClick={async () => {
                const r = await fetch(`${BASE}/api/diagnostics/report`, { credentials: 'include' });
                if (!r.ok) { toast.error('Error'); return; }
                const blob = await r.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'piccolo_diagnostics.json'; a.click();
                URL.revokeObjectURL(url); toast.success('Informe descargado');
              }} className="w-full py-2.5 border border-border rounded-xl text-xs font-bold hover:bg-secondary transition-colors flex items-center justify-center gap-2">
                <Package size={13} /> Descargar informe de soporte
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dry-run modal */}
      {inspecting && dryRunResult && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setInspecting(null); setDryRunResult(null); }}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-black">Dry-run completado</h3>
            <p className="text-xs text-green-400 font-bold">✓ Ningún dato de producción modificado</p>
            <div className="flex flex-wrap gap-1.5">
              {((dryRunResult as { tables?: Array<{ name: string; rowCount: number }> }).tables ?? []).map(t => (
                <span key={t.name} className="text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-md">{t.name}: {t.rowCount}</span>
              ))}
            </div>
            <button onClick={() => { setInspecting(null); setDryRunResult(null); }} className="w-full py-2.5 bg-secondary rounded-xl text-sm font-bold hover:bg-secondary/80 transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
