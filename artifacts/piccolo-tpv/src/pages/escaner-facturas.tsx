import { useState, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import {
  Upload, FileText, AlertTriangle, CheckCircle2, Clock, XCircle,
  Eye, Search, Filter, ChevronRight, RefreshCw, AlertCircle,
  Copy, Ban, Loader2, FileImage, FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Status badge config ──────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  uploaded:        { label: 'Subido',               color: 'bg-blue-500/15 text-blue-400',    icon: Upload },
  processing:      { label: 'Procesando',           color: 'bg-yellow-500/15 text-yellow-400', icon: Loader2 },
  pending_review:  { label: 'Pendiente revisión',   color: 'bg-orange-500/15 text-orange-400', icon: AlertTriangle },
  reviewed:        { label: 'Revisado',             color: 'bg-teal-500/15 text-teal-400',    icon: Eye },
  reconciled:      { label: 'Conciliado',           color: 'bg-green-500/15 text-green-400',  icon: CheckCircle2 },
  with_differences:{ label: 'Con diferencias',      color: 'bg-amber-500/15 text-amber-400',  icon: AlertCircle },
  confirmed:       { label: 'Confirmado',           color: 'bg-green-700/20 text-green-300',  icon: CheckCircle2 },
  duplicate:       { label: 'Duplicado',            color: 'bg-purple-500/15 text-purple-400', icon: Copy },
  rejected:        { label: 'Rechazado',            color: 'bg-red-500/15 text-red-400',      icon: Ban },
  error:           { label: 'Error de lectura',     color: 'bg-red-700/20 text-red-400',      icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-zinc-500/15 text-zinc-400', icon: FileText };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon size={11} className={status === 'processing' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  );
}

function ConfidencePill({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 85 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`text-xs font-mono ${color}`}>{pct}%</span>;
}

// ─── Drop zone ────────────────────────────────────────────────────────────────
function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(f.type)
    );
    if (files.length) onFiles(files);
    else toast.error('Solo se aceptan PDF, JPG, PNG o WEBP');
  }, [onFiles]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-12 cursor-pointer transition-all
        ${drag ? 'border-blue-400 bg-blue-500/10 scale-[1.01]' : 'border-zinc-700 bg-zinc-900/40 hover:border-zinc-500 hover:bg-zinc-800/30'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        multiple
        className="hidden"
        onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) onFiles(f); e.target.value = ''; }}
      />
      <div className="rounded-2xl bg-blue-500/10 p-4">
        <Upload size={32} className="text-blue-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-white">Arrastra facturas aquí o haz clic para seleccionar</p>
        <p className="mt-1 text-xs text-zinc-500">PDF, JPG, PNG, WEBP · máx. 20 MB por archivo</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EscanerFacturas() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState<string[]>([]); // filenames being uploaded

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['invoice-scanner', statusFilter],
    queryFn: () => customFetch(`/api/admin/invoice-scanner${statusFilter ? `?status=${statusFilter}` : ''}`),
    refetchInterval: uploading.length > 0 ? 3000 : false,
  });

  const processMutation = useMutation({
    mutationFn: (docId: string) =>
      customFetch(`/api/admin/invoice-scanner/${docId}/process`, { method: 'POST' }),
    onSuccess: (_, docId) => {
      qc.invalidateQueries({ queryKey: ['invoice-scanner'] });
      toast.success('Extracción completada — revisa los datos');
      navigate(`/admin/revision-factura/${docId}`);
    },
    onError: (e: any) => toast.error(e?.data?.message ?? 'Error al procesar'),
  });

  async function handleFiles(files: File[]) {
    for (const file of files) {
      setUploading((prev) => [...prev, file.name]);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const doc = await customFetch('/api/admin/invoice-scanner/upload', { method: 'POST', body: fd });
        qc.invalidateQueries({ queryKey: ['invoice-scanner'] });
        toast.success(`"${file.name}" subido`);
        // Auto-process
        processMutation.mutate(doc.id);
      } catch (e: any) {
        if (e?.data?.error === 'duplicate_file') {
          toast.error(`Archivo duplicado: "${file.name}" ya existe`);
        } else {
          toast.error(`Error al subir "${file.name}": ${e?.data?.message ?? e?.message ?? 'desconocido'}`);
        }
      } finally {
        setUploading((prev) => prev.filter((n) => n !== file.name));
      }
    }
  }

  const filtered = (documents as any[]).filter((d) =>
    !search || d.originalFilename?.toLowerCase().includes(search.toLowerCase()) ||
    d.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
    d.supplierName?.toLowerCase().includes(search.toLowerCase())
  );

  const statuses = ['', 'uploaded', 'processing', 'pending_review', 'reviewed', 'confirmed', 'with_differences', 'duplicate', 'rejected', 'error'];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/60 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Escáner de facturas</h1>
            <p className="text-xs text-zinc-500 mt-0.5">Sube PDFs o fotos · extracción automática · revisión y conciliación</p>
          </div>
          <button onClick={() => navigate('/admin')} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 transition-colors">
            ← Volver
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* Upload zone */}
        <DropZone onFiles={handleFiles} />

        {/* Uploading progress */}
        {uploading.length > 0 && (
          <div className="rounded-xl border border-blue-800/40 bg-blue-900/20 p-4 space-y-2">
            {uploading.map((name) => (
              <div key={name} className="flex items-center gap-3 text-sm">
                <Loader2 size={14} className="animate-spin text-blue-400 shrink-0" />
                <span className="text-blue-300 truncate">{name}</span>
                <span className="text-zinc-500 text-xs ml-auto">Subiendo y procesando…</span>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-52">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, factura, proveedor…"
              className="w-full rounded-lg bg-zinc-800 pl-8 pr-4 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-zinc-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s ? (STATUS_CONFIG[s]?.label ?? s) : 'Todos los estados'}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['invoice-scanner'] })}
            className="rounded-lg bg-zinc-800 p-2 hover:bg-zinc-700 transition-colors"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Document list */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-zinc-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-16 text-center">
            <FileSpreadsheet size={40} className="mx-auto text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">No hay facturas{statusFilter ? ` con estado "${STATUS_CONFIG[statusFilter]?.label}"` : ''}. Sube una para empezar.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-900/60">
                <tr>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Documento</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Factura nº</th>
                  <th className="px-4 py-3 text-right text-xs text-zinc-500 font-medium">Total</th>
                  <th className="px-4 py-3 text-center text-xs text-zinc-500 font-medium">Conf.</th>
                  <th className="px-4 py-3 text-center text-xs text-zinc-500 font-medium">Estado</th>
                  <th className="px-4 py-3 text-center text-xs text-zinc-500 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filtered.map((doc: any) => {
                  const FileIcon = doc.mimeType === 'application/pdf' ? FileText : FileImage;
                  return (
                    <tr key={doc.id} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileIcon size={16} className="text-zinc-500 shrink-0" />
                          <div>
                            <p className="font-medium text-white truncate max-w-48">{doc.originalFilename}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              {doc.invoiceDate ?? '—'} · {(doc.fileSize / 1024).toFixed(0)} KB
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{doc.supplierName ?? <span className="text-zinc-600 italic">Sin asignar</span>}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-300">{doc.invoiceNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {doc.total ? `${parseFloat(doc.total).toFixed(2)} €` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {doc.overallConfidence
                          ? <ConfidencePill score={parseFloat(doc.overallConfidence)} />
                          : <span className="text-zinc-700">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={doc.status} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {doc.status === 'uploaded' ? (
                          <button
                            onClick={() => processMutation.mutate(doc.id)}
                            disabled={processMutation.isPending}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
                          >
                            Procesar
                          </button>
                        ) : doc.status === 'processing' ? (
                          <span className="text-xs text-zinc-500 flex items-center gap-1 justify-center">
                            <Loader2 size={12} className="animate-spin" /> Procesando
                          </span>
                        ) : (
                          <button
                            onClick={() => navigate(`/admin/revision-factura/${doc.id}`)}
                            className="inline-flex items-center gap-1 rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-600 transition-colors"
                          >
                            Revisar <ChevronRight size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
