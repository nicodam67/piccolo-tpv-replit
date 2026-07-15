import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import {
  ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Link2,
  TrendingUp, TrendingDown, Minus, Loader2, Package, ShoppingCart,
  FileText, ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Diff row ─────────────────────────────────────────────────────────────────
function DiffRow({ diff }: { diff: any }) {
  const qtyDiff = diff.qtyDiff ?? 0;
  const priceDiff = diff.priceDiff ?? 0;
  const qtyOk = Math.abs(qtyDiff) < 0.001;
  const priceOk = Math.abs(priceDiff) < 0.001;
  const allOk = qtyOk && priceOk && diff.inInvoice && diff.inReceipt;

  const DiffIcon = ({ value }: { value: number }) => {
    if (Math.abs(value) < 0.001) return <Minus size={12} className="text-zinc-500" />;
    if (value > 0) return <TrendingUp size={12} className="text-red-400" />;
    return <TrendingDown size={12} className="text-green-400" />;
  };

  return (
    <tr className={`border-b border-zinc-800/60 ${!allOk ? 'bg-amber-900/5' : ''}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {allOk
            ? <CheckCircle2 size={14} className="text-green-500 shrink-0" />
            : <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          }
          <span className="text-sm font-medium text-white">{diff.name}</span>
        </div>
        <div className="flex gap-2 mt-0.5">
          {diff.inInvoice && <span className="text-[10px] bg-blue-900/30 text-blue-400 rounded px-1.5">factura</span>}
          {diff.inReceipt && <span className="text-[10px] bg-green-900/30 text-green-400 rounded px-1.5">albarán</span>}
          {diff.inOrder && <span className="text-[10px] bg-purple-900/30 text-purple-400 rounded px-1.5">pedido</span>}
          {!diff.inInvoice && <span className="text-[10px] bg-red-900/30 text-red-400 rounded px-1.5">no facturado</span>}
          {!diff.inReceipt && diff.inInvoice && <span className="text-[10px] bg-amber-900/30 text-amber-400 rounded px-1.5">no recibido</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-center text-xs font-mono">
        <div>{diff.invoiceQty?.toFixed(2) ?? '—'}</div>
        <div className={`mt-0.5 ${!qtyOk ? 'text-amber-400' : 'text-zinc-600'} flex items-center gap-0.5 justify-center`}>
          <DiffIcon value={qtyDiff} /> {qtyDiff !== 0 ? (qtyDiff > 0 ? `+${qtyDiff.toFixed(2)}` : qtyDiff.toFixed(2)) : '='}
        </div>
      </td>
      <td className="px-4 py-3 text-center text-xs font-mono">
        <div>{diff.receiptQty?.toFixed(2) ?? '—'}</div>
      </td>
      <td className="px-4 py-3 text-right text-xs font-mono">
        <div>{diff.invoicePrice > 0 ? `${diff.invoicePrice.toFixed(4)} €` : '—'}</div>
        <div className={`mt-0.5 ${!priceOk ? 'text-amber-400' : 'text-zinc-600'} flex items-center gap-0.5 justify-end`}>
          <DiffIcon value={priceDiff} /> {priceDiff !== 0 ? (priceDiff > 0 ? `+${priceDiff.toFixed(4)}` : priceDiff.toFixed(4)) : '='}
        </div>
      </td>
      <td className="px-4 py-3 text-right text-xs font-mono text-zinc-400">
        {diff.orderedPrice > 0 ? `${diff.orderedPrice.toFixed(4)} €` : '—'}
      </td>
      <td className="px-4 py-3 text-center">
        {allOk
          ? <CheckCircle2 size={16} className="text-green-500 mx-auto" />
          : <AlertTriangle size={16} className="text-amber-400 mx-auto" />
        }
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ConciliacionFactura() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['invoice-reconciliation', id],
    queryFn: () => customFetch(`/api/admin/invoice-scanner/${id}/reconciliation`),
    enabled: !!id,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['purchase-orders-received'],
    queryFn: () => customFetch('/api/admin/purchase-orders?status=received'),
  });

  const { data: receipts = [] } = useQuery({
    queryKey: ['goods-receipts-all'],
    queryFn: () => customFetch('/api/admin/goods-receipts'),
  });

  const linkMutation = useMutation({
    mutationFn: ({ orderIds, receiptIds }: { orderIds?: string[]; receiptIds?: string[] }) =>
      customFetch(`/api/admin/invoice-scanner/${id}/link`, {
        method: 'POST',
        body: JSON.stringify({ orderIds, receiptIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-reconciliation', id] });
      toast.success('Enlace guardado');
    },
    onError: (e: any) => toast.error(e?.data?.message ?? 'Error al enlazar'),
  });

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

  const { document: doc, summary, diffs, invoiceLines, receiptItems, orderItems } = data as any;

  const totalDiff = parseFloat(summary.totalDiff ?? '0');
  const hasDiscrepancies = diffs.some((d: any) => Math.abs(d.qtyDiff ?? 0) > 0.001 || Math.abs(d.priceDiff ?? 0) > 0.001 || !d.inReceipt || !d.inInvoice);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate(`/admin/revision-factura/${id}`)} className="rounded-lg bg-zinc-800 p-2 hover:bg-zinc-700 transition-colors">
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-base font-semibold">Conciliación — {doc.originalFilename}</h1>
              <p className="text-xs text-zinc-500 mt-0.5">Comparativa factura ↔ albarán ↔ pedido</p>
            </div>
          </div>
          <button onClick={() => navigate(`/admin/revision-factura/${id}`)} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700 transition-colors">
            <FileText size={14} /> Ver factura
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-xs text-zinc-500 mb-1">Total factura</p>
            <p className="text-xl font-bold text-white font-mono">{parseFloat(summary.invoiceTotal).toFixed(2)} €</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-xs text-zinc-500 mb-1">Total recibido</p>
            <p className="text-xl font-bold text-white font-mono">{parseFloat(summary.receiptTotal).toFixed(2)} €</p>
          </div>
          <div className={`rounded-xl border p-4 ${Math.abs(totalDiff) < 0.01 ? 'border-green-800/40 bg-green-900/10' : 'border-amber-800/40 bg-amber-900/10'}`}>
            <p className="text-xs text-zinc-500 mb-1">Diferencia</p>
            <p className={`text-xl font-bold font-mono ${Math.abs(totalDiff) < 0.01 ? 'text-green-400' : 'text-amber-400'}`}>
              {totalDiff >= 0 ? '+' : ''}{totalDiff.toFixed(2)} €
            </p>
          </div>
          <div className={`rounded-xl border p-4 ${!hasDiscrepancies ? 'border-green-800/40 bg-green-900/10' : 'border-amber-800/40 bg-amber-900/10'}`}>
            <p className="text-xs text-zinc-500 mb-1">Estado</p>
            <p className={`text-sm font-semibold flex items-center gap-1.5 ${!hasDiscrepancies ? 'text-green-400' : 'text-amber-400'}`}>
              {!hasDiscrepancies ? <><CheckCircle2 size={14} /> Sin diferencias</> : <><AlertTriangle size={14} /> Con diferencias</>}
            </p>
          </div>
        </div>

        {/* Link to orders/receipts */}
        {!summary.hasLinkedOrders && !summary.hasLinkedReceipts && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-sm font-medium mb-3">Enlazar con pedidos y albaranes</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1.5"><ShoppingCart size={12} /> Pedidos recibidos</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(orders as any[]).slice(0, 20).map((o: any) => (
                    <label key={o.id} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/40 hover:bg-zinc-800/60 cursor-pointer text-sm">
                      <input type="checkbox" className="rounded" onChange={(e) => {
                        if (e.target.checked) linkMutation.mutate({ orderIds: [o.id] });
                      }} />
                      <span>{o.supplierName} — {o.orderDate?.slice(0, 10)}</span>
                    </label>
                  ))}
                  {(orders as any[]).length === 0 && <p className="text-xs text-zinc-600 italic">Sin pedidos recibidos</p>}
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1.5"><ClipboardList size={12} /> Albaranes</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(receipts as any[]).slice(0, 20).map((r: any) => (
                    <label key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/40 hover:bg-zinc-800/60 cursor-pointer text-sm">
                      <input type="checkbox" className="rounded" onChange={(e) => {
                        if (e.target.checked) linkMutation.mutate({ receiptIds: [r.id] });
                      }} />
                      <span>{r.supplierName} — {r.receiptNumber ?? r.receiptDate?.slice(0, 10)}</span>
                    </label>
                  ))}
                  {(receipts as any[]).length === 0 && <p className="text-xs text-zinc-600 italic">Sin albaranes</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VAT summary */}
        {summary.vatBreakdown?.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Resumen fiscal</h3>
            <div className="grid grid-cols-3 gap-3">
              {summary.vatBreakdown.map((v: any, i: number) => (
                <div key={i} className="rounded-lg bg-zinc-800/40 p-3 text-center">
                  <p className="text-xs text-zinc-500">IVA {(v.rate * 100).toFixed(0)}%</p>
                  <p className="font-mono text-sm font-medium mt-1">B: {parseFloat(v.base).toFixed(2)} €</p>
                  <p className="font-mono text-xs text-zinc-400">C: {parseFloat(v.amount).toFixed(2)} €</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Diff table */}
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
            <h3 className="text-sm font-medium">Comparativa línea a línea</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {diffs.length} productos · {diffs.filter((d: any) => !d.inReceipt && d.inInvoice).length} facturados no recibidos · {diffs.filter((d: any) => !d.inInvoice && d.inReceipt).length} recibidos no facturados
            </p>
          </div>
          {diffs.length === 0 ? (
            <div className="py-12 text-center">
              <Link2 size={28} className="mx-auto text-zinc-700 mb-2" />
              <p className="text-sm text-zinc-500">Enlaza un albarán o pedido para ver la comparativa</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/60">
                <tr>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Producto</th>
                  <th className="px-4 py-3 text-center text-xs text-zinc-500 font-medium">Cant. factura</th>
                  <th className="px-4 py-3 text-center text-xs text-zinc-500 font-medium">Cant. albarán</th>
                  <th className="px-4 py-3 text-right text-xs text-zinc-500 font-medium">P. factura</th>
                  <th className="px-4 py-3 text-right text-xs text-zinc-500 font-medium">P. pedido</th>
                  <th className="px-4 py-3 text-center text-xs text-zinc-500 font-medium">OK</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((diff: any, i: number) => <DiffRow key={i} diff={diff} />)}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
