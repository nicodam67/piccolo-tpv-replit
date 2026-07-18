import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { customFetch } from '@workspace/api-client-react';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseProposalItem } from '@workspace/api-client-react';
import { ArrowLeft, Plus, Send, CheckCircle, XCircle, Copy, Zap, ChevronRight, X, Trash2, Pencil, AlertTriangle, Search, Loader2 } from 'lucide-react';

type Supplier = { id: string; commercialName: string };
type Ingredient = { id: string; name: string; unit: string };

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', pending_approval: 'Aprobación', sent: 'Enviado',
  confirmed: 'Confirmado', partially_received: 'Parcial', received: 'Recibido', cancelled: 'Cancelado',
};
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground', pending_approval: 'bg-amber-900 text-amber-300',
  sent: 'bg-blue-900 text-blue-300', confirmed: 'bg-indigo-900 text-indigo-300',
  partially_received: 'bg-orange-900 text-orange-300', received: 'bg-green-900 text-green-300',
  cancelled: 'bg-red-900 text-red-300',
};
const NEXT_STATUS: Record<string, string[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['sent', 'draft', 'cancelled'],
  sent: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
};
const STATUS_ACTION: Record<string, string> = {
  pending_approval: 'Enviar a aprobación', sent: 'Marcar enviado', draft: 'Devolver a borrador',
  confirmed: 'Confirmar pedido', cancelled: 'Cancelar',
};

