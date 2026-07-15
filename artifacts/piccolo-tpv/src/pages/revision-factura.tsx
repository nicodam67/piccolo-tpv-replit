import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import {
  CheckCircle2, AlertTriangle, AlertCircle, Edit3, Save, X,
  ChevronRight, Link2, Package, Loader2, ShieldAlert, RefreshCw,
  ArrowLeft, Eye, FileText,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Confidence indicator ─────────────────────────────────────────────────────
function ConfBadge({ confidence }: { confidence: string | number | null }) {
  const c = parseFloat(String(confidence ?? 0));
  const level = c >= 0.85 ? 'high' : c >= 0.60 ? 'medium' : 'low';
  const colors = { high: 'border-green-700 text-green-400', medium: 'border-yellow-700 text-yellow-400', low: 'border-red-700 text-red-400 animate-pulse' };
  const icons = { high: <CheckCircle2 size={10} />, medium: <AlertTriangle size={10} />, low: <AlertCircle size={10} /> };
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono ${colors[level]}`}>
      {icons[level]} {Math.round(c * 100)}%
    </span>
  );
}

// ─── Editable field ───────────────────────────────────────────────────────────
function EditableField({
  label, value, confidence, status, onChange, type = 'text',
}: {
  label: string; value: string | null; confidence: string | null; status: string | null;
  onChange: (v: string) => void; type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const isLow = parseFloat(confidence ?? '1') < 0.60;

  return (
    <div className={`rounded-lg border p-3 ${isLow ? 'border-red-800/60 bg-red-900/10' : 'border-zinc-800 bg-zinc-900/40'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-zinc-500 font-medium">{label}</span>
        <div className="flex items-center gap-1.5">
          {confidence && <ConfBadge confidence={confidence} />}
          {status === 'corrected' && (
            <span className="text-[10px] text-blue-400 bg-blue-900/30 border border-blue-800/40 rounded px-1.5 py-0.5">editado</span>
          )}
        </div>
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className="flex-1 rounded bg-zinc-800 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button onClick={() => { onChange(draft); setEditing(false); }} className="rounded bg-blue-600 p-1 hover:bg-blue-500">
            <Save size={13} />
          </button>
          <button onClick={() => { setDraft(value ?? ''); setEditing(false); }} className="rounded bg-zinc-700 p-1 hover:bg-zinc-600">
            <X size={13} />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between group">
          <span className={`text-sm ${value ? 'text-white' : 'text-zinc-600 italic'}`}>{value || 'No detectado'}</span>
          <button
            onClick={() => { setDraft(value ?? ''); setEditing(true); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 hover:bg-zinc-700"
          >
            <Edit3 size={13} className="text-zinc-400" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── VAT breakdown ────────────────────────────────────────────────────────────
function VatTable({ vatBreakdown }: { vatBreakdown: any[] }) {
  if (!vatBreakdown?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-zinc-900/60">
          <tr>
            <th className="px-3 py-2 text-left text-zinc-500 font-medium">Tipo IVA</th>
            <th className="px-3 py-2 text-right text-zinc-500 font-medium">Base</th>
            <th className="px-3 py-2 text-right text-zinc-500 font-medium">Cuota</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {vatBreakdown.map((v: any, i: number) => (
            <tr key={i}>
              <td className="px-3 py-2 font-mono">{(v.rate * 100).toFixed(0)}%</td>
              <td className="px-3 py-2 text-right font-mono">{parseFloat(v.base).toFixed(2)} €</td>
              <td className="px-3 py-2 text-right font-mono">{parseFloat(v.amount).toFixed(2)} €</td>
            </tr>
          ))}
          <tr className="bg-zinc-900/40 font-medium">
            <td className="px-3 py-2 text-zinc-400">Total IVA</td>
            <td className="px-3 py-2 text-right font-mono">
              {vatBreakdown.reduce((s: number, v: any) => s + parseFloat(v.base), 0).toFixed(2)} €
            </td>
            <td className="px-3 py-2 text-right font-mono">
              {vatBreakdown.reduce((s: number, v: any) => s + parseFloat(v.amount), 0).toFixed(2)} €
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Line item row ────────────────────────────────────────────────────────────
function LineRow({
  line, ingredients, mappings, onUpdate,
}: {
  line: any;
  ingredients: any[];
  mappings: any[];
  onUpdate: (patch: Partial<any>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const confidence = parseFloat(line.confidence ?? '1');
  const isLow = confidence < 0.60;
  const isRejected = line.isRejected;

  const suggestion = mappings.find(
    (m) => m.supplierText?.toLowerCase() === line.description?.toLowerCase() ||
      m.supplierRef === line.supplierRef
  );

  return (
    <div className={`rounded-lg border transition-all ${isRejected ? 'opacity-40 border-zinc-800/40 bg-zinc-900/20' : isLow ? 'border-red-800/40 bg-red-900/10' : 'border-zinc-800 bg-zinc-900/40'}`}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-zinc-500">#{line.lineNumber}</span>
            <span className={`text-sm font-medium truncate ${isRejected ? 'line-through text-zinc-600' : 'text-white'}`}>
              {line.description ?? '—'}
            </span>
            {line.supplierRef && <span className="text-xs font-mono text-zinc-500 shrink-0">[{line.supplierRef}]</span>}
            {line.status === 'corrected' && <span className="text-[10px] text-blue-400 border border-blue-800/40 rounded px-1">editado</span>}
            {suggestion && !line.ingredientId && (
              <span className="text-[10px] text-teal-400 border border-teal-800/40 rounded px-1">sugerido</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
            <span>{parseFloat(line.quantity ?? '0').toFixed(2)} {line.unit}</span>
            <span>×</span>
            <span>{parseFloat(line.unitPrice ?? '0').toFixed(4)} €</span>
            {parseFloat(line.discount ?? '0') > 0 && <span>-{(parseFloat(line.discount) * 100).toFixed(0)}%</span>}
            <span className="font-medium text-zinc-300">{parseFloat(line.lineTotal ?? '0').toFixed(2)} €</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ConfBadge confidence={line.confidence} />
          {line.ingredientId ? (
            <span className="text-xs text-green-400 bg-green-900/20 border border-green-800/30 rounded px-2 py-0.5">
              <Package size={10} className="inline mr-1" />
              {line.ingredientName ?? 'vinculado'}
            </span>
          ) : (
            <span className="text-xs text-zinc-500 bg-zinc-800/40 border border-zinc-700/30 rounded px-2 py-0.5">sin vincular</span>
          )}
          <ChevronRight size={14} className={`text-zinc-600 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800/60 p-3 space-y-3">
          {/* Numeric corrections */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['quantity', 'unitPrice', 'discount', 'vatRate'] as const).map((field) => (
              <div key={field}>
                <label className="block text-xs text-zinc-500 mb-1">
                  {{ quantity: 'Cantidad', unitPrice: 'P.Unit.', discount: 'Dto. (0-1)', vatRate: 'IVA (0-1)' }[field]}
                </label>
                <input
                  type="number"
                  step="0.0001"
                  defaultValue={parseFloat(line[field] ?? '0')}
                  onBlur={(e) => onUpdate({ [field]: e.target.value })}
                  className="w-full rounded bg-zinc-800 px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          {/* Ingredient mapping */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Vincular con ingrediente interno</label>
            <div className="flex gap-2">
              <select
                value={line.ingredientId ?? ''}
                onChange={(e) => onUpdate({ ingredientId: e.target.value || null, mappingConfirmed: !!e.target.value })}
                className="flex-1 rounded bg-zinc-800 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">— Sin vincular —</option>
                {suggestion && (
                  <option value={suggestion.ingredientId ?? ''}>
                    ⭐ {ingredients.find((i) => i.id === suggestion.ingredientId)?.name ?? suggestion.ingredientId} (sugerido)
                  </option>
                )}
                {ingredients.map((ing: any) => (
                  <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                ))}
              </select>
              <input
                type="number"
                step="0.000001"
                placeholder="Factor conv."
                defaultValue={line.conversionFactor ? parseFloat(line.conversionFactor) : 1}
                onBlur={(e) => onUpdate({ conversionFactor: e.target.value })}
                title="Factor de conversión (ej: 1 caja = 6 ud → 6)"
                className="w-24 rounded bg-zinc-800 px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <input
              type="text"
              placeholder="Nota de conversión (ej: 1 caja = 6 unidades)"
              defaultValue={line.conversionNote ?? ''}
              onBlur={(e) => onUpdate({ conversionNote: e.target.value })}
              className="mt-1.5 w-full rounded bg-zinc-800 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Reject / restore */}
          <div className="flex justify-end">
            <button
              onClick={() => onUpdate({ isRejected: !isRejected })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${isRejected ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-red-900/40 text-red-400 hover:bg-red-900/60'}`}
            >
              {isRejected ? 'Restaurar línea' : 'Eliminar línea'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function RevisionFactura() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [headerEdits, setHeaderEdits] = useState<Record<string, string>>({});
  const [lineEdits, setLineEdits] = useState<Record<string, Record<string, any>>>({});
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierCandidates, setSupplierCandidates] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoice-scanner-detail', id],
    queryFn: () => customFetch(`/api/admin/invoice-scanner/${id}`),
    enabled: !!id,
  });

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => customFetch('/api/admin/ingredients'),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const lineUpdates = Object.entries(lineEdits).map(([lineId, patch]) => ({ id: lineId, ...patch }));
      return customFetch(`/api/admin/invoice-scanner/${id}/extraction`, {
        method: 'PATCH',
        body: JSON.stringify({
          header: headerEdits,
          lines: lineUpdates,
          supplierId: selectedSupplierId,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-scanner-detail', id] });
      qc.invalidateQueries({ queryKey: ['invoice-scanner'] });
      toast.success('Correcciones guardadas');
      setHeaderEdits({});
      setLineEdits({});
    },
    onError: (e: any) => toast.error(e?.data?.message ?? 'Error al guardar'),
  });

  const confirmMutation = useMutation({
    mutationFn: (overrideDuplicate = false) =>
      customFetch(`/api/admin/invoice-scanner/${id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ overrideDuplicate }),
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['invoice-scanner'] });
      toast.success('Factura confirmada y creada en el sistema');
      navigate(`/admin/facturas-proveedor`);
    },
    onError: (e: any) => {
      if (e?.data?.error === 'duplicate_detected') {
        if (window.confirm('⚠️ Posible factura duplicada detectada. ¿Confirmar igualmente?')) {
          confirmMutation.mutate(true);
        }
      } else {
        toast.error(e?.data?.message ?? 'Error al confirmar');
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      customFetch(`/api/admin/invoice-scanner/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-scanner'] });
      toast.success('Factura rechazada');
      navigate('/admin/escaner-facturas');
    },
  });

  async function searchSuppliers(q: string) {
    setSupplierSearch(q);
    if (q.length < 2) { setSupplierCandidates([]); return; }
    const results = await customFetch(`/api/admin/invoice-scanner/suppliers/candidates?q=${encodeURIComponent(q)}`);
    setSupplierCandidates(results as any[]);
  }

  if (isLoading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-zinc-500" size={32} />
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Documento no encontrado</p>
    </div>
  );

  const { document: doc, extraction, lines, supplier, mappings, validation } = data as any;
  const vatBreakdown = extraction?.vatBreakdown ?? [];
  const hasEdits = Object.keys(headerEdits).length > 0 || Object.keys(lineEdits).length > 0 || selectedSupplierId;

  function patchHeader(field: string, value: string) {
    setHeaderEdits((prev) => ({ ...prev, [field]: value }));
  }

  function patchLine(lineId: string, patch: Record<string, any>) {
    setLineEdits((prev) => ({ ...prev, [lineId]: { ...(prev[lineId] ?? {}), ...patch } }));
  }

  function getHeaderValue(field: string, extractionField: string | null) {
    return headerEdits[field] !== undefined ? headerEdits[field] : extractionField;
  }

  const canConfirm = ['pending_review', 'reviewed', 'with_differences', 'duplicate'].includes(doc.status);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate('/admin/escaner-facturas')} className="rounded-lg bg-zinc-800 p-2 hover:bg-zinc-700 transition-colors shrink-0">
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-semibold truncate">{doc.originalFilename}</h1>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium
                  ${doc.status === 'confirmed' ? 'bg-green-700/20 text-green-300' :
                    doc.status === 'duplicate' ? 'bg-purple-500/15 text-purple-400' :
                    doc.status === 'error' ? 'bg-red-700/20 text-red-400' :
                    'bg-orange-500/15 text-orange-400'}`}>
                  {doc.status}
                </span>
              </div>
              {validation && !validation.valid && (
                <p className="text-xs text-red-400 mt-0.5 flex items-center gap-1">
                  <ShieldAlert size={11} /> {validation.issues.filter((i: any) => i.severity === 'error').length} errores · {validation.issues.filter((i: any) => i.severity === 'warning').length} avisos
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => navigate(`/admin/conciliacion-factura/${id}`)} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700 transition-colors">
              <Link2 size={14} /> Conciliar
            </button>
            {hasEdits && (
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar
              </button>
            )}
            {canConfirm && (
              <button
                onClick={() => confirmMutation.mutate(false)}
                disabled={confirmMutation.isPending || !doc.supplierId}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-2 text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
                title={!doc.supplierId ? 'Asigna un proveedor primero' : ''}
              >
                {confirmMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Confirmar factura
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: header fields */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Datos de cabecera</h2>

          {/* Validation issues */}
          {validation?.issues?.length > 0 && (
            <div className="rounded-lg border border-amber-800/40 bg-amber-900/10 p-3 space-y-1">
              {validation.issues.map((issue: any, i: number) => (
                <div key={i} className={`flex items-start gap-2 text-xs ${issue.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {issue.severity === 'error' ? <AlertCircle size={12} className="mt-0.5 shrink-0" /> : <AlertTriangle size={12} className="mt-0.5 shrink-0" />}
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Supplier assignment */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <p className="text-xs text-zinc-500 font-medium mb-2">Proveedor asignado</p>
            {(selectedSupplierId ? supplierCandidates.find((s) => s.id === selectedSupplierId) ?? supplier : supplier) ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">
                    {selectedSupplierId
                      ? supplierCandidates.find((s) => s.id === selectedSupplierId)?.commercialName ?? supplier?.commercialName
                      : supplier?.commercialName}
                  </p>
                  <p className="text-xs text-zinc-500">
                    NIF: {selectedSupplierId
                      ? supplierCandidates.find((s) => s.id === selectedSupplierId)?.nif ?? supplier?.nif
                      : supplier?.nif}
                  </p>
                </div>
                <button onClick={() => { setSelectedSupplierId(null); setSupplierSearch(''); setSupplierCandidates([]); }} className="text-xs text-zinc-500 hover:text-white">
                  cambiar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={supplierSearch}
                  onChange={(e) => searchSuppliers(e.target.value)}
                  placeholder="Buscar por nombre o NIF…"
                  className="w-full rounded bg-zinc-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {supplierCandidates.length > 0 && (
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900 overflow-hidden">
                    {supplierCandidates.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setSelectedSupplierId(s.id); setSupplierSearch(s.commercialName); setSupplierCandidates([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800 transition-colors text-sm border-b border-zinc-800/60 last:border-0"
                      >
                        <span className="font-medium">{s.commercialName}</span>
                        <span className="ml-2 text-xs text-zinc-500">{s.nif}</span>
                      </button>
                    ))}
                  </div>
                )}
                {supplierSearch.length >= 2 && supplierCandidates.length === 0 && (
                  <p className="text-xs text-zinc-500 text-center py-1">No encontrado — <a className="text-blue-400 cursor-pointer hover:underline" onClick={() => navigate('/admin/proveedores')}>crear proveedor</a></p>
                )}
              </div>
            )}
          </div>

          {/* Header fields */}
          {extraction && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { key: 'invoiceNumber', label: 'Número de factura', val: extraction.invoiceNumber, conf: extraction.invoiceNumberConfidence, status: extraction.invoiceNumberStatus },
                { key: 'invoiceDate', label: 'Fecha de emisión', val: extraction.invoiceDate, conf: extraction.invoiceDateConfidence, status: extraction.invoiceDateStatus, type: 'date' },
                { key: 'dueDate', label: 'Fecha de vencimiento', val: extraction.dueDate, conf: extraction.dueDateConfidence, status: extraction.dueDateStatus, type: 'date' },
                { key: 'nif', label: 'NIF/CIF proveedor', val: extraction.nif, conf: extraction.nifConfidence, status: extraction.nifStatus },
                { key: 'legalName', label: 'Razón social', val: extraction.legalName, conf: extraction.legalNameConfidence, status: extraction.legalNameStatus },
                { key: 'paymentMethod', label: 'Forma de pago', val: extraction.paymentMethod, conf: extraction.paymentMethodConfidence, status: extraction.paymentMethodStatus },
                { key: 'taxableBase', label: 'Base imponible total', val: extraction.taxableBase ? `${parseFloat(extraction.taxableBase).toFixed(2)}` : null, conf: extraction.taxableBaseConfidence, status: extraction.taxableBaseStatus },
                { key: 'total', label: 'Total factura', val: extraction.total ? `${parseFloat(extraction.total).toFixed(2)}` : null, conf: extraction.totalConfidence, status: extraction.totalStatus },
                { key: 'relatedOrderNumber', label: 'Pedido referenciado', val: extraction.relatedOrderNumber, conf: extraction.relatedOrderNumberConfidence, status: extraction.relatedOrderNumberStatus },
                { key: 'relatedDeliveryNote', label: 'Albarán referenciado', val: extraction.relatedDeliveryNote, conf: extraction.relatedDeliveryNoteConfidence, status: extraction.relatedDeliveryNoteStatus },
              ].map(({ key, label, val, conf, status, type }) => (
                <EditableField
                  key={key}
                  label={label}
                  value={getHeaderValue(key, val)}
                  confidence={conf}
                  status={status}
                  onChange={(v) => patchHeader(key, v)}
                  type={type as any}
                />
              ))}
            </div>
          )}

          {/* VAT breakdown */}
          {vatBreakdown.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 font-medium mb-2">Desglose IVA</p>
              <VatTable vatBreakdown={vatBreakdown} />
            </div>
          )}
        </div>

        {/* Right: line items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Líneas ({lines?.filter((l: any) => !l.isRejected).length ?? 0} activas)
            </h2>
            <button onClick={() => refetch()} className="rounded-lg bg-zinc-800 p-1.5 hover:bg-zinc-700 transition-colors">
              <RefreshCw size={13} />
            </button>
          </div>

          {lines?.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-10 text-center">
              <FileText size={32} className="mx-auto text-zinc-700 mb-2" />
              <p className="text-sm text-zinc-500">No se extrajeron líneas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lines?.map((line: any) => (
                <LineRow
                  key={line.id}
                  line={{ ...line, ...(lineEdits[line.id] ?? {}) }}
                  ingredients={ingredients as any[]}
                  mappings={mappings ?? []}
                  onUpdate={(patch) => patchLine(line.id, patch)}
                />
              ))}
            </div>
          )}

          {/* Line totals summary */}
          {lines?.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Total líneas activas</span>
                <span className="font-mono font-medium">
                  {lines.filter((l: any) => !l.isRejected)
                    .reduce((s: number, l: any) => s + parseFloat(l.lineTotal ?? '0'), 0)
                    .toFixed(2)} €
                </span>
              </div>
              {extraction?.total && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-zinc-400">Total extraído</span>
                  <span className="font-mono font-medium">{parseFloat(extraction.total).toFixed(2)} €</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {doc.status !== 'confirmed' && doc.status !== 'rejected' && (
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => {
                  const reason = window.prompt('Motivo del rechazo:');
                  if (reason !== null) rejectMutation.mutate(reason);
                }}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
              >
                Rechazar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
