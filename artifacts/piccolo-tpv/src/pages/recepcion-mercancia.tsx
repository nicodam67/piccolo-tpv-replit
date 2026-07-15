import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { customFetch } from '@workspace/api-client-react';
import type { GoodsReceipt, PurchaseOrder, PurchaseOrderItem } from '@workspace/api-client-react';
import { ArrowLeft, Plus, Truck, ClipboardCheck, X, AlertTriangle, Search, Loader2 } from 'lucide-react';

type Supplier = { id: string; commercialName: string };
type Ingredient = { id: string; name: string; unit: string };

interface ReceiptLineForm {
  ingredientId: string;
  qtyReceived: string;
  qtyRejected: string;
  unitPrice: string;
  lotNumber: string;
  expiryDate: string;
  temperature: string;
  incidents: string;
}

export default function RecepcionMercancia() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [formOrderId, setFormOrderId] = useState('');
  const [formSupplierId, setFormSupplierId] = useState('');
  const [lines, setLines] = useState<ReceiptLineForm[]>([]);
  const [forceDeviation, setForceDeviation] = useState(false);
  const [deviationWarning, setDeviationWarning] = useState<any>(null);

  const { data: receipts = [], isLoading, refetch: refetchReceipts } = useQuery<GoodsReceipt[]>({
    queryKey: ['goods-receipts'],
    queryFn: () => customFetch('/api/admin/goods-receipts'),
  });

  const filteredReceipts = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return receipts as GoodsReceipt[];
    return (receipts as GoodsReceipt[]).filter(r =>
      (r as any).supplierName?.toLowerCase().includes(q) ||
      ((r as any).receiptNumber ?? '').toLowerCase().includes(q)
    );
  }, [receipts, sidebarSearch]);

  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) void refetchReceipts(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refetchReceipts]);

  const { data: detail } = useQuery<GoodsReceipt>({
    queryKey: ['goods-receipt', selectedId],
    queryFn: () => customFetch(`/api/admin/goods-receipts/${selectedId}`),
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

  // Open orders for selected supplier
  const { data: openOrders = [] } = useQuery<PurchaseOrder[]>({
    queryKey: ['open-orders', formSupplierId],
    queryFn: () => customFetch(`/api/admin/purchase-orders?supplierId=${formSupplierId}&status=confirmed`),
    enabled: !!formSupplierId,
  });

  const { data: orderDetail } = useQuery<PurchaseOrder & { items: PurchaseOrderItem[] }>({
    queryKey: ['purchase-order', formOrderId],
    queryFn: () => customFetch(`/api/admin/purchase-orders/${formOrderId}`),
    enabled: !!formOrderId,
  });

  // Prefill lines from order
  const handleLoadFromOrder = () => {
    if (!orderDetail?.items) return;
    setLines(orderDetail.items.map(item => ({
      ingredientId: item.ingredientId,
      qtyReceived: item.quantity,
      qtyRejected: '0',
      unitPrice: item.unitPrice,
      lotNumber: '',
      expiryDate: '',
      temperature: '',
      incidents: '',
    })));
    toast.success('Líneas cargadas del pedido');
  };

  const createReceipt = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      customFetch('/api/admin/goods-receipts', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goods-receipts'] });
      toast.success('Albarán registrado y stock actualizado');
      setShowForm(false);
      setLines([]);
      setFormOrderId('');
      setFormSupplierId('');
      setDeviationWarning(null);
      setForceDeviation(false);
    },
    onError: (e: any) => {
      const body = e?.data ?? e?.response ?? {};
      if ((e?.status === 422 || e?.statusCode === 422) && body?.error === 'price_deviation') {
        setDeviationWarning(body);
        return;
      }
      toast.error(e?.message ?? 'Error al registrar albarán');
    },
  });

  function addLine() {
    setLines(prev => [...prev, { ingredientId: '', qtyReceived: '0', qtyRejected: '0', unitPrice: '0', lotNumber: '', expiryDate: '', temperature: '', incidents: '' }]);
  }

  function updateLine(idx: number, field: keyof ReceiptLineForm, value: string) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx));
  }

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (lines.length === 0) { toast.error('Añade al menos una línea'); return; }
    createReceipt.mutate({
      orderId: formOrderId || null,
      supplierId: formSupplierId,
      receiptNumber: fd.get('receiptNumber') || null,
      receiptDate: fd.get('receiptDate') || null,
      incidents: fd.get('incidents') || null,
      forceOnPriceDeviation: forceDeviation,
      items: lines.map(l => ({
        ingredientId: l.ingredientId,
        qtyReceived: l.qtyReceived,
        qtyRejected: l.qtyRejected || '0',
        unitPrice: l.unitPrice,
        lotNumber: l.lotNumber || null,
        expiryDate: l.expiryDate || null,
        temperature: l.temperature || null,
        incidents: l.incidents || null,
      })),
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 h-14 border-b border-border bg-card/80 backdrop-blur">
        <button onClick={() => setLocation('/admin')} className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Recepción de mercancía</h1>
        <button onClick={() => setShowForm(true)} className="ml-auto px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Nuevo albarán
        </button>
      </header>

      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left: receipt list */}
        <aside className="w-72 border-r border-border overflow-y-auto shrink-0 flex flex-col">
          <div className="p-2 border-b border-border shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                value={sidebarSearch}
                autoFocus
                onChange={e => setSidebarSearch(e.target.value)}
                placeholder="Buscar proveedor o nº albarán…"
                className="w-full pl-8 pr-6 py-1.5 text-xs bg-secondary rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {sidebarSearch && (
                <button onClick={() => setSidebarSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          {isLoading ? <p className="p-4 text-sm text-muted-foreground">Cargando...</p> :
            filteredReceipts.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Sin albaranes</p> :
            filteredReceipts.map(r => (
              <button key={r.id} onClick={() => setSelectedId(r.id)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 ${selectedId === r.id ? 'bg-muted' : ''}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm truncate">{r.supplierName}</span>
                  <span className="text-xs text-muted-foreground">{new Date(r.receiptDate).toLocaleDateString('es-ES')}</span>
                </div>
                {r.receiptNumber && <p className="text-xs text-muted-foreground">Albarán: {r.receiptNumber}</p>}
                <p className="text-xs text-muted-foreground">{parseFloat(r.totalAmount ?? '0').toFixed(2)} €</p>
              </button>
            ))}
        </aside>

        {/* Right: detail */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <Truck className="w-12 h-12 opacity-20" />
              <p className="text-sm">Selecciona un albarán para ver el detalle</p>
            </div>
          ) : !detail ? <p className="text-sm text-muted-foreground">Cargando...</p> : (
            <div className="max-w-3xl">
              <div className="mb-6">
                <h2 className="text-xl font-bold">{detail.supplierName}</h2>
                <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                  {detail.receiptNumber && <span>Albarán nº {detail.receiptNumber}</span>}
                  <span>{new Date(detail.receiptDate).toLocaleDateString('es-ES')}</span>
                  <span className="font-medium text-foreground">{parseFloat(detail.totalAmount ?? '0').toFixed(2)} €</span>
                </div>
                {detail.incidents && (
                  <div className="mt-2 p-2 bg-amber-950 border border-amber-800 rounded text-xs text-amber-300 flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {detail.incidents}
                  </div>
                )}
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">Ingrediente</th>
                      <th className="px-3 py-2 text-right">Pedido</th>
                      <th className="px-3 py-2 text-right">Recibido</th>
                      <th className="px-3 py-2 text-right">Rechazado</th>
                      <th className="px-3 py-2 text-right">P.Unit.</th>
                      <th className="px-3 py-2 text-left">Lote/Caducidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(detail.items ?? []).length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Sin líneas</td></tr>
                    ) : (detail.items ?? []).map(item => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{item.ingredientName} <span className="text-muted-foreground font-normal text-xs">/{item.ingredientUnit}</span></td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{parseFloat(item.qtyOrdered ?? '0').toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-green-400 font-medium">{parseFloat(item.qtyReceived).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-red-400">{parseFloat(item.qtyRejected ?? '0').toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{parseFloat(item.unitPrice).toFixed(4)} €</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {item.lotNumber && <span className="font-mono">{item.lotNumber}</span>}
                          {item.expiryDate && <span className="ml-1">· cad. {new Date(item.expiryDate).toLocaleDateString('es-ES')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* New receipt modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h2 className="font-semibold flex items-center gap-2"><ClipboardCheck className="w-4 h-4" /> Registrar albarán</h2>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
            </div>

            {deviationWarning && (
              <div className="mx-5 mt-4 p-3 bg-amber-950 border border-amber-800 rounded-lg text-sm text-amber-300">
                <p className="font-semibold flex items-center gap-1.5 mb-2"><AlertTriangle className="w-4 h-4" /> Desviación de precio detectada</p>
                {deviationWarning.deviations?.map((d: any) => (
                  <p key={d.ingredientId} className="text-xs">• {d.ingredientId}: pedido {d.ordered.toFixed(4)} € → recibido {d.received.toFixed(4)} € ({d.pct}%)</p>
                ))}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setForceDeviation(true); setDeviationWarning(null); }} className="px-3 py-1 bg-amber-800 text-amber-200 rounded text-xs">Confirmar igualmente</button>
                  <button onClick={() => setDeviationWarning(null)} className="px-3 py-1 border border-amber-800 text-amber-300 rounded text-xs">Corregir precios</button>
                </div>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto">
              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Proveedor *</label>
                    <select value={formSupplierId} onChange={e => { setFormSupplierId(e.target.value); setFormOrderId(''); setLines([]); }} required
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm">
                      <option value="">Seleccionar...</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.commercialName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Pedido vinculado (opcional)</label>
                    <div className="flex gap-1.5">
                      <select value={formOrderId} onChange={e => setFormOrderId(e.target.value)} disabled={!formSupplierId}
                        className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm">
                        <option value="">Sin pedido</option>
                        {openOrders.map(o => <option key={o.id} value={o.id}>{new Date(o.orderDate).toLocaleDateString('es-ES')} · {parseFloat(o.totalAmount ?? '0').toFixed(2)} €</option>)}
                      </select>
                      {formOrderId && <button type="button" onClick={handleLoadFromOrder} className="px-2 bg-muted border border-border rounded-lg text-xs hover:bg-muted/70 whitespace-nowrap">Cargar</button>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nº Albarán</label>
                    <input name="receiptNumber" className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" placeholder="ALB-2024-001" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Fecha recepción</label>
                    <input name="receiptDate" type="datetime-local" className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Incidencias generales</label>
                  <input name="incidents" className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" placeholder="Sin incidencias" />
                </div>

                {/* Lines */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-muted-foreground">Líneas de recepción</label>
                    <button type="button" onClick={addLine} className="text-xs px-2 py-1 bg-muted border border-border rounded hover:bg-muted/70 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Añadir línea
                    </button>
                  </div>
                  <div className="space-y-2">
                    {lines.length === 0 && <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded">Sin líneas. Añade o carga del pedido.</p>}
                    {lines.map((line, idx) => (
                      <div key={idx} className="bg-muted/50 border border-border rounded-lg p-3 space-y-2">
                        <div className="flex gap-2">
                          <select value={line.ingredientId} onChange={e => updateLine(idx, 'ingredientId', e.target.value)} required
                            className="flex-1 bg-muted border border-border rounded px-2 py-1.5 text-xs">
                            <option value="">Ingrediente...</option>
                            {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                          </select>
                          <button type="button" onClick={() => removeLine(idx)} className="p-1 text-muted-foreground hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground">Recibido *</label>
                            <input type="number" step="0.0001" value={line.qtyReceived} onChange={e => updateLine(idx, 'qtyReceived', e.target.value)} required
                              className="w-full bg-muted border border-border rounded px-2 py-1 text-xs" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Rechazado</label>
                            <input type="number" step="0.0001" value={line.qtyRejected} onChange={e => updateLine(idx, 'qtyRejected', e.target.value)}
                              className="w-full bg-muted border border-border rounded px-2 py-1 text-xs" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">P.Unit. (€)</label>
                            <input type="number" step="0.0001" value={line.unitPrice} onChange={e => updateLine(idx, 'unitPrice', e.target.value)} required
                              className="w-full bg-muted border border-border rounded px-2 py-1 text-xs" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Temperatura</label>
                            <input type="number" step="0.1" value={line.temperature} onChange={e => updateLine(idx, 'temperature', e.target.value)} placeholder="°C"
                              className="w-full bg-muted border border-border rounded px-2 py-1 text-xs" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground">Nº Lote</label>
                            <input value={line.lotNumber} onChange={e => updateLine(idx, 'lotNumber', e.target.value)}
                              className="w-full bg-muted border border-border rounded px-2 py-1 text-xs" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Fecha caducidad</label>
                            <input type="date" value={line.expiryDate} onChange={e => updateLine(idx, 'expiryDate', e.target.value)}
                              className="w-full bg-muted border border-border rounded px-2 py-1 text-xs" />
                          </div>
                        </div>
                        {line.incidents && <p className="text-[10px] text-amber-400">⚠ {line.incidents}</p>}
                        <input value={line.incidents} onChange={e => updateLine(idx, 'incidents', e.target.value)} placeholder="Incidencias de esta línea..."
                          className="w-full bg-muted border border-border rounded px-2 py-1 text-[10px]" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-border flex justify-end gap-2 shrink-0">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-border hover:bg-muted text-sm">Cancelar</button>
                <button type="submit" disabled={!formSupplierId || lines.length === 0 || createReceipt.isPending}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm disabled:opacity-50 flex items-center gap-2">
                  {createReceipt.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} Confirmar recepción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
