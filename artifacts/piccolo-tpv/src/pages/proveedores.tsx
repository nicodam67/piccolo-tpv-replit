import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { customFetch } from '@workspace/api-client-react';
import type { Supplier, SupplierWithCatalogue, SupplierCatalogItem } from '@workspace/api-client-react';
import { ArrowLeft, Plus, Pencil, Trash2, Star, Package, ChevronRight, Search, X, Loader2 } from 'lucide-react';

const API = (path: string) => `/api${path}`;

export default function Proveedores() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showCatalogueForm, setShowCatalogueForm] = useState(false);
  const [editingCatalogItem, setEditingCatalogItem] = useState<SupplierCatalogItem | null>(null);

  const { data: suppliers = [], isLoading, refetch: refetchSuppliers } = useQuery<Supplier[]>({
    queryKey: ['suppliers', search],
    queryFn: () => customFetch(`/api/admin/suppliers?search=${search}`),
  });

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    if (selectedId) qc.invalidateQueries({ queryKey: ['supplier', selectedId] });
  }, [qc, selectedId]);

  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) invalidateAll(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [invalidateAll]);

  void refetchSuppliers;

  const { data: detail } = useQuery<SupplierWithCatalogue>({
    queryKey: ['supplier', selectedId],
    queryFn: () => customFetch(`/api/admin/suppliers/${selectedId}`),
    enabled: !!selectedId,
  });

  const { data: ingredients = [] } = useQuery<{ id: string; name: string; unit: string }[]>({
    queryKey: ['ingredients-simple'],
    queryFn: () => customFetch('/api/admin/ingredients'),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      customFetch('/api/admin/suppliers', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Proveedor creado'); setShowForm(false); setEditingSupplier(null); },
    onError: (e: any) => toast.error(e.message ?? 'Error al guardar'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      customFetch(`/api/admin/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); qc.invalidateQueries({ queryKey: ['supplier', selectedId] }); toast.success('Proveedor actualizado'); setShowForm(false); setEditingSupplier(null); },
    onError: (e: any) => toast.error(e.message ?? 'Error al guardar'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => customFetch(`/api/admin/suppliers/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Proveedor desactivado'); setSelectedId(null); },
  });

  const addCatalogItem = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      customFetch(`/api/admin/suppliers/${selectedId}/catalogue`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier', selectedId] }); toast.success('Ítem añadido'); setShowCatalogueForm(false); setEditingCatalogItem(null); },
    onError: (e: any) => toast.error(e.message ?? 'Error'),
  });

  const updateCatalogItem = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      customFetch(`/api/admin/supplier-catalogue/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier', selectedId] }); toast.success('Ítem actualizado'); setShowCatalogueForm(false); setEditingCatalogItem(null); },
  });

  const deleteCatalogItem = useMutation({
    mutationFn: (id: string) => customFetch(`/api/admin/supplier-catalogue/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier', selectedId] }); toast.success('Ítem eliminado'); },
  });

  const setPreferred = useMutation({
    mutationFn: (itemId: string) => customFetch(`/api/admin/supplier-catalogue/${itemId}/set-preferred`, { method: 'PATCH' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier', selectedId] }); toast.success('Proveedor preferido actualizado'); },
  });

  function handleSupplierSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {};
    fd.forEach((v, k) => { data[k] = (v as string).trim() || null; });
    if (editingSupplier) updateMutation.mutate({ id: editingSupplier.id, data });
    else createMutation.mutate(data);
  }

  function handleCatalogSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {};
    fd.forEach((v, k) => { data[k] = (v as string).trim() || null; });
    if (editingCatalogItem) updateCatalogItem.mutate({ id: editingCatalogItem.id, data });
    else addCatalogItem.mutate(data);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 h-14 border-b border-border bg-card/80 backdrop-blur">
        <button onClick={() => setLocation('/admin')} className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Proveedores</h1>
      </header>

      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left panel: supplier list */}
        <aside className="w-72 border-r border-border flex flex-col shrink-0">
          <div className="p-3 border-b border-border flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." autoFocus className="bg-transparent flex-1 outline-none min-w-0" />
              {search && (
                <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button onClick={() => { setShowForm(true); setEditingSupplier(null); }} className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Cargando...</div>
            ) : suppliers.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Sin proveedores</div>
            ) : suppliers.map(s => (
              <button key={s.id} onClick={() => setSelectedId(s.id)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 flex items-center gap-3 ${selectedId === s.id ? 'bg-muted' : ''}`}>
                <div className={`w-2 h-2 rounded-full ${s.active ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{s.commercialName}</div>
                  {s.phone && <div className="text-xs text-muted-foreground">{s.phone}</div>}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </aside>

        {/* Right panel: detail */}
        <main className="flex-1 overflow-y-auto">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <Package className="w-12 h-12 opacity-20" />
              <p className="text-sm">Selecciona un proveedor</p>
            </div>
          ) : !detail ? (
            <div className="p-6 text-sm text-muted-foreground">Cargando...</div>
          ) : (
            <div className="p-6 max-w-3xl">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold">{detail.commercialName}</h2>
                  {detail.legalName && <p className="text-muted-foreground text-sm">{detail.legalName} · {detail.nif}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingSupplier(detail); setShowForm(true); }}
                    className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-sm flex items-center gap-1.5">
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button onClick={() => deactivateMutation.mutate(detail.id)}
                    disabled={deactivateMutation.isPending}
                    className="px-3 py-1.5 rounded-lg border border-red-800 text-red-400 hover:bg-red-950 text-sm flex items-center gap-1.5 disabled:opacity-60">
                    {deactivateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Desactivar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
                {detail.email && <InfoRow label="Email" value={detail.email} />}
                {detail.phone && <InfoRow label="Teléfono" value={detail.phone} />}
                {detail.contactPerson && <InfoRow label="Contacto" value={detail.contactPerson} />}
                {detail.paymentTerms && <InfoRow label="Condiciones pago" value={detail.paymentTerms} />}
                {detail.deliveryDays && <InfoRow label="Días entrega" value={detail.deliveryDays} />}
                {detail.leadTimeDays != null && <InfoRow label="Lead time" value={`${detail.leadTimeDays} días`} />}
                {detail.minOrder && <InfoRow label="Pedido mínimo" value={`${detail.minOrder} €`} />}
                {detail.address && <InfoRow label="Dirección" value={detail.address} />}
              </div>

              {/* Catalogue */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Catálogo de productos ({detail.catalogue.length})</h3>
                <button onClick={() => { setShowCatalogueForm(true); setEditingCatalogItem(null); }}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-1.5 hover:bg-primary/90">
                  <Plus className="w-3.5 h-3.5" /> Añadir
                </button>
              </div>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">Ingrediente</th>
                      <th className="px-3 py-2 text-left">Formato</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                      <th className="px-3 py-2 text-right">IVA%</th>
                      <th className="px-3 py-2 text-center">Pref.</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {detail.catalogue.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Sin productos en catálogo</td></tr>
                    ) : detail.catalogue.map(item => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{item.ingredientName} <span className="text-muted-foreground font-normal">/ {item.ingredientUnit}</span></td>
                        <td className="px-3 py-2 text-muted-foreground">{item.purchaseFormat ?? '-'}</td>
                        <td className="px-3 py-2 text-right">{parseFloat(item.price).toFixed(4)} €</td>
                        <td className="px-3 py-2 text-right">{item.vatPct ?? 10}%</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => setPreferred.mutate(item.id)}
                            className={`p-1 rounded ${item.isPreferred ? 'text-amber-400' : 'text-muted-foreground hover:text-amber-400'}`}>
                            <Star className="w-4 h-4" fill={item.isPreferred ? 'currentColor' : 'none'} />
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => { setEditingCatalogItem(item); setShowCatalogueForm(true); }} className="p-1 text-muted-foreground hover:text-foreground mr-1"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteCatalogItem.mutate(item.id)} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
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

      {/* Supplier form modal */}
      {showForm && (
        <Modal title={editingSupplier ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={() => { setShowForm(false); setEditingSupplier(null); }}>
          <form onSubmit={handleSupplierSubmit} className="space-y-3">
            <Field name="commercialName" label="Nombre comercial *" defaultValue={editingSupplier?.commercialName} required />
            <Field name="legalName" label="Razón social" defaultValue={editingSupplier?.legalName ?? ''} />
            <Field name="nif" label="NIF/CIF" defaultValue={editingSupplier?.nif ?? ''} />
            <Field name="email" label="Email" type="email" defaultValue={editingSupplier?.email ?? ''} />
            <Field name="phone" label="Teléfono" defaultValue={editingSupplier?.phone ?? ''} />
            <Field name="contactPerson" label="Persona de contacto" defaultValue={editingSupplier?.contactPerson ?? ''} />
            <Field name="paymentTerms" label="Condiciones de pago" defaultValue={editingSupplier?.paymentTerms ?? ''} />
            <Field name="deliveryDays" label="Días de entrega" placeholder="lunes,miercoles,viernes" defaultValue={editingSupplier?.deliveryDays ?? ''} />
            <div className="grid grid-cols-2 gap-3">
              <Field name="minOrder" label="Pedido mínimo (€)" type="number" step="0.01" defaultValue={editingSupplier?.minOrder ?? '0'} />
              <Field name="leadTimeDays" label="Lead time (días)" type="number" defaultValue={String(editingSupplier?.leadTimeDays ?? 1)} />
            </div>
            <Field name="address" label="Dirección" defaultValue={editingSupplier?.address ?? ''} />
            <Field name="notes" label="Notas" defaultValue={editingSupplier?.notes ?? ''} multiline />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setShowForm(false); setEditingSupplier(null); }} className="px-4 py-2 rounded-lg border border-border hover:bg-muted text-sm">Cancelar</button>
              <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm disabled:opacity-60 flex items-center gap-2">
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingSupplier ? 'Guardar cambios' : 'Crear proveedor'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Catalogue item form modal */}
      {showCatalogueForm && (
        <Modal title={editingCatalogItem ? 'Editar ítem de catálogo' : 'Añadir producto al catálogo'} onClose={() => { setShowCatalogueForm(false); setEditingCatalogItem(null); }}>
          <form onSubmit={handleCatalogSubmit} className="space-y-3">
            {!editingCatalogItem && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ingrediente *</label>
                <select name="ingredientId" required className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="">Seleccionar...</option>
                  {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field name="supplierRef" label="Ref. proveedor" defaultValue={editingCatalogItem?.supplierRef ?? ''} />
              <Field name="purchaseFormat" label="Formato de compra" placeholder="Caja 6 kg" defaultValue={editingCatalogItem?.purchaseFormat ?? ''} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field name="price" label="Precio (€) *" type="number" step="0.0001" defaultValue={editingCatalogItem?.price ?? '0'} required />
              <Field name="unitsPerPack" label="Uds/pack" type="number" step="0.0001" defaultValue={editingCatalogItem?.unitsPerPack ?? '1'} />
              <Field name="purchaseUnit" label="Unidad" defaultValue={editingCatalogItem?.purchaseUnit ?? 'ud'} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field name="vatPct" label="IVA (%)" type="number" step="0.01" defaultValue={editingCatalogItem?.vatPct ?? '10'} />
              <Field name="discount" label="Descuento (%)" type="number" step="0.01" defaultValue={editingCatalogItem?.discount ?? '0'} />
            </div>
            <Field name="transportCost" label="Coste transporte (€)" type="number" step="0.0001" defaultValue={editingCatalogItem?.transportCost ?? '0'} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setShowCatalogueForm(false); setEditingCatalogItem(null); }} className="px-4 py-2 rounded-lg border border-border hover:bg-muted text-sm">Cancelar</button>
              <button type="submit" disabled={updateCatalogItem.isPending}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm disabled:opacity-60 flex items-center gap-2">
                {updateCatalogItem.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingCatalogItem ? 'Guardar' : 'Añadir'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium mt-0.5">{value}</dd>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ name, label, type = 'text', step, defaultValue, required, placeholder, multiline }: {
  name: string; label: string; type?: string; step?: string; defaultValue?: string; required?: boolean; placeholder?: string; multiline?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      {multiline ? (
        <textarea name={name} defaultValue={defaultValue} placeholder={placeholder} rows={3}
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm resize-none outline-none focus:border-primary/50" />
      ) : (
        <input name={name} type={type} step={step} defaultValue={defaultValue} required={required} placeholder={placeholder}
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50" />
      )}
    </div>
  );
}