export default function PedidosCompra() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showProposal, setShowProposal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');

  const { data: orders = [], isLoading, refetch: refetchOrders } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', filterStatus],
    queryFn: () => customFetch(`/api/admin/purchase-orders${filterStatus ? `?status=${filterStatus}` : ''}`),
  });

  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) void refetchOrders(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchOrders]);

  const { data: detail } = useQuery<PurchaseOrder & { items: PurchaseOrderItem[] }>({
    queryKey: ['purchase-order', selectedId],
    queryFn: () => customFetch(`/api/admin/purchase-orders/${selectedId}`),
    enabled: !!selectedId,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers-active'],
    queryFn: () => customFetch('/api/admin/suppliers?active=true'),
  });

  const { data: ingredients = [] } = useQuery<Ingredient[]>({
    queryKey: ['ingredients-simple'],
    queryFn: () => customFetch('/api/admin/ingredients'),
  });

  const { data: proposal } = useQuery<{ suggestions: PurchaseProposalItem[]; daysAhead: number }>({
    queryKey: ['purchase-proposal'],
    queryFn: () => customFetch('/api/admin/purchase-orders/proposal', { method: 'POST', body: JSON.stringify({ daysAhead: 7 }) }),
    enabled: showProposal,
  });

  const createOrder = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      customFetch('/api/admin/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (order: any) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success('Pedido creado');
      setShowCreate(false);
      setSelectedId(order.id);
    },
    onError: (e: any) => toast.error(e.message ?? 'Error'),
  });

  const transition = useMutation({
    mutationFn: ({ id, status, cancelReason }: { id: string; status: string; cancelReason?: string }) =>
      customFetch(`/api/admin/purchase-orders/${id}/transition`, { method: 'POST', body: JSON.stringify({ status, cancelReason }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['purchase-order', selectedId] }); toast.success('Estado actualizado'); },
    onError: (e: any) => toast.error(e.message ?? 'Transición no permitida'),
  });

  const addItem = useMutation({
    mutationFn: ({ orderId, data }: { orderId: string; data: Record<string, unknown> }) =>
      customFetch(`/api/admin/purchase-orders/${orderId}/items`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-order', selectedId] }); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('Línea añadida'); },
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => customFetch(`/api/admin/purchase-order-items/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-order', selectedId] }); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); },
  });

  const copyOrder = useMutation({
    mutationFn: (sourceId: string) =>
      customFetch('/api/admin/purchase-orders', { method: 'POST', body: JSON.stringify({ supplierId: detail?.supplierId, copyFromOrderId: sourceId }) }),
    onSuccess: (order: any) => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('Pedido copiado'); setSelectedId(order.id); },
  });

  function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createOrder.mutate({
      supplierId: fd.get('supplierId'),
      expectedDeliveryDate: fd.get('expectedDeliveryDate') || null,
      notes: fd.get('notes') || null,
    });
  }

  function handleAddItemSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId) return;
    const fd = new FormData(e.currentTarget);
    addItem.mutate({
      orderId: selectedId,
      data: {
        ingredientId: fd.get('ingredientId'),
        quantity: fd.get('quantity'),
        unitPrice: fd.get('unitPrice'),
        unit: fd.get('unit') || 'ud',
        vatPct: fd.get('vatPct') || '10',
        discount: fd.get('discount') || '0',
      },
    });
    e.currentTarget.reset();
  }

  const canEdit = detail && !['received', 'cancelled'].includes(detail.status);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 h-14 border-b border-border bg-card/80 backdrop-blur">
        <button onClick={() => setLocation('/admin')} className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Pedidos de compra</h1>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setShowProposal(true)} className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-sm flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-400" /> Propuesta automática
          </button>
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Nuevo pedido
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left: order list */}
        <aside className="w-72 border-r border-border flex flex-col shrink-0">
          <div className="p-2 border-b border-border space-y-1.5">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-sm">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                value={supplierSearch}
                autoFocus
                onChange={e => setSupplierSearch(e.target.value)}
                placeholder="Buscar proveedor…"
                className="w-full pl-8 pr-6 py-1.5 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
               {supplierSearch && (
                 <button onClick={() => setSupplierSearch('')}
                   className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                   <X size={12} />
                 </button>
               )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? <p className="p-4 text-sm text-muted-foreground">Cargando...</p> :
              orders.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Sin pedidos</p> :
              orders.filter(o => !supplierSearch.trim() || (o.supplierName ?? '').toLowerCase().includes(supplierSearch.trim().toLowerCase())).map(order => (
                <button key={order.id} onClick={() => setSelectedId(order.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 ${selectedId === order.id ? 'bg-muted' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">{order.supplierName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? ''}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>{new Date(order.orderDate).toLocaleDateString('es-ES')}</span>
                    <span className="font-medium text-foreground">{parseFloat(order.totalAmount ?? '0').toFixed(2)} €</span>
                  </div>
                </button>
              ))}
          </div>
        </aside>

        {/* Right: order detail */}
        <main className="flex-1 overflow-y-auto">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <Send className="w-12 h-12 opacity-20" />
              <p className="text-sm">Selecciona un pedido</p>
            </div>
          ) : !detail ? <p className="p-6 text-sm text-muted-foreground">Cargando...</p> : (
            <div className="p-6 max-w-3xl">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">{detail.supplierName}</h2>
                  <p className="text-sm text-muted-foreground">{new Date(detail.orderDate).toLocaleDateString('es-ES')}
                    {detail.expectedDeliveryDate && ` · Entrega: ${new Date(detail.expectedDeliveryDate).toLocaleDateString('es-ES')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm px-2 py-1 rounded-full ${STATUS_COLORS[detail.status] ?? ''}`}>{STATUS_LABELS[detail.status] ?? detail.status}</span>
                  <button onClick={() => copyOrder.mutate(detail.id)} disabled={copyOrder.isPending}
                    className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50" title="Copiar pedido">
                    {copyOrder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Transition buttons */}
              <div className="flex flex-wrap gap-2 mb-6">
                {(NEXT_STATUS[detail.status] ?? []).map(ns => (
                  <button key={ns} onClick={() => {
                    if (ns === 'cancelled') {
                      const reason = prompt('Motivo de cancelación (opcional):');
                      transition.mutate({ id: detail.id, status: ns, cancelReason: reason ?? undefined });
                    } else {
                      transition.mutate({ id: detail.id, status: ns });
                    }
                  }}
                    disabled={transition.isPending}
                    className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-60 ${
                      ns === 'cancelled' ? 'border border-red-800 text-red-400 hover:bg-red-950' : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}>
                    {ns === 'cancelled' ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    {STATUS_ACTION[ns] ?? ns}
                  </button>
                ))}
              </div>

              {detail.cancelReason && (
                <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded-lg text-sm text-red-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Motivo cancelación: {detail.cancelReason}</span>
                </div>
              )}

              {/* Items table */}
              <div className="border border-border rounded-lg overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">Ingrediente</th>
                      <th className="px-3 py-2 text-right">Cant.</th>
                      <th className="px-3 py-2 text-right">P.Unit.</th>
                      <th className="px-3 py-2 text-right">IVA</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      {canEdit && <th className="px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(detail.items ?? []).length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Sin líneas</td></tr>
                    ) : (detail.items ?? []).map(item => {
                      const qty = parseFloat(item.quantity);
                      const price = parseFloat(item.unitPrice);
                      const disc = parseFloat(item.discount ?? '0');
                      const vat = parseFloat(item.vatPct ?? '10');
                      const lineTotal = qty * price * (1 - disc / 100) * (1 + vat / 100);
                      return (
                        <tr key={item.id} className="hover:bg-muted/30">
                          <td className="px-3 py-2"><span className="font-medium">{item.ingredientName}</span> <span className="text-muted-foreground text-xs">/{item.ingredientUnit}</span></td>
                          <td className="px-3 py-2 text-right">{qty} {item.unit}</td>
                          <td className="px-3 py-2 text-right">{price.toFixed(4)} €</td>
                          <td className="px-3 py-2 text-right">{vat}%</td>
                          <td className="px-3 py-2 text-right font-medium">{lineTotal.toFixed(2)} €</td>
                          {canEdit && (
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => deleteItem.mutate(item.id)} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/50 font-semibold text-sm">
                    <tr>
                      <td colSpan={canEdit ? 4 : 3} className="px-3 py-2 text-right text-muted-foreground">Total pedido:</td>
                      <td className="px-3 py-2 text-right">{parseFloat(detail.totalAmount ?? '0').toFixed(2)} €</td>
                      {canEdit && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Add item form */}
              {canEdit && (
                <form onSubmit={handleAddItemSubmit} className="border border-dashed border-border rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-3">Añadir línea</h4>
                  <div className="grid grid-cols-6 gap-2">
                    <div className="col-span-2">
                      <select name="ingredientId" required className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-sm">
                        <option value="">Ingrediente...</option>
                        {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </div>
                    <input name="quantity" type="number" step="0.0001" required placeholder="Cantidad" className="bg-muted border border-border rounded-lg px-2 py-1.5 text-sm" />
                    <input name="unit" defaultValue="ud" placeholder="Unidad" className="bg-muted border border-border rounded-lg px-2 py-1.5 text-sm" />
                    <input name="unitPrice" type="number" step="0.0001" required placeholder="Precio" className="bg-muted border border-border rounded-lg px-2 py-1.5 text-sm" />
                    <button type="submit" className="bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
                      <Plus className="w-4 h-4 mx-auto" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input name="vatPct" type="number" step="0.01" defaultValue="10" placeholder="IVA %" className="bg-muted border border-border rounded-lg px-2 py-1.5 text-sm" />
                    <input name="discount" type="number" step="0.01" defaultValue="0" placeholder="Descuento %" className="bg-muted border border-border rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                </form>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Create order modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold">Nuevo pedido de compra</h2>
              <button onClick={() => setShowCreate(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreateSubmit} className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Proveedor *</label>
                <select name="supplierId" required className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="">Seleccionar proveedor...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.commercialName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Fecha entrega esperada</label>
                <input name="expectedDeliveryDate" type="date" className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notas</label>
                <textarea name="notes" rows={2} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border border-border hover:bg-muted text-sm">Cancelar</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm">Crear pedido</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Proposal modal */}
      {showProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowProposal(false); }}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
              <h2 className="font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> Propuesta de reposición (próximos 7 días)</h2>
              <button onClick={() => setShowProposal(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              {!proposal ? <p className="text-sm text-muted-foreground">Calculando...</p> :
                proposal.suggestions.length === 0 ? <p className="text-sm text-muted-foreground">✓ No hay ingredientes que reponer en los próximos {proposal.daysAhead} días</p> :
                <div className="space-y-2">
                  {proposal.suggestions.map(s => (
                    <div key={s.ingredientId} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{s.ingredientName}</p>
                        <p className="text-xs text-muted-foreground">Stock: {parseFloat(s.currentStock).toFixed(2)} {s.unit} · Mín: {parseFloat(s.minStock).toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">{parseFloat(s.suggestedQty).toFixed(2)} {s.unit}</p>
                        {s.supplierName && <p className="text-xs text-muted-foreground">{s.supplierName}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
