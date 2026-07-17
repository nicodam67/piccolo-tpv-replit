/**
 * VERI*FACTU Admin Panel — Piccolo TPV
 *
 * Tabs:
 *   1. Panel     — live counters, last send, chain verification
 *   2. Registros — searchable record table with detail drawer
 *   3. Config    — system configuration form
 *   4. Declaración — responsible declaration
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  Send,
  RotateCcw,
  Ban,
  Download,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Link,
  Settings,
  FileText,
  ListFilter,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  VerifactuStatus,
  VerifactuConfig,
  VerifactuRecord,
  VerifactuChainResult,
  VerifactuDeclaracion,
  VerifactuAuditLog,
  UpdateVerifactuConfigInput,
  CancelVerifactuRecordInput,
} from '@workspace/api-client-react';

// ─── Auth guard helper ────────────────────────────────────────────────────────

function useAdminGuard() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const token = localStorage.getItem('token');
    const empStr = localStorage.getItem('employee');
    if (!token) { setLocation('/'); return; }
    try {
      const emp = JSON.parse(empStr ?? '{}');
      if (emp.role !== 'admin') setLocation('/tables');
    } catch { setLocation('/'); }
  }, [setLocation]);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const ESTADO_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  borrador:             { bg: 'rgba(130,130,145,0.15)', text: '#8282a0', label: 'Borrador' },
  validado:             { bg: 'rgba(96,130,220,0.15)',  text: '#6082dc', label: 'Validado' },
  pendiente_envio:      { bg: 'rgba(210,160,50,0.15)',  text: '#d2a032', label: 'Pendiente' },
  enviando:             { bg: 'rgba(80,160,240,0.15)',  text: '#50a0f0', label: 'Enviando…' },
  aceptado:             { bg: 'rgba(60,170,120,0.15)',  text: '#3caa78', label: 'Aceptado' },
  aceptado_con_errores: { bg: 'rgba(210,160,50,0.15)',  text: '#d2a032', label: 'Aceptado c/errores' },
  rechazado:            { bg: 'rgba(220,80,80,0.15)',   text: '#dc5050', label: 'Rechazado' },
  pendiente_reintento:  { bg: 'rgba(210,130,50,0.15)',  text: '#d28232', label: 'Reintento' },
  anulado:              { bg: 'rgba(160,130,80,0.15)',  text: '#a08250', label: 'Anulado' },
  rectificado:          { bg: 'rgba(160,100,220,0.15)', text: '#a064dc', label: 'Rectificado' },
};

function EstadoBadge({ estado }: { estado: string }) {
  const c = ESTADO_COLORS[estado] ?? { bg: 'rgba(130,130,145,0.15)', text: '#8282a0', label: estado };
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={{ background: c.bg, color: c.text }}>
      {c.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Verifactu() {
  useAdminGuard();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<'panel' | 'registros' | 'config' | 'declaracion'>('panel');

  const { data: status } = useQuery<VerifactuStatus>({
    queryKey: ['verifactu-status'],
    queryFn: () => customFetch('/api/admin/verifactu/status'),
    refetchInterval: 60000,
  });

  const entorno = status?.entorno ?? 'simulador';
  const entornoBadge = entorno === 'produccion'
    ? { color: '#3caa78', bg: 'rgba(60,170,120,0.15)', border: 'rgba(60,170,120,0.3)', label: 'AEAT — Producción' }
    : entorno === 'pruebas'
    ? { color: '#d2a032', bg: 'rgba(210,160,50,0.15)', border: 'rgba(210,160,50,0.3)', label: 'AEAT — Pruebas' }
    : { color: '#8282a0', bg: 'rgba(130,130,160,0.15)', border: 'rgba(130,130,160,0.3)', label: 'Simulador local' };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 shrink-0 flex items-center px-5 lg:px-8 bg-card border-b border-border gap-3">
        <button onClick={() => setLocation('/admin')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} />
        </button>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(96,130,220,0.15)', color: '#6082dc' }}>
          <ShieldCheck size={16} strokeWidth={2.5} />
        </div>
        <span className="font-black text-base">VERI*FACTU</span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest"
          style={{ background: entornoBadge.bg, color: entornoBadge.color, border: `1px solid ${entornoBadge.border}` }}>
          {entornoBadge.label}
        </span>
      </header>

      {/* Non-production warning banner */}
      {entorno !== 'produccion' && (
        <div className="flex items-center gap-3 px-5 lg:px-8 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300/90">
            {entorno === 'simulador'
              ? 'Modo simulador — ningún registro se envía a la AEAT. Los documentos generados no tienen validez fiscal.'
              : 'Entorno de pruebas AEAT — los registros se envían al entorno de pruebas, no al sistema oficial de producción.'}
            {' '}Para activar producción, ve a <strong>Configuración</strong> y selecciona el entorno de producción.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 px-5 lg:px-8 pt-4 border-b border-border">
        {([
          { id: 'panel', label: 'Panel', icon: ShieldCheck },
          { id: 'registros', label: 'Registros', icon: ListFilter },
          { id: 'config', label: 'Configuración', icon: Settings },
          { id: 'declaracion', label: 'Declaración', icon: FileText },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 px-5 lg:px-8 py-6 max-w-6xl w-full mx-auto">
        {tab === 'panel' && <PanelTab />}
        {tab === 'registros' && <RegistrosTab />}
        {tab === 'config' && <ConfigTab />}
        {tab === 'declaracion' && <DeclaracionTab />}
      </main>
    </div>
  );
}

// ─── Panel Tab ────────────────────────────────────────────────────────────────

function PanelTab() {
  const qc = useQueryClient();

  const { data: status, isLoading } = useQuery<VerifactuStatus>({
    queryKey: ['verifactu-status'],
    queryFn: () => customFetch('/api/admin/verifactu/status'),
    refetchInterval: 30000,
  });

  const { data: chain, isFetching: chainLoading, refetch: verifyChain } = useQuery<VerifactuChainResult>({
    queryKey: ['verifactu-chain'],
    queryFn: () => customFetch('/api/admin/verifactu/chain/verify'),
    enabled: false,
  });

  const handleVerifyChain = async () => {
    await verifyChain();
    qc.invalidateQueries({ queryKey: ['verifactu-status'] });
  };

  const entornoBadge = status?.entorno === 'simulador'
    ? { color: '#8282a0', label: 'Simulador local' }
    : status?.entorno === 'pruebas'
    ? { color: '#d2a032', label: 'AEAT — Pruebas' }
    : { color: '#3caa78', label: 'AEAT — Producción' };

  return (
    <div className="space-y-6">
      {/* Status note */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 flex gap-3">
        <AlertTriangle size={18} className="shrink-0 text-amber-400 mt-0.5" />
        <div className="text-sm text-amber-300">
          <strong>Fase 1 — Solo entorno de pruebas.</strong> No se envían datos reales a la AEAT ni se activa producción.
          Configure el NIF del emisor y el entorno en la pestaña Configuración antes de generar registros.
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 size={16} className="animate-spin" />Cargando…</div>
      ) : (
        <>
          {/* Entorno + módulo activo */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-muted-foreground">Entorno activo:</span>
            <span className="px-3 py-1 rounded-full text-sm font-bold"
              style={{ background: `${entornoBadge.color}22`, color: entornoBadge.color }}>
              {entornoBadge.label}
            </span>
            {status?.activo
              ? <span className="px-3 py-1 rounded-full text-sm font-bold bg-green-500/15 text-green-400">Módulo activo</span>
              : <span className="px-3 py-1 rounded-full text-sm font-bold bg-secondary text-muted-foreground">Módulo inactivo</span>
            }
          </div>

          {/* Counter cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total registros" value={status?.totalRegistros ?? 0} color="#6082dc" />
            <StatCard label="Aceptados" value={status?.aceptados ?? 0} color="#3caa78" />
            <StatCard label="Rechazados" value={status?.rechazados ?? 0} color="#dc5050" />
            <StatCard label="Pendientes" value={status?.pendientes ?? 0} color="#d2a032" />
          </div>

          {/* Last send info */}
          {status?.ultimoEnvio && (
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Último envío</p>
              <p className="text-sm font-semibold">{new Date(status.ultimoEnvio).toLocaleString('es-ES')}</p>
              {status.ultimoEstado && <EstadoBadge estado={status.ultimoEstado} />}
              {status.ultimoCodigo && (
                <p className="text-xs text-muted-foreground font-mono">Código: {status.ultimoCodigo}</p>
              )}
            </div>
          )}

          {/* Chain verification */}
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Link size={16} className="text-muted-foreground" />
              <span className="font-bold text-sm">Verificación de cadena</span>
            </div>
            {chain && (
              <div className={`flex items-center gap-2 text-sm font-semibold ${chain.ok ? 'text-green-400' : 'text-red-400'}`}>
                {chain.ok
                  ? <><CheckCircle2 size={16} /> Cadena íntegra — {chain.huellasVerificadas} registros verificados</>
                  : <><XCircle size={16} /> Ruptura detectada en registro {chain.errorEnRegistro}</>
                }
              </div>
            )}
            <button onClick={handleVerifyChain} disabled={chainLoading}
              className="self-start flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm font-semibold transition-colors disabled:opacity-60">
              {chainLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Verificar cadena ahora
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2"
      style={{ borderColor: `${color}33` }}>
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-3xl font-black" style={{ color }}>{value}</span>
    </div>
  );
}

// ─── Registros Tab ────────────────────────────────────────────────────────────

function RegistrosTab() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ desde: '', hasta: '', serie: '', estado: '', tipo: '', q: '' });
  const [selected, setSelected] = useState<VerifactuRecord | null>(null);
  const [cancelModal, setCancelModal] = useState<{ record: VerifactuRecord } | null>(null);
  const [cancelForm, setCancelForm] = useState({ motivo: '', autorizador: '' });

  const { data: records = [], isLoading, refetch } = useQuery<VerifactuRecord[]>({
    queryKey: ['verifactu-records', filters],
    queryFn: () => {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
      return customFetch(`/api/admin/verifactu/records?${qs}`);
    },
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => customFetch(`/api/admin/verifactu/records/${id}/send`, { method: 'POST' }),
    onSuccess: (data: VerifactuRecord) => {
      toast.success(`Registro ${data.estado === 'aceptado' ? 'aceptado' : 'enviado'}`);
      if (data.estado === 'aceptado') toast.success(`CSV: ${data.aeatCsv}`);
      qc.invalidateQueries({ queryKey: ['verifactu-records'] });
      qc.invalidateQueries({ queryKey: ['verifactu-status'] });
      setSelected(data);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => customFetch(`/api/admin/verifactu/records/${id}/retry`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Reintento ejecutado');
      qc.invalidateQueries({ queryKey: ['verifactu-records'] });
      qc.invalidateQueries({ queryKey: ['verifactu-status'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CancelVerifactuRecordInput }) =>
      customFetch(`/api/admin/verifactu/records/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast.success('Registro de anulación creado');
      setCancelModal(null);
      setCancelForm({ motivo: '', autorizador: '' });
      qc.invalidateQueries({ queryKey: ['verifactu-records'] });
      qc.invalidateQueries({ queryKey: ['verifactu-status'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadXml = (id: string, numSerie: string) => {
    const token = localStorage.getItem('token') ?? '';
    fetch(`/api/admin/verifactu/records/${id}/xml`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.blob()).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verifactu-${numSerie}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    }).catch(() => toast.error('Error al descargar XML'));
  };

  const canSend = (r: VerifactuRecord) =>
    ['validado', 'pendiente_envio', 'pendiente_reintento', 'rechazado'].includes(r.estado);

  const canCancel = (r: VerifactuRecord) =>
    r.registroTipo === 'alta' && r.estado !== 'anulado' && r.estado !== 'rectificado';

  return (
    <div className="flex gap-5 h-full">
      {/* Left panel — list */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
            placeholder="Serie/NIF…" className="col-span-2 px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <input type="date" value={filters.desde} onChange={e => setFilters(f => ({ ...f, desde: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <input type="date" value={filters.hasta} onChange={e => setFilters(f => ({ ...f, hasta: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <select value={filters.estado} onChange={e => setFilters(f => ({ ...f, estado: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filters.tipo} onChange={e => setFilters(f => ({ ...f, tipo: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
            <option value="">Todos los tipos</option>
            {['F1','F2','F3','R1','R2','R3','R4','R5'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{records.length} registros</span>
          <button onClick={() => refetch()} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <RefreshCw size={13} />Actualizar
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center"><Loader2 size={16} className="animate-spin" />Cargando…</div>
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            <ShieldCheck size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay registros VERI*FACTU todavía.</p>
            <p className="mt-1 text-xs">Los registros se generan desde cada factura emitida.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Serie</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Tipo</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Total</th>
                  <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Estado</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}
                    onClick={() => setSelected(r === selected ? null : r)}
                    className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-secondary/40 ${selected?.id === r.id ? 'bg-secondary/60' : ''}`}>
                    <td className="px-4 py-3 font-mono font-bold">{r.numSerieFactura}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.fechaExpedicion}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.tipoFactura}</td>
                    <td className="px-4 py-3 text-right font-bold">{Number(r.importeTotal).toFixed(2)} €</td>
                    <td className="px-4 py-3"><EstadoBadge estado={r.estado} /></td>
                    <td className="px-2 py-3"><ChevronRight size={14} className="text-muted-foreground" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right panel — detail */}
      {selected && (
        <div className="w-80 shrink-0 rounded-xl border border-border bg-card p-5 flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-12rem)]">
          <div className="flex items-center justify-between">
            <span className="font-black text-sm">{selected.numSerieFactura}</span>
            <EstadoBadge estado={selected.estado} />
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <dt className="text-muted-foreground">Tipo</dt><dd className="font-mono font-bold">{selected.tipoFactura}</dd>
            <dt className="text-muted-foreground">Registro</dt><dd className="capitalize">{selected.registroTipo}</dd>
            <dt className="text-muted-foreground">Fecha</dt><dd>{selected.fechaExpedicion}</dd>
            <dt className="text-muted-foreground">Base imp.</dt><dd>{Number(selected.baseImponible).toFixed(2)} €</dd>
            <dt className="text-muted-foreground">IVA</dt><dd>{Number(selected.tipoIva).toFixed(0)}% → {Number(selected.cuotaIva).toFixed(2)} €</dd>
            <dt className="text-muted-foreground">Total</dt><dd className="font-black">{Number(selected.importeTotal).toFixed(2)} €</dd>
            <dt className="text-muted-foreground">Entorno</dt><dd className="capitalize">{selected.entornoEnvio}</dd>
            <dt className="text-muted-foreground">Reintentos</dt><dd>{selected.reintentos}</dd>
          </dl>

          {/* Huella */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Huella SHA-256</p>
            <p className="font-mono text-[10px] break-all text-primary">{selected.huella}</p>
          </div>
          {selected.huellaAnterior && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Huella anterior</p>
              <p className="font-mono text-[10px] break-all text-muted-foreground">{selected.huellaAnterior}</p>
            </div>
          )}

          {/* QR content */}
          {selected.qrContent && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Contenido QR fiscal</p>
              <p className="text-[10px] break-all text-muted-foreground">{selected.qrContent}</p>
            </div>
          )}

          {/* AEAT response */}
          {selected.aeatCodigo && (
            <div className="rounded-lg bg-secondary p-3 text-xs">
              <p className="font-bold mb-1">Respuesta AEAT</p>
              <p><span className="text-muted-foreground">Código:</span> {selected.aeatCodigo}</p>
              <p><span className="text-muted-foreground">Descripción:</span> {selected.aeatDescripcion}</p>
              {selected.aeatCsv && <p><span className="text-muted-foreground">CSV:</span> <span className="font-mono">{selected.aeatCsv}</span></p>}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            {canSend(selected) && (
              <button onClick={() => sendMutation.mutate(selected.id)} disabled={sendMutation.isPending}
                className="flex items-center gap-2 justify-center px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60">
                {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Enviar al {selected.entornoEnvio}
              </button>
            )}
            {selected.estado === 'rechazado' && (
              <button onClick={() => retryMutation.mutate(selected.id)} disabled={retryMutation.isPending}
                className="flex items-center gap-2 justify-center px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors disabled:opacity-60">
                {retryMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                Reintentar
              </button>
            )}
            {canCancel(selected) && (
              <button onClick={() => setCancelModal({ record: selected })}
                className="flex items-center gap-2 justify-center px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors">
                <Ban size={14} />Anular registro
              </button>
            )}
            <button onClick={() => downloadXml(selected.id, selected.numSerieFactura)}
              className="flex items-center gap-2 justify-center px-3 py-2 rounded-lg bg-secondary text-muted-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors">
              <Download size={14} />Descargar XML
            </button>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-2 text-destructive">
              <Ban size={18} />
              <h2 className="font-black text-lg">Anular registro</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Se creará un <strong>registro de anulación</strong> vinculado a <strong>{cancelModal.record.numSerieFactura}</strong>.
              El original no se borra; se marca como anulado.
            </p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">Motivo de anulación *</label>
                <textarea value={cancelForm.motivo} onChange={e => setCancelForm(f => ({ ...f, motivo: e.target.value }))}
                  rows={3} placeholder="Describa el motivo…"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">Autorizador *</label>
                <input value={cancelForm.autorizador} onChange={e => setCancelForm(f => ({ ...f, autorizador: e.target.value }))}
                  placeholder="Nombre del responsable que autoriza"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setCancelModal(null); setCancelForm({ motivo: '', autorizador: '' }); }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-secondary text-sm font-semibold hover:bg-secondary/80 transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => cancelMutation.mutate({ id: cancelModal.record.id, body: cancelForm })}
                disabled={!cancelForm.motivo || !cancelForm.autorizador || cancelMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 disabled:opacity-60 transition-colors">
                {cancelMutation.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Confirmar anulación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Config Tab ───────────────────────────────────────────────────────────────

function ConfigTab() {
  const qc = useQueryClient();
  const { data: config } = useQuery<VerifactuConfig>({
    queryKey: ['verifactu-config'],
    queryFn: () => customFetch('/api/admin/verifactu/config'),
  });

  const [form, setForm] = useState<UpdateVerifactuConfigInput>({});
  const [dirty, setDirty] = useState(false);
  const [showProdDialog, setShowProdDialog] = useState(false);
  const [prodConfirmText, setProdConfirmText] = useState('');

  useEffect(() => {
    if (config) {
      setForm({
        emisorNif: config.emisorNif,
        emisorNombre: config.emisorNombre,
        idSistemaInformatico: config.idSistemaInformatico,
        nombreSistemaInformatico: config.nombreSistemaInformatico,
        versionSistema: config.versionSistema,
        numeroInstalacion: config.numeroInstalacion,
        entorno: config.entorno,
        endpointPruebas: config.endpointPruebas,
        endpointProduccion: config.endpointProduccion,
        certificadoPath: config.certificadoPath,
        autoRetry: config.autoRetry,
        maxReintentos: config.maxReintentos,
        retryIntervalMinutes: config.retryIntervalMinutes,
        activo: config.activo,
      });
      setDirty(false);
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: (body: UpdateVerifactuConfigInput) =>
      customFetch('/api/admin/verifactu/config', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast.success('Configuración guardada');
      qc.invalidateQueries({ queryKey: ['verifactu-config'] });
      qc.invalidateQueries({ queryKey: ['verifactu-status'] });
      setDirty(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof UpdateVerifactuConfigInput, v: unknown) => {
    if (k === 'entorno' && v === 'produccion') {
      // Show confirmation dialog — don't set immediately
      setShowProdDialog(true);
      return;
    }
    setForm(f => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const confirmProduccion = () => {
    if (prodConfirmText.trim().toLowerCase() !== 'produccion') return;
    setForm(f => ({ ...f, entorno: 'produccion' }));
    setDirty(true);
    setShowProdDialog(false);
    setProdConfirmText('');
    toast.warning('Entorno cambiado a PRODUCCIÓN. Guarda la configuración para aplicar el cambio.');
  };

  if (!config) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 size={16} className="animate-spin" />Cargando…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-black text-sm uppercase tracking-wide text-muted-foreground">Datos del emisor</h2>
        <FormField label="NIF del emisor *">
          <input value={form.emisorNif ?? ''} onChange={e => set('emisorNif', e.target.value)}
            placeholder="B12345678" className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </FormField>
        <FormField label="Nombre o razón social *">
          <input value={form.emisorNombre ?? ''} onChange={e => set('emisorNombre', e.target.value)}
            placeholder="Restaurante Piccolo SL" className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </FormField>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-black text-sm uppercase tracking-wide text-muted-foreground">Identificación del sistema</h2>
        <FormField label="ID Sistema informático">
          <input value={form.idSistemaInformatico ?? ''} onChange={e => set('idSistemaInformatico', e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </FormField>
        <FormField label="Nombre del sistema">
          <input value={form.nombreSistemaInformatico ?? ''} onChange={e => set('nombreSistemaInformatico', e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Versión">
            <input value={form.versionSistema ?? ''} onChange={e => set('versionSistema', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </FormField>
          <FormField label="Número de instalación">
            <input value={form.numeroInstalacion ?? ''} onChange={e => set('numeroInstalacion', e.target.value)}
              placeholder="INST-001" className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </FormField>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-black text-sm uppercase tracking-wide text-muted-foreground">Entorno</h2>
        <FormField label="Entorno activo">
          <select value={form.entorno ?? 'simulador'} onChange={e => set('entorno', e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
            <option value="simulador">Simulador local (sin envíos reales)</option>
            <option value="pruebas">AEAT — Entorno de pruebas (requiere certificado)</option>
            <option value="produccion">AEAT — Producción (requiere confirmación)</option>
          </select>
          {form.entorno === 'produccion' && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertTriangle size={13} className="text-red-400 shrink-0" />
              <p className="text-[11px] text-red-300/90">
                Entorno de <strong>PRODUCCIÓN</strong> activo. Los registros enviados tendrán validez fiscal real ante la AEAT.
              </p>
            </div>
          )}
        </FormField>

        {/* Confirmation for producción mode */}
        {showProdDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-red-500/40 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/15">
                  <AlertTriangle size={20} className="text-red-400" />
                </div>
                <div>
                  <h3 className="font-black text-base text-red-300">Cambiar a Producción</h3>
                  <p className="text-xs text-muted-foreground">Esta acción tiene efectos fiscales reales</p>
                </div>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Al activar el entorno de <strong className="text-foreground">producción</strong>:</p>
                <ul className="space-y-1 pl-4 text-xs">
                  <li>• Los registros se enviarán al sistema oficial de la AEAT con validez legal.</li>
                  <li>• Los registros en modo simulador / pruebas <strong className="text-foreground">no pueden reenviarse</strong> como producción.</li>
                  <li>• Necesitas un certificado digital válido configurado en la ruta indicada.</li>
                  <li>• Este cambio queda registrado en el log de auditoría.</li>
                </ul>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Escribe <code className="font-mono bg-secondary px-1 rounded text-foreground">produccion</code> para confirmar:</p>
                <input
                  value={prodConfirmText}
                  onChange={e => setProdConfirmText(e.target.value)}
                  placeholder="produccion"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button
                  onClick={() => { setShowProdDialog(false); setProdConfirmText(''); }}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmProduccion}
                  disabled={prodConfirmText.trim().toLowerCase() !== 'produccion'}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Activar Producción
                </button>
              </div>
            </div>
          </div>
        )}
        {form.entorno === 'pruebas' && (
          <>
            <FormField label="Endpoint pruebas AEAT">
              <input value={form.endpointPruebas ?? ''} onChange={e => set('endpointPruebas', e.target.value)}
                className="field font-mono text-xs" />
            </FormField>
            <FormField label="Ruta del certificado (.pfx / .p12)">
              <input value={form.certificadoPath ?? ''} onChange={e => set('certificadoPath', e.target.value)}
                placeholder="/ruta/al/certificado.pfx" className="field font-mono text-xs" />
            </FormField>
            <FormField label="Contraseña del certificado">
              <input type="password" onChange={e => set('certificadoPassword', e.target.value)}
                placeholder="••••••••" className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <p className="text-[10px] text-muted-foreground mt-1">La contraseña se almacena cifrada (AES-256-GCM). Nunca en texto plano ni en el repositorio.</p>
            </FormField>
          </>
        )}
        <FormField label="Módulo activo">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.activo ?? false} onChange={e => set('activo', e.target.checked)}
              className="w-4 h-4 accent-primary" />
            <span className="text-sm">Activar módulo VERI*FACTU</span>
          </label>
        </FormField>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-black text-sm uppercase tracking-wide text-muted-foreground">Reintentos automáticos</h2>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Máx. reintentos">
            <input type="number" min={0} max={10} value={form.maxReintentos ?? 3}
              onChange={e => set('maxReintentos', Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </FormField>
          <FormField label="Intervalo (minutos)">
            <input type="number" min={1} max={1440} value={form.retryIntervalMinutes ?? 30}
              onChange={e => set('retryIntervalMinutes', Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </FormField>
        </div>
        <FormField label="">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.autoRetry ?? true} onChange={e => set('autoRetry', e.target.checked)}
              className="w-4 h-4 accent-primary" />
            <span className="text-sm">Reintento automático</span>
          </label>
        </FormField>
      </div>

      <button onClick={() => updateMutation.mutate(form)} disabled={!dirty || updateMutation.isPending}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors disabled:opacity-60">
        {updateMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
        Guardar configuración
      </button>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-semibold text-muted-foreground">{label}</label>}
      {children}
    </div>
  );
}

// ─── Declaración Tab ──────────────────────────────────────────────────────────

function DeclaracionTab() {
  const { data: decl, isLoading } = useQuery<VerifactuDeclaracion>({
    queryKey: ['verifactu-declaracion'],
    queryFn: () => customFetch('/api/admin/verifactu/declaracion'),
  });

  const { data: auditLog = [] } = useQuery<VerifactuAuditLog[]>({
    queryKey: ['verifactu-audit'],
    queryFn: () => customFetch('/api/admin/verifactu/audit?limit=20'),
  });

  const downloadDeclaracion = () => {
    if (!decl) return;
    const content = `DECLARACIÓN RESPONSABLE — ${decl.nombreSoftware} v${decl.versionSoftware}
Fecha: ${decl.fechaDeclaracion}

Productor: Piccolo TPV
ID Sistema Informático: ${decl.idSistemaInformatico}
Número de Instalación: ${decl.numeroInstalacion}
Versión: ${decl.versionSoftware}
Modalidad: ${decl.modalidad}

FUNCIONALIDADES FISCALES INCLUIDAS:
${decl.funcionalidadesFiscales.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}

AVISO:
${decl.aviso}
`;
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `declaracion-verifactu-${decl.fechaDeclaracion}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 size={16} className="animate-spin" />Cargando…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      {decl && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-base">Declaración Responsable</h2>
            <button onClick={downloadDeclaracion}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-sm font-semibold hover:bg-secondary/80 transition-colors">
              <Download size={14} />Descargar
            </button>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground font-semibold">Software</dt>
            <dd>{decl.nombreSoftware}</dd>
            <dt className="text-muted-foreground font-semibold">Versión</dt>
            <dd className="font-mono">{decl.versionSoftware}</dd>
            <dt className="text-muted-foreground font-semibold">ID Sistema</dt>
            <dd className="font-mono">{decl.idSistemaInformatico}</dd>
            <dt className="text-muted-foreground font-semibold">Instalación</dt>
            <dd className="font-mono">{decl.numeroInstalacion || '—'}</dd>
            <dt className="text-muted-foreground font-semibold">Modalidad</dt>
            <dd>{decl.modalidad}</dd>
            <dt className="text-muted-foreground font-semibold">Fecha</dt>
            <dd>{decl.fechaDeclaracion}</dd>
          </dl>

          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Funcionalidades fiscales</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              {decl.funcionalidadesFiscales.map((f, i) => <li key={i}>{f}</li>)}
            </ol>
          </div>

          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 text-sm text-amber-300">
            <strong>Aviso:</strong> {decl.aviso}
          </div>
        </div>
      )}

      {/* Audit log */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h2 className="font-black text-sm uppercase tracking-wide text-muted-foreground">Auditoría reciente</h2>
        {auditLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin registros de auditoría todavía.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {auditLog.map(log => (
              <div key={log.id} className="flex items-start gap-3 text-xs py-2 border-b border-border/50 last:border-0">
                <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${log.resultado === 'ok' ? 'bg-green-400' : 'bg-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{log.accion}</span>
                    {log.empleadoNombre && <span className="text-muted-foreground">— {log.empleadoNombre}</span>}
                  </div>
                  {log.detalles && <p className="text-muted-foreground truncate">{log.detalles}</p>}
                  <p className="text-muted-foreground/60">{new Date(log.createdAt).toLocaleString('es-ES')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
