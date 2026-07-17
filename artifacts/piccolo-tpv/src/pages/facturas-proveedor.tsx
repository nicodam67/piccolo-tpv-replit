import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { customFetch } from '@workspace/api-client-react';
import type { SupplierInvoice } from '@workspace/api-client-react';
import { ArrowLeft, Plus, FileText, X, CheckCircle, Clock, AlertCircle } from 'lucide-react';

type Supplier = { id: string; commercialName: string };
type Receipt = { id: string; receiptNumber: string | null; receiptDate: string; totalAmount: string | null };

const PAYMENT_COLORS: Record<string, string> = {
  unpaid: 'bg-amber-900 text-amber-300',
  paid: 'bg-green-900 text-green-300',
  overdue: 'bg-red-900 text-red-300',
};

const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  unpaid: <Clock className="w-3.5 h-3.5" />,
  paid: <CheckCircle className="w-3.5 h-3.5" />,
  overdue: <AlertCircle className="w-3.5 h-3.5" />,
};

export default function FacturasProveedor() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [formSupplierId, setFormSupplierId] = useState('');
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([]);

  const { data: invoices = [], isLoading } = useQuery<SupplierInvoice[]>({
    queryKey: ['supplier-invoices', filterStatus],
    queryFn: () => customFetch(`/api/admin/supplier-invoices${filterStatus ? `?paymentStatus=${filterStatus}` : ''}`),
  });

  const { data: detail } = useQuery<SupplierInvoice>({
    queryKey: ['supplier-invoice', selectedId],
    queryFn: () => customFetch(`/api/admin/supplier-invoices/${selectedId}`),
    enabled: !!selectedId,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers-active'],
    queryFn: () => customFetch('/api/admin/suppliers?active=true'),
  });

  const { data: receipts = [] } = useQuery<Receipt[]>({
    queryKey: ['goods-receipts-for-invoicing', formSupplierId],
    queryFn: () => customFetch(`/api/admin/goods-receipts?supplierId=${formSupplierId}`),
    enabled: !!formSupplierId,
  });

  const createInvoice = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      customFetch<{ id: string }>('/api/admin/supplier-invoices', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ['supplier-invoices'] });
      toast.success('Factura registrada');
      setShowForm(false);
      setSelectedId(inv.id);
      setFormSupplierId('');
      setSelectedReceiptIds([]);
    },
    onError: (e: any) => toast.error(e.message ?? 'Error'),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) =>
      customFetch(`/api/admin/supplier-invoices/${id}`, { method: 'PATCH', body: JSON.stringify({ paymentStatus: 'paid' }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-invoices'] });
      qc.invalidateQueries({ queryKey: ['supplier-invoice', selectedId] });
      toast.success('Factura marcada como pagada');
    },
  });

  const deleteInvoice = useMutation({
    mutationFn: (id: string) => customFetch(`/api/admin/supplier-invoices/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier-invoices'] }); toast.success('Factura eliminada'); setSelectedId(null); },
  });

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const taxable = parseFloat(fd.get('taxableBase') as string) || 0;
    const vatPct = parseFloat(fd.get('vatPct') as string) || 0;
    const vatAmount = taxable * vatPct / 100;
    const total = taxable + vatAmount;
    createInvoice.mutate({
      supplierId: formSupplierId,
      invoiceNumber: fd.get('invoiceNumber'),
      invoiceDate: fd.get('invoiceDate'),
      taxableBase: taxable.toFixed(4),
      vatAmount: vatAmount.toFixed(4),
      total: total.toFixed(4),
      dueDate: fd.get('dueDate') || null,
      notes: fd.get('notes') || null,
      receiptIds: selectedReceiptIds,
    });
  }

  function toggleReceipt(id: string) {
    setSelectedReceiptIds(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 h-14 border-b border-border bg-card/80 backdrop-blur">
        <button onClick={() => setLocation('/admin')} className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Facturas de proveedor</h1>
        <button onClick={() => setShowForm(true)} className="ml-auto px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Nueva factura
        </button>
      </header>

      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left */}
        <aside className="w-72 border-r border-border flex flex-col shrink-0">
          <div className="p-2 border-b border-border">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-sm">
              <option value="">Todas</option>
              <option value="unpaid">Pendiente</option>
              <option value="overdue">Vencida</option>
              <option value="paid">Pagada</option>
            </select>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? <p className="p-4 text-sm text-muted-foreground">Cargando...</p> :
              invoices.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Sin facturas</p> :
              invoices.map(inv => (
                <button key={inv.id} onClick={() => setSelectedId(inv.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 ${selectedId === inv.id ? 'bg-muted' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">{inv.supplierName}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${PAYMENT_COLORS[inv.paymentStatus] ?? ''}`}>
                      {PAYMENT_ICONS[inv.paymentStatus]} {inv.paymentStatus === 'paid' ? 'Pagada' : inv.paymentStatus === 'overdue' ? 'Vencida' : 'Pendiente'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Nº {inv.invoiceNumber}</p>
                  <div className="flex justify-between text-xs mt-0.5">
                    <span className="text-muted-foreground">{new Date(inv.invoiceDate).toLocaleDateString('es-ES')}</span>
                    <span className="font-medium text-foreground">{parseFloat(inv.total).toFixed(2)} €</span>
                  </div>
                </button>
              ))}
          </div>
        </aside>

        {/* Right: detail */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <FileText className="w-12 h-12 opacity-20" />
              <p className="text-sm">Selecciona una factura</p>
            </div>
          ) : !detail ? <p className="text-sm text-muted-foreground">Cargando...</p> : (
            <div className="max-w-2xl">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold">{detail.supplierName}</h2>
                  <p className="text-muted-foreground text-sm">Factura nº {detail.invoiceNumber} · {new Date(detail.invoiceDate).toLocaleDateString('es-ES')}</p>
                </div>
                <div className="flex gap-2">
                  {detail.paymentStatus !== 'paid' && (
                    <button onClick={() => markPaid.mutate(detail.id)}
                      className="px-3 py-1.5 rounded-lg bg-green-900 text-green-300 hover:bg-green-800 text-sm flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> Marcar pagada
                    </button>
                  )}
                  <button onClick={() => { if (confirm('¿Eliminar factura?')) deleteInvoice.mutate(detail.id); }}
                    className="px-3 py-1.5 rounded-lg border border-red-800 text-red-400 hover:bg-red-950 text-sm">
                    Eliminar
                  </button>
                </div>
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-muted rounded-lg p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Base imponible</p>
                  <p className="text-xl font-bold">{parseFloat(detail.taxableBase).toFixed(2)} €</p>
                </div>
                <div className="bg-muted rounded-lg p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">IVA</p>
                  <p className="text-xl font-bold">{parseFloat(detail.vatAmount).toFixed(2)} €</p>
                </div>
                <div className="bg-primary/20 border border-primary/40 rounded-lg p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Total</p>
                  <p className="text-xl font-bold text-primary">{parseFloat(detail.total).toFixed(2)} €</p>
                </div>
              </div>

              {detail.dueDate && (
                <p className="text-sm text-muted-foreground mb-4">Vencimiento: {new Date(detail.dueDate).toLocaleDateString('es-ES')}</p>
              )}

              {/* Linked receipts */}
              {(detail.receipts ?? []).length > 0 && (
                <div className="mb-4">
                  <h3 className="font-medium text-sm mb-2">Albaranes vinculados</h3>
                  <div className="space-y-1">
                    {detail.receipts!.map(r => (
                      <div key={r.id} className="flex justify-between text-sm bg-muted rounded p-2">
                        <span>{r.receiptNumber ?? '(sin número)'} · {new Date(r.receiptDate).toLocaleDateString('es-ES')}</span>
                        <span className="font-medium">{parseFloat(r.totalAmount ?? '0').toFixed(2)} €</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.notes && <p className="text-sm text-muted-foreground">{detail.notes}</p>}
            </div>
          )}
        </main>
      </div>

      {/* Create invoice modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold">Nueva factura de proveedor</h2>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleFormSubmit} className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Proveedor *</label>
                <select value={formSupplierId} onChange={e => { setFormSupplierId(e.target.value); setSelectedReceiptIds([]); }} required
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="">Seleccionar...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.commercialName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nº Factura *</label>
                  <input name="invoiceNumber" required className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Fecha factura *</label>
                  <input name="invoiceDate" type="date" required className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Base imponible (€) *</label>
                  <input name="taxableBase" type="number" step="0.01" required className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">IVA (%)</label>
                  <input name="vatPct" type="number" step="0.01" defaultValue="10" className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Fecha vencimiento</label>
                <input name="dueDate" type="date" className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />
              </div>

              {formSupplierId && receipts.length > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Vincular albaranes</label>
                  <div className="space-y-1 max-h-32 overflow-y-auto border border-border rounded-lg p-2">
                    {receipts.map(r => (
                      <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-2 py-1">
                        <input type="checkbox" checked={selectedReceiptIds.includes(r.id)} onChange={() => toggleReceipt(r.id)} />
                        <span>{r.receiptNumber ?? '(sin nº)'} · {new Date(r.receiptDate).toLocaleDateString('es-ES')} · {parseFloat(r.totalAmount ?? '0').toFixed(2)} €</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notas</label>
                <textarea name="notes" rows={2} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-border hover:bg-muted text-sm">Cancelar</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm">Guardar factura</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
