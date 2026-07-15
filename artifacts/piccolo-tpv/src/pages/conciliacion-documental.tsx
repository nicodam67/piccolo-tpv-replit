import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import type { PurchaseOrder } from '@workspace/api-client-react';
import { ArrowLeft, GitCompare, CheckCircle2, AlertTriangle, XCircle, ChevronRight, Search, X } from 'lucide-react';

interface ReconciliationData {
  order: PurchaseOrder & { supplierName: string };
  orderItems: any[];
  receipts: any[];
  invoices: any[];
  summary: {
    orderTotal: string;
    receiptTotal: string;
    invoiceTotal: string;
    orderVsReceipt: string;
    orderVsInvoice: string;
    receiptVsInvoice: string;
  };
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', pending_approval: 'Aprobación', sent: 'Enviado',
  confirmed: 'Confirmado', partially_received: 'Parcial', received: 'Recibido', cancelled: 'Cancelado',
};

export default function ConciliacionDocumental() {
  const [, setLocation] = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');

  const { data: orders = [], isLoading, refetch: refetchOrders } = useQuery<PurchaseOrder[]>({
    queryKey: ['orders-for-reconciliation'],
    queryFn: () => customFetch('/api/admin/purchase-reports/order-vs-receipt'),
  });

  const filteredOrders = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return orders as any[];
    return (orders as any[]).filter(o =>
      (o.supplierName ?? '').toLowerCase().includes(q)
    );
  }, [orders, sidebarSearch]);

  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) void refetchOrders(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refetchOrders]);

  const { data: reconciliation, isLoading: loadingRecon } = useQuery<ReconciliationData>({
    queryKey: ['reconciliation', selectedId],
    queryFn: () => customFetch(`/api/admin/purchase-orders/${selectedId}/reconciliation`),
    enabled: !!selectedId,
  });

  function diffStatus(diffStr: string, threshold = 0.01): 'ok' | 'warn' | 'error' {
    const d = Math.abs(parseFloat(diffStr ?? '0'));
    if (d < threshold) return 'ok';
    if (d < 5) return 'warn';
    return 'error';
  }

  function DiffBadge({ value, label }: { value: string; label: string }) {
    const status = diffStatus(value);
    const num = parseFloat(value ?? '0');
    return (
      <div className={`rounded-lg p-3 ${status === 'ok' ? 'bg-green-950 border border-green-800' : status === 'warn' ? 'bg-amber-950 border border-amber-800' : 'bg-red-950 border border-red-800'}`}>
        <div className="flex items-center gap-1.5 mb-1">
          {status === 'ok' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : status === 'warn' ? <AlertTriangle className="w-4 h-4 text-amber-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-lg font-bold ${status === 'ok' ? 'text-green-300' : status === 'warn' ? 'text-amber-300' : 'text-red-300'}`}>
          {num >= 0 ? '+' : ''}{num.toFixed(2)} €
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 h-14 border-b border-border bg-card/80 backdrop-blur">
        <button onClick={() => setLocation('/admin')} className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Conciliación documental</h1>
      </header>

      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left: order list */}
        <aside className="w-72 border-r border-border overflow-y-auto shrink-0 flex flex-col">
          <div className="p-2 border-b border-border space-y-1.5 shrink-0">
            <p className="text-xs text-muted-foreground px-1">Pedidos recibidos (parcial o total)</p>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                value={sidebarSearch}
                autoFocus
               onChange={e => setSidebarSearch(e.target.value)}
                placeholder="Buscar proveedor…"
                className="w-full pl-8 pr-2 py-1.5 text-xs bg-secondary rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          {isLoading ? <p className="p-4 text-sm text-muted-foreground">Cargando...</p> :
            filteredOrders.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                <p>Sin pedidos para conciliar{sidebarSearch ? ` para "${sidebarSearch}"` : ''}</p>
                {sidebarSearch && (
                  <button onClick={() => setSidebarSearch('')} className="mt-1 text-primary font-semibold hover:underline">Borrar búsqueda</button>
                )}
              </div>
            ) :
            filteredOrders.map(order => (
              <button key={order.id} onClick={() => setSelectedId(order.id)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 flex items-center gap-3 ${selectedId === order.id ? 'bg-muted' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{order.supplierName}</p>
                  <p className="text-xs text-muted-foreground">{new Date(order.orderDate).toLocaleDateString('es-ES')} · {STATUS_LABELS[order.status] ?? order.status}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
        </aside>

        {/* Right: reconciliation detail */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <GitCompare className="w-12 h-12 opacity-20" />
              <p className="text-sm">Selecciona un pedido para ver la conciliación</p>
            </div>
          ) : loadingRecon ? <p className="text-sm text-muted-foreground">Cargando...</p> : !reconciliation ? null : (
            <div className="max-w-3xl">
              <div className="mb-6">
                <h2 className="text-xl font-bold">Conciliación: {reconciliation.order.supplierName}</h2>
                <p className="text-sm text-muted-foreground">{new Date(reconciliation.order.orderDate).toLocaleDateString('es-ES')} · {STATUS_LABELS[reconciliation.order.status] ?? reconciliation.order.status}</p>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total pedido</p>
                  <p className="text-lg font-bold">{parseFloat(reconciliation.summary.orderTotal).toFixed(2)} €</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total albaranes</p>
                  <p className="text-lg font-bold">{parseFloat(reconciliation.summary.receiptTotal).toFixed(2)} €</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total facturas</p>
                  <p className="text-lg font-bold">{parseFloat(reconciliation.summary.invoiceTotal).toFixed(2)} €</p>
                </div>
              </div>

              {/* Diff badges */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <DiffBadge value={reconciliation.summary.orderVsReceipt} label="Pedido vs Albaranes" />
                <DiffBadge value={reconciliation.summary.orderVsInvoice} label="Pedido vs Facturas" />
                <DiffBadge value={reconciliation.summary.receiptVsInvoice} label="Albaranes vs Facturas" />
              </div>

              {/* Receipts */}
              <div className="mb-6">
                <h3 className="font-medium text-sm mb-2">Albaranes ({reconciliation.receipts.length})</h3>
                {reconciliation.receipts.length === 0 ? (
                  <p className="text-sm text-amber-400 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Sin albaranes registrados</p>
                ) : (
                  <div className="space-y-1">
                    {reconciliation.receipts.map((r: any) => (
                      <div key={r.id} className="flex justify-between items-center bg-muted rounded-lg px-3 py-2 text-sm">
                        <span className="text-muted-foreground">{r.receiptNumber ?? '(sin nº)'} · {new Date(r.receiptDate).toLocaleDateString('es-ES')}</span>
                        <span className="font-medium">{parseFloat(r.totalAmount ?? '0').toFixed(2)} €</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Invoices */}
              <div className="mb-6">
                <h3 className="font-medium text-sm mb-2">Facturas ({reconciliation.invoices.length})</h3>
                {reconciliation.invoices.length === 0 ? (
                  <p className="text-sm text-amber-400 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Sin facturas vinculadas</p>
                ) : (
                  <div className="space-y-1">
                    {reconciliation.invoices.map((inv: any) => (
                      <div key={inv.id} className="flex justify-between items-center bg-muted rounded-lg px-3 py-2 text-sm">
                        <span className="text-muted-foreground">Nº {inv.invoiceNumber} · {new Date(inv.invoiceDate).toLocaleDateString('es-ES')}</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${inv.paymentStatus === 'paid' ? 'bg-green-900 text-green-300' : 'bg-amber-900 text-amber-300'}`}>
                            {inv.paymentStatus === 'paid' ? 'Pagada' : 'Pendiente'}
                          </span>
                          <span className="font-medium">{parseFloat(inv.total ?? '0').toFixed(2)} €</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Order items */}
              <div>
                <h3 className="font-medium text-sm mb-2">Líneas del pedido</h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-muted-foreground text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left">Ingrediente</th>
                        <th className="px-3 py-2 text-right">Cant.</th>
                        <th className="px-3 py-2 text-right">P.Unit.</th>
                        <th className="px-3 py-2 text-right">Total neto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reconciliation.orderItems.map((item: any) => {
                        const qty = parseFloat(item.qtyOrdered ?? '0');
                        const price = parseFloat(item.unitPrice ?? '0');
                        return (
                          <tr key={item.ingredientId}>
                            <td className="px-3 py-2">{item.ingredientName}</td>
                            <td className="px-3 py-2 text-right">{qty.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right">{price.toFixed(4)} €</td>
                            <td className="px-3 py-2 text-right font-medium">{(qty * price).toFixed(2)} €</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
