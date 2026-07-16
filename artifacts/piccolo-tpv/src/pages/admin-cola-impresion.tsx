/**
 * admin-cola-impresion.tsx
 * Print queue monitor — /admin/cola-impresion
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import {
  ChevronLeft, Printer, RefreshCw, RotateCcw, XCircle, AlertCircle,
  CheckCircle2, Clock, Send, SkipForward
} from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';

const api = (path: string, method = 'GET', body?: unknown) =>
  customFetch(path, { method, body: body !== undefined ? JSON.stringify(body) : undefined });

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:    { label: 'Pendiente',  color: 'text-yellow-400',  icon: <Clock size={14} /> },
  sending:    { label: 'Enviando',   color: 'text-blue-400',    icon: <Send size={14} /> },
  printed:    { label: 'Impreso',    color: 'text-green-400',   icon: <CheckCircle2 size={14} /> },
  error:      { label: 'Error',      color: 'text-red-400',     icon: <AlertCircle size={14} /> },
  retrying:   { label: 'Reintentando', color: 'text-orange-400', icon: <RotateCcw size={14} /> },
  reprinted:  { label: 'Reimpreso',  color: 'text-purple-400',  icon: <SkipForward size={14} /> },
  cancelled:  { label: 'Cancelado',  color: 'text-muted-foreground', icon: <XCircle size={14} /> },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  kitchen_ticket: 'Comanda',
  added_ticket: 'Añadido',
  cancellation_ticket: 'Anulación',
  modification_ticket: 'Modificación',
  test_ticket: 'Prueba',
  prefactura: 'Prefactura',
  factura_simplificada: 'Factura simple',
  factura_completa: 'Factura',
  factura_rectificativa: 'Rectificativa',
  informe_x: 'Informe X',
  informe_z: 'Informe Z',
  reprint: 'Reimpresión',
};

interface QueueJob {
  id: string;
  printerId: string;
  printerName: string | null;
  orderId: string | null;
  documentType: string;
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  printedAt: string | null;
  actorName: string | null;
  createdAt: string;
}

function formatTs(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminColaImpresion() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [reprinting, setReprinting] = useState<string | null>(null);
  const [reprintReason, setReprintReason] = useState('');
  const [reprintJobId, setReprintJobId] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filterStatus) params.set('status', filterStatus);
      const data = await api(`/api/admin/print-queue?${params}`) as QueueJob[];
      setJobs(data);
    } catch { toast.error('Error al cargar la cola'); }
    finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5 s
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const handleRetry = async (id: string) => {
    setActioning(id);
    try {
      await api(`/api/admin/print-queue/${id}/retry`, 'POST');
      toast.success('Trabajo reencolado');
      load();
    } catch { toast.error('Error al reintentar'); }
    finally { setActioning(null); }
  };

  const handleCancel = async (id: string) => {
    setActioning(id);
    try {
      await api(`/api/admin/print-queue/${id}`, 'DELETE');
      toast.success('Trabajo cancelado');
      load();
    } catch { toast.error('Error al cancelar'); }
    finally { setActioning(null); }
  };

  const handleReprint = async () => {
    if (!reprintJobId || !reprintReason.trim()) return;
    setReprinting(reprintJobId);
    try {
      await api(`/api/admin/print-queue/${reprintJobId}/reprint`, 'POST', { reason: reprintReason.trim() });
      toast.success('Reimpresión encolada');
      setReprintJobId(null);
      setReprintReason('');
      load();
    } catch { toast.error('Error al reimprimir'); }
    finally { setReprinting(null); }
  };

  const errorCount = jobs.filter(j => j.status === 'error').length;
  const pendingCount = jobs.filter(j => ['pending', 'retrying', 'sending'].includes(j.status)).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/admin">
          <button className="p-2 rounded-xl hover:bg-secondary transition-colors"><ChevronLeft size={20} /></button>
        </Link>
        <Printer size={22} className="text-primary" />
        <h1 className="text-lg font-black">Cola de Impresión</h1>
        <div className="flex items-center gap-2 ml-auto">
          {errorCount > 0 && (
            <span className="text-xs px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full font-black">
              {errorCount} error{errorCount > 1 ? 'es' : ''}
            </span>
          )}
          {pendingCount > 0 && (
            <span className="text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full font-black">
              {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
            </span>
          )}
          <button onClick={load} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 border-b border-border flex gap-2 overflow-x-auto">
        {[{ value: '', label: 'Todos' }, ...Object.entries(STATUS_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))].map(f => (
          <button key={f.value} onClick={() => setFilterStatus(f.value)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-bold border transition-colors ${
              filterStatus === f.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Jobs list */}
      <div className="p-4 max-w-3xl mx-auto space-y-3">
        {loading && <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" /></div>}

        {!loading && jobs.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Cola vacía</p>
          </div>
        )}

        {jobs.map(job => {
          const sc = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.error;
          const docLabel = DOC_TYPE_LABELS[job.documentType] ?? job.documentType;
          return (
            <div key={job.id} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className={`flex items-center gap-1 text-xs font-bold mt-0.5 ${sc.color}`}>
                  {sc.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm">{docLabel}</span>
                    <span className={`text-xs font-bold ${sc.color}`}>{sc.label}</span>
                    {job.attempts > 0 && (
                      <span className="text-xs text-muted-foreground">{job.attempts} intento{job.attempts > 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {job.printerName ?? 'Impresora desconocida'} · {formatTs(job.createdAt)}
                    {job.actorName ? ` · ${job.actorName}` : ''}
                  </p>
                  {job.lastError && (
                    <p className="text-xs text-red-400 mt-1 font-mono bg-red-500/5 px-2 py-1 rounded-lg border border-red-500/10">
                      {job.lastError}
                    </p>
                  )}
                </div>
              </div>
              {/* Actions */}
              {['error', 'pending', 'retrying', 'printed'].includes(job.status) && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                  {['error', 'pending', 'retrying'].includes(job.status) && (
                    <>
                      <button onClick={() => handleRetry(job.id)} disabled={actioning === job.id}
                        className="text-xs px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg font-bold hover:bg-primary/20 transition-colors disabled:opacity-50">
                        <RotateCcw size={12} className="inline mr-1" />Reintentar
                      </button>
                      <button onClick={() => handleCancel(job.id)} disabled={actioning === job.id}
                        className="text-xs px-3 py-1.5 text-red-400 border border-red-500/20 rounded-lg font-bold hover:bg-red-500/10 transition-colors disabled:opacity-50">
                        <XCircle size={12} className="inline mr-1" />Cancelar
                      </button>
                    </>
                  )}
                  {job.status === 'printed' && (
                    <button onClick={() => setReprintJobId(job.id)}
                      className="text-xs px-3 py-1.5 border border-border rounded-lg font-bold hover:bg-secondary transition-colors">
                      <SkipForward size={12} className="inline mr-1" />Reimprimir
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reprint modal */}
      {reprintJobId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setReprintJobId(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-black text-lg">Reimprimir</h2>
            <p className="text-sm text-muted-foreground">Introduce el motivo de la reimpresión (obligatorio).</p>
            <input
              value={reprintReason}
              onChange={e => setReprintReason(e.target.value)}
              placeholder="Motivo…"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setReprintJobId(null)}
                className="flex-1 py-2.5 border border-border rounded-xl font-bold text-sm hover:bg-secondary">
                Cancelar
              </button>
              <button onClick={handleReprint} disabled={!reprintReason.trim() || reprinting === reprintJobId}
                className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl font-black text-sm disabled:opacity-50">
                {reprinting === reprintJobId ? 'Encolando…' : 'Reimprimir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
