import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAdminProducts,
  useGetAdminCategories,
  useGetAdminModifierGroups,
  useCreateAdminProduct,
  useUpdateAdminProduct,
  useDeleteAdminProduct,
  useCreateProductFormatFull,
  useUpdateProductFormatFull,
  useDeleteProductFormat,
  useAssignProductModifierGroups,
  useGetProductRecipe,
  useCreateRecipeLine,
  useUpdateRecipeLine,
  useDeleteRecipeLine,
  useGetAdminIngredients,
  useGetAdminSubrecipes,
  useImportProducts,
  downloadProductExport,
  getGetAdminProductsQueryKey,
  getGetProductRecipeQueryKey,
} from '@workspace/api-client-react';
import type { AdminProduct, AdminCategory, AdminModifierGroup, ProductFormat, RecipeLine, Ingredient, Subrecipe } from '@workspace/api-client-react';
import {
  ArrowLeft, Package, Plus, Search, X, Check, Pencil, Trash2,
  ChevronRight, Eye, EyeOff, Tag, Sliders, ImageIcon, Save,
  ToggleLeft, ToggleRight, CircleOff, CircleCheck,
  FlaskConical, TrendingUp, Download, Upload, FileDown, FileUp,
  RefreshCw, ShieldCheck,
} from 'lucide-react';

const TAX_RATES = [4, 10, 21] as const;
const PREP_ZONES = ['cocina', 'barra', 'frío', 'postres', 'sala'];

const RATE_COLOR: Record<number, string> = {
  4: 'bg-green-500/15 text-green-400 border-green-500/30',
  10: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  21: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <button onClick={() => onChange(!value)} className="flex items-center gap-1.5 text-sm">
        {value
          ? <ToggleRight size={20} className="text-primary" />
          : <ToggleLeft size={20} className="text-muted-foreground" />}
        <span className={value ? 'text-foreground font-semibold' : 'text-muted-foreground'}>{value ? 'Sí' : 'No'}</span>
      </button>
    </div>
  );
}

// ── Product card in grid ──────────────────────────────────────────────────────
function ProductCard({ product, onEdit }: { product: AdminProduct; onEdit: () => void }) {
  const margin = product.cost && product.price
    ? ((parseFloat(product.price) - parseFloat(product.cost)) / parseFloat(product.price) * 100).toFixed(0)
    : null;

  return (
    <button
      onClick={onEdit}
      className={`group relative text-left rounded-xl border p-3.5 flex flex-col gap-2 transition-all hover:border-primary/50 hover:shadow-lg ${!product.active ? 'opacity-50' : ''}`}
      style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
    >
      {!product.active && (
        <span className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-secondary/80 text-muted-foreground border border-border/60">
          Archivado
        </span>
      )}
      {product.imageUrl && (
        <div className="w-full h-20 rounded-lg overflow-hidden bg-secondary/30">
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{product.name}</p>
            {product.internalCode && <p className="text-[10px] text-muted-foreground font-mono">{product.internalCode}</p>}
          </div>
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border shrink-0 ${RATE_COLOR[product.taxRate] ?? ''}`}>
            {product.taxRate}%
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-base font-black">{parseFloat(product.price).toFixed(2)}€</span>
        <div className="flex items-center gap-1.5">
          {margin && <span className="text-[10px] text-muted-foreground">M:{margin}%</span>}
          <div className="flex items-center gap-0.5">
            {product.tpvVisible ? <Eye size={11} className="text-muted-foreground" /> : <EyeOff size={11} className="text-muted-foreground/30" />}
            {product.formats.length > 0 && <span className="text-[9px] text-muted-foreground ml-0.5">{product.formats.length}f</span>}
            {product.modifierGroups.length > 0 && <Sliders size={11} className="text-muted-foreground ml-0.5" />}
          </div>
        </div>
      </div>
      <ChevronRight size={12} className="absolute right-2.5 bottom-3.5 text-muted-foreground opacity-0 group-hover:opacity-50" />
    </button>
  );
}

// ── Format row ────────────────────────────────────────────────────────────────
function FormatRow({ fmt, productTaxRate, onUpdate, onDelete }: {
  fmt: ProductFormat & { cost?: string | null; prepTime?: number | null; kdsDestination?: string | null };
  productTaxRate: number;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(fmt.name);
  const [price, setPrice] = useState(fmt.price);
  const [cost, setCost] = useState(fmt.cost ?? '');
  const [taxRate, setTaxRate] = useState<number | null>(fmt.taxRate ?? null);

  if (!editing) return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{fmt.name}</span>
          {fmt.taxRate == null && <span className="text-[9px] text-muted-foreground/50 italic">IVA {productTaxRate}%</span>}
          {fmt.taxRate != null && <span className={`text-[9px] px-1 rounded border ${RATE_COLOR[fmt.taxRate] ?? ''}`}>{fmt.taxRate}%</span>}
        </div>
        <span className="text-xs text-muted-foreground font-mono">{parseFloat(fmt.price).toFixed(2)}€{fmt.cost ? ` · coste ${parseFloat(fmt.cost).toFixed(2)}€` : ''}</span>
      </div>
      <button onClick={() => setEditing(true)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground">
        <Pencil size={12} />
      </button>
      <button onClick={() => onDelete(fmt.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
        <Trash2 size={12} />
      </button>
    </div>
  );

  return (
    <div className="p-3 rounded-lg border border-primary bg-secondary/10 space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre"
        autoFocus
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
        className="w-full bg-secondary rounded-lg px-3 py-1.5 text-sm outline-none" />
      <div className="flex gap-2">
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="PVP €" className="flex-1 bg-secondary rounded-lg px-3 py-1.5 text-sm outline-none" />
        <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Coste €" className="flex-1 bg-secondary rounded-lg px-3 py-1.5 text-sm outline-none" />
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-muted-foreground">IVA:</span>
        {TAX_RATES.map((r) => (
          <button key={r} onClick={() => setTaxRate(taxRate === r ? null : r)}
            className={`text-xs px-2 py-0.5 rounded-lg border transition-all ${taxRate === r ? RATE_COLOR[r] : 'bg-secondary/30 text-muted-foreground border-border'}`}>
            {r}%
          </button>
        ))}
        {taxRate != null && <button onClick={() => setTaxRate(null)} className="text-[10px] text-muted-foreground hover:text-foreground">heredar</button>}
      </div>
      <div className="flex gap-2">
        <button onClick={() => { onUpdate(fmt.id, { name, price, cost: cost || null, taxRate }); setEditing(false); }}
          className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1">
          <Check size={13} /> Guardar
        </button>
        <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg bg-secondary text-sm text-muted-foreground">Cancelar</button>
      </div>
    </div>
  );
}

// ── Product edit sheet ────────────────────────────────────────────────────────
function ProductSheet({
  product,
  categories,
  modifierGroups,
  onClose,
  onSave,
  onDelete,
}: {
  product: AdminProduct | null;
  categories: AdminCategory[];
  modifierGroups: AdminModifierGroup[];
  onClose: () => void;
  onSave: () => void;
  onDelete?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const createProduct = useCreateAdminProduct();
  const updateProduct = useUpdateAdminProduct();
  const deleteProduct = useDeleteAdminProduct();
  const createFormat = useCreateProductFormatFull();
  const updateFormat = useUpdateProductFormatFull();
  const deleteFormat = useDeleteProductFormat();
  const assignGroups = useAssignProductModifierGroups();

  const isNew = !product;
  const [tab, setTab] = useState<'info' | 'formats' | 'modifiers' | 'recipe'>('info');

  // Form state
  const [name, setName] = useState(product?.name ?? '');
  const [internalCode, setInternalCode] = useState(product?.internalCode ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [price, setPrice] = useState(product?.price ?? '');
  const [cost, setCost] = useState(product?.cost ?? '');
  const [taxRate, setTaxRate] = useState<number>(product?.taxRate ?? 10);
  const [prepZone, setPrepZone] = useState(product?.prepZone ?? 'cocina');
  const [tpvVisible, setTpvVisible] = useState(product?.tpvVisible ?? true);
  const [qrVisible, setQrVisible] = useState(product?.qrVisible ?? true);
  const [deliveryVisible, setDeliveryVisible] = useState(product?.deliveryVisible ?? false);
  const [active, setActive] = useState(product?.active ?? true);
  const [allergens, setAllergens] = useState(product?.allergens ?? '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  // QR carta extra fields
  const [halfPortionPrice, setHalfPortionPrice] = useState((product as any)?.halfPortionPrice ?? '');
  const [quantity, setQuantity] = useState((product as any)?.quantity ?? '');
  const [isVegetariano, setIsVegetariano] = useState((product as any)?.isVegetariano ?? false);
  const [isVegano, setIsVegano] = useState((product as any)?.isVegano ?? false);
  const [isSinGluten, setIsSinGluten] = useState((product as any)?.isSinGluten ?? false);
  const [isPicante, setIsPicante] = useState((product as any)?.isPicante ?? false);

  // Formats state
  const [formats, setFormats] = useState(product?.formats ?? []);
  const [newFmtName, setNewFmtName] = useState('');
  const [newFmtPrice, setNewFmtPrice] = useState('');
  const [addingFmt, setAddingFmt] = useState(false);

  // Modifier groups state
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    new Set(product?.modifierGroups?.map((g) => g.groupId) ?? [])
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetAdminProductsQueryKey() });

  const margin = price && cost
    ? ((parseFloat(price) - parseFloat(cost)) / parseFloat(price) * 100).toFixed(1)
    : null;

  const handleSave = async () => {
    if (!name.trim() || !price || !categoryId) { toast.error('Nombre, categoría y precio son obligatorios'); return; }

    try {
      if (isNew) {
        await createProduct.mutateAsync({ data: { name: name.trim(), categoryId, price, cost: cost || undefined, taxRate, prepZone, tpvVisible, qrVisible, deliveryVisible, internalCode: internalCode || undefined, description: description || undefined, allergens, halfPortionPrice: halfPortionPrice || undefined, quantity: quantity || undefined, isVegetariano, isVegano, isSinGluten, isPicante } });
      } else {
        await updateProduct.mutateAsync({
          productId: product.id,
          data: { name: name.trim(), categoryId, price, cost: cost || null, taxRate, prepZone, tpvVisible, qrVisible, deliveryVisible, active, internalCode: internalCode || null, description: description || null, allergens, imageUrl: imageUrl || null, halfPortionPrice: halfPortionPrice || null, quantity: quantity || null, isVegetariano, isVegano, isSinGluten, isPicante },
        });
        // Assign modifier groups
        await assignGroups.mutateAsync({ productId: product.id, data: { modifierGroupIds: Array.from(selectedGroupIds) } });
      }
      invalidate(); onSave(); toast.success(isNew ? 'Producto creado' : 'Producto actualizado');
    } catch { toast.error('Error al guardar el producto'); }
  };

  const handleDelete = async () => {
    if (!product || !onDelete) return;
    if (!confirm(`¿Archivar "${product.name}"?`)) return;
    try {
      await deleteProduct.mutateAsync({ productId: product.id });
      invalidate(); onDelete(product.id); toast.success('Producto archivado');
    } catch { toast.error('Error al archivar'); }
  };

  const handleAddFormat = async () => {
    if (!product || !newFmtName.trim() || !newFmtPrice) return;
    try {
      const fmt = await createFormat.mutateAsync({ productId: product.id, data: { name: newFmtName, price: newFmtPrice, sortOrder: formats.length } });
      setFormats((prev) => [...prev, fmt as any]);
      setNewFmtName(''); setNewFmtPrice(''); setAddingFmt(false);
      invalidate(); toast.success('Formato añadido');
    } catch { toast.error('Error al añadir formato'); }
  };

  const handleUpdateFormat = useCallback(async (fmtId: string, data: Record<string, unknown>) => {
    if (!product) return;
    try {
      const updated = await updateFormat.mutateAsync({ formatId: fmtId, data: data as any });
      setFormats((prev) => prev.map((f) => f.id === fmtId ? { ...f, ...(updated as any) } : f));
      invalidate();
    } catch { toast.error('Error al actualizar formato'); }
  }, [product, updateFormat, invalidate]);

  const handleDeleteFormat = useCallback(async (fmtId: string) => {
    if (!product) return;
    try {
      await deleteFormat.mutateAsync({ formatId: fmtId });
      setFormats((prev) => prev.filter((f) => f.id !== fmtId));
      invalidate();
    } catch { toast.error('Error al eliminar formato'); }
  }, [product, deleteFormat, invalidate]);

  const toggleGroup = (id: string) => setSelectedGroupIds((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[92vh] flex flex-col bg-card border border-border rounded-t-2xl sm:rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sheet header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
            <X size={16} />
          </button>
          <h2 className="font-black text-base flex-1">{isNew ? 'Nuevo producto' : 'Editar producto'}</h2>
          {!isNew && product?.active && (
            <button onClick={handleDelete} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <Trash2 size={15} />
            </button>
          )}
          <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">
            <Save size={13} /> Guardar
          </button>
        </div>

        {/* Tabs (only for existing products) */}
        {!isNew && (
          <div className="flex border-b border-border shrink-0 overflow-x-auto">
            {(['info', 'formats', 'modifiers', 'recipe'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-none px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                {t === 'info' ? 'Información' : t === 'formats' ? `Formatos (${formats.length})` : t === 'modifiers' ? `Modificadores (${selectedGroupIds.size})` : '🧪 Receta'}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* ── Info tab ── */}
          {(tab === 'info' || isNew) && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground font-semibold block mb-1">Nombre *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del producto"
                    className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1">Código interno</label>
                  <input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} placeholder="Ej: 001"
                    className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none font-mono focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1">Categoría *</label>
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary">
                    <option value="">Seleccionar…</option>
                    {categories.filter((c) => c.active).map((c) => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-semibold block mb-1">Descripción</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Descripción corta…"
                  className="w-full bg-secondary rounded-xl px-3 py-2 text-sm outline-none resize-none focus:ring-1 focus:ring-primary" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1">Precio (PVP) *</label>
                  <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00"
                    className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none font-mono focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1">Coste</label>
                  <input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00"
                    className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none font-mono focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1">Margen</label>
                  <div className="w-full bg-secondary/50 rounded-xl px-3 py-2.5 text-sm font-mono text-muted-foreground">
                    {margin ? `${margin}%` : '—'}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-semibold block mb-1">IVA</label>
                <div className="flex gap-2">
                  {TAX_RATES.map((r) => (
                    <button key={r} onClick={() => setTaxRate(r)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-black transition-all ${taxRate === r ? RATE_COLOR[r] : 'bg-secondary/30 text-muted-foreground border-border hover:bg-secondary'}`}>
                      {r}%
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-semibold block mb-1">Zona de preparación</label>
                <div className="flex gap-1.5 flex-wrap">
                  {PREP_ZONES.map((z) => (
                    <button key={z} onClick={() => setPrepZone(z)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold capitalize transition-all ${prepZone === z ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary/30 text-muted-foreground border-border hover:bg-secondary'}`}>
                      {z}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-border rounded-xl px-3 divide-y divide-border/50">
                <ToggleField label="Visible en TPV" value={tpvVisible} onChange={setTpvVisible} />
                <ToggleField label="Visible en QR" value={qrVisible} onChange={setQrVisible} />
                <ToggleField label="Visible en Delivery" value={deliveryVisible} onChange={setDeliveryVisible} />
                {!isNew && <ToggleField label="Activo" value={active} onChange={setActive} />}
              </div>

              {!isNew && (
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1">URL de imagen</label>
                  <div className="flex gap-2">
                    <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…"
                      className="flex-1 bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary" />
                    {imageUrl && <img src={imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                  </div>
                </div>
              )}

              {/* QR Carta extra fields */}
              <div className="border border-border rounded-xl p-3 space-y-3 bg-secondary/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Carta QR</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground font-semibold block mb-1">Precio media ración</label>
                    <input type="number" step="0.01" value={halfPortionPrice} onChange={e => setHalfPortionPrice(e.target.value)} placeholder="0.00"
                      className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none font-mono focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-semibold block mb-1">Cantidad / Volumen</label>
                    <input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="330 ml, 200 g…"
                      className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold mb-2">Etiquetas dietéticas</p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { key: 'isVegetariano', label: '🥦 Vegetariano', value: isVegetariano, set: setIsVegetariano },
                      { key: 'isVegano', label: '🌿 Vegano', value: isVegano, set: setIsVegano },
                      { key: 'isSinGluten', label: '🚫🌾 Sin gluten', value: isSinGluten, set: setIsSinGluten },
                      { key: 'isPicante', label: '🌶️ Picante', value: isPicante, set: setIsPicante },
                    ] as const).map(({ key, label, value, set }) => (
                      <button
                        key={key}
                        onClick={() => set(!value)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${value ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary/30 text-muted-foreground border-border hover:bg-secondary'}`}
                      >
                        {value && <Check size={11} />}
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-muted-foreground font-semibold">Alérgenos (lista separada por comas)</label>
                  {!isNew && product && (
                    <AllergenRecalcButton
                      productId={product.id}
                      onResult={(computed) => setAllergens(computed)}
                    />
                  )}
                </div>
                <input value={allergens} onChange={(e) => setAllergens(e.target.value)} placeholder="gluten, leche, huevos…"
                  className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </>
          )}

          {/* ── Formats tab ── */}
          {tab === 'formats' && !isNew && (
            <div className="space-y-2">
              {formats.filter((f) => f.active).map((fmt) => (
                <FormatRow
                  key={fmt.id}
                  fmt={fmt as any}
                  productTaxRate={taxRate}
                  onUpdate={handleUpdateFormat}
                  onDelete={handleDeleteFormat}
                />
              ))}

              {addingFmt ? (
                <div className="p-3 rounded-xl border border-primary bg-secondary/10 space-y-2">
                  <input value={newFmtName} onChange={(e) => setNewFmtName(e.target.value)} autoFocus
                    placeholder="Nombre del formato (ej: Ración)"
                    className="w-full bg-secondary rounded-lg px-3 py-1.5 text-sm outline-none" />
                  <div className="flex gap-2">
                    <input type="number" step="0.01" value={newFmtPrice} onChange={(e) => setNewFmtPrice(e.target.value)}
                      placeholder="Precio €"
                      className="flex-1 bg-secondary rounded-lg px-3 py-1.5 text-sm outline-none font-mono" />
                    <button onClick={handleAddFormat} className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold flex items-center gap-1">
                      <Check size={13} /> Añadir
                    </button>
                    <button onClick={() => setAddingFmt(false)} className="px-3 py-1.5 bg-secondary rounded-lg text-sm text-muted-foreground">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingFmt(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                  <Plus size={14} /> Añadir formato
                </button>
              )}

              {formats.filter((f) => f.active).length === 0 && !addingFmt && (
                <p className="text-center text-xs text-muted-foreground py-6">Sin formatos — el producto se vende a precio único</p>
              )}
            </div>
          )}

          {/* ── Modifiers tab ── */}
          {tab === 'modifiers' && !isNew && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">Selecciona los grupos de modificadores que aplican a este producto.</p>
              {modifierGroups.filter((g) => g.active).map((g) => {
                const selected = selectedGroupIds.has(g.id);
                return (
                  <button key={g.id} onClick={() => toggleGroup(g.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selected ? 'border-primary bg-primary/5' : 'border-border bg-secondary/20 hover:bg-secondary/40'}`}>
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-all ${selected ? 'bg-primary border-primary' : 'border-border'}`}>
                      {selected && <Check size={11} className="text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{g.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {g.required ? '⚠ Obligatorio · ' : ''}{g.maxSelect} selección máx · {g.modifiers.filter((m) => m.active).length} opciones
                      </p>
                    </div>
                  </button>
                );
              })}
              {modifierGroups.filter((g) => g.active).length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-6">No hay grupos de modificadores creados todavía.</p>
              )}
            </div>
          )}

          {/* ── Recipe tab ── */}
          {tab === 'recipe' && !isNew && product && (
            <RecipeTab productId={product.id} productPrice={product.price} taxRate={product.taxRate} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Recipe tab component ──────────────────────────────────────────────────────
function RecipeTab({
  productId,
  productPrice,
  taxRate,
}: {
  productId: string;
  productPrice: string;
  taxRate: number;
}) {
  const qc = useQueryClient();
  const { data: recipe, isLoading } = useGetProductRecipe(productId);
  const { data: allIngredients = [] } = useGetAdminIngredients();
  const { data: allSubrecipes = [] } = useGetAdminSubrecipes();
  const createLine = useCreateRecipeLine();
  const updateLine = useUpdateRecipeLine();
  const deleteLine = useDeleteRecipeLine();

  const [addType, setAddType] = useState<'ingredient' | 'subrecipe'>('ingredient');
  const [addIngId, setAddIngId] = useState('');
  const [addSubrecipeId, setAddSubrecipeId] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addWaste, setAddWaste] = useState('0');
  const [adding, setAdding] = useState(false);
  const [ingSearch, setIngSearch] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetProductRecipeQueryKey(productId) });

  const activeIngredients = (allIngredients as Ingredient[]).filter(i => i.active);
  const activeSubrecipes = (allSubrecipes as Subrecipe[]).filter(s => s.active);

  const filteredIng = activeIngredients.filter(i =>
    !ingSearch || i.name.toLowerCase().includes(ingSearch.toLowerCase())
  );
  const filteredSr = activeSubrecipes.filter(s =>
    !ingSearch || s.name.toLowerCase().includes(ingSearch.toLowerCase())
  );

  const selectedIng = activeIngredients.find(i => i.id === addIngId);
  const selectedSr = activeSubrecipes.find(s => s.id === addSubrecipeId);

  const handleAddLine = async () => {
    const hasSource = addType === 'ingredient' ? !!addIngId : !!addSubrecipeId;
    if (!hasSource || !addQty || parseFloat(addQty) <= 0) {
      toast.error('Selecciona un ingrediente o subreceta e introduce la cantidad'); return;
    }
    try {
      await createLine.mutateAsync({
        productId,
        data: {
          ingredientId: addType === 'ingredient' ? addIngId : undefined,
          subrecipeId: addType === 'subrecipe' ? addSubrecipeId : undefined,
          quantity: addQty,
          wastePercent: addWaste,
        },
      });
      invalidate();
      setAddIngId(''); setAddSubrecipeId(''); setAddQty(''); setAddWaste('0'); setIngSearch(''); setAdding(false);
    } catch { toast.error('Error al añadir línea'); }
  };

  const handleDeleteLine = async (lineId: string) => {
    try {
      await deleteLine.mutateAsync({ lineId });
      invalidate();
    } catch { toast.error('Error al eliminar línea'); }
  };

  const handleUpdateLine = async (lineId: string, field: string, value: string) => {
    try {
      await updateLine.mutateAsync({ lineId, data: { [field]: value } });
      invalidate();
    } catch { toast.error('Error al actualizar línea'); }
  };

  if (isLoading) return <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">Cargando receta…</div>;

  const lines = (recipe as any)?.lines ?? [];
  const totalCost = parseFloat((recipe as any)?.totalCost ?? '0');
  const grossMargin = parseFloat((recipe as any)?.grossMargin ?? '0');
  const marginPct = parseFloat((recipe as any)?.marginPct ?? '0');
  const price = parseFloat(productPrice);
  // Base price sin IVA and derived metrics
  const effectiveTax = taxRate > 0 ? taxRate : 10;
  const basePrice = price / (1 + effectiveTax / 100);
  const grossMarginBase = basePrice > 0 ? basePrice - totalCost : 0;
  const marginPctBase = basePrice > 0 ? (grossMarginBase / basePrice) * 100 : 0;
  const foodCostPct = basePrice > 0 ? (totalCost / basePrice) * 100 : 0;
  const marginColor = marginPct >= 60 ? '#3caa78' : marginPct >= 30 ? '#d2a032' : '#dc3c3c';
  const fcColor = foodCostPct <= 25 ? '#3caa78' : foodCostPct <= 35 ? '#d2a032' : '#dc3c3c';

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {lines.length > 0 && (
        <div className="rounded-xl border border-border bg-secondary/30 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Coste total</p>
            <p className="text-base font-black">{totalCost.toFixed(4)}€</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Margen % (PVP)</p>
            <p className="text-base font-black" style={{ color: marginColor }}>{marginPct.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Margen s/base IVA</p>
            <p className="text-base font-black" style={{ color: marginColor }}>{marginPctBase.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Food cost</p>
            <p className="text-base font-black" style={{ color: fcColor }}>{foodCostPct.toFixed(1)}%</p>
          </div>
        </div>
      )}

      {/* Ingredient lines */}
      {lines.length === 0 && !adding && (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
          <FlaskConical size={28} strokeWidth={1.2} />
          <p className="text-sm">Sin receta. Añade ingredientes para calcular el coste.</p>
        </div>
      )}

      {lines.map((line: RecipeLine & { lineType?: string }) => (
        <RecipeLineRow key={line.id} line={line} onDelete={handleDeleteLine} onUpdate={handleUpdateLine} />
      ))}

      {/* Add line form */}
      {adding ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
          {/* Type switcher */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-primary">Nueva línea</p>
            <div className="flex gap-0.5 rounded-lg bg-secondary p-0.5">
              {(['ingredient', 'subrecipe'] as const).map(type => (
                <button key={type}
                  onClick={() => { setAddType(type); setAddIngId(''); setAddSubrecipeId(''); setIngSearch(''); }}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${addType === type ? 'bg-card text-foreground shadow' : 'text-muted-foreground'}`}>
                  {type === 'ingredient' ? 'Ingrediente' : 'Subreceta'}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder={addType === 'ingredient' ? 'Buscar ingrediente…' : 'Buscar subreceta…'}
              value={ingSearch || (addType === 'ingredient' ? (selectedIng?.name ?? '') : (selectedSr?.name ?? ''))}
              onChange={e => { setIngSearch(e.target.value); setAddIngId(''); setAddSubrecipeId(''); }}
              className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary/50"
            />
            {ingSearch && !addIngId && !addSubrecipeId && (
              <div className="absolute top-full left-0 right-0 z-10 bg-card border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto mt-0.5">
                {addType === 'ingredient' ? (
                  filteredIng.slice(0, 8).length > 0 ? (
                    filteredIng.slice(0, 8).map(i => (
                      <button key={i.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary flex items-center justify-between"
                        onClick={() => { setAddIngId(i.id); setIngSearch(''); }}>
                        <span>{i.name}</span>
                        <span className="text-[10px] text-muted-foreground">{parseFloat(i.purchaseCost).toFixed(3)}€/{i.unit}</span>
                      </button>
                    ))
                  ) : <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                ) : (
                  filteredSr.slice(0, 8).length > 0 ? (
                    filteredSr.slice(0, 8).map(s => (
                      <button key={s.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary flex items-center justify-between"
                        onClick={() => { setAddSubrecipeId(s.id); setIngSearch(''); }}>
                        <span>{s.name}</span>
                        <span className="text-[10px] text-muted-foreground">{parseFloat(s.cost).toFixed(4)}€/{s.unit}</span>
                      </button>
                    ))
                  ) : <p className="px-3 py-2 text-xs text-muted-foreground">Sin subrecetas activas</p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-muted-foreground mb-0.5 block">
                Cantidad {selectedIng ? `(${selectedIng.unit})` : selectedSr ? `(${selectedSr.unit})` : ''}
              </label>
              <input type="number" step="0.001" min="0" value={addQty} onChange={e => setAddQty(e.target.value)}
                placeholder="0.000"
                className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary/50" />
            </div>
            <div className="w-20">
              <label className="text-[10px] font-bold text-muted-foreground mb-0.5 block">Merma %</label>
              <input type="number" step="1" min="0" max="100" value={addWaste} onChange={e => setAddWaste(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary/50" />
            </div>
          </div>

          {/* Preview cost */}
          {(selectedIng || selectedSr) && addQty && parseFloat(addQty) > 0 && (
            <div className="text-xs text-muted-foreground">
              Coste línea ≈ <span className="font-bold text-foreground">
                {(
                  parseFloat(selectedIng?.purchaseCost ?? selectedSr?.cost ?? '0') *
                  parseFloat(addQty) *
                  (1 + parseFloat(addWaste || '0') / 100)
                ).toFixed(4)}€
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => { setAdding(false); setAddIngId(''); setAddSubrecipeId(''); setAddQty(''); setAddWaste('0'); setIngSearch(''); }}
              className="flex-1 py-2 rounded-lg bg-secondary text-xs font-semibold">Cancelar</button>
            <button onClick={handleAddLine} disabled={createLine.isPending}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-60">
              {createLine.isPending ? 'Añadiendo…' : 'Añadir'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-border text-muted-foreground text-sm hover:border-primary/40 hover:text-primary transition-colors">
          <Plus size={14} /> Añadir ingrediente o subreceta
        </button>
      )}
    </div>
  );
}

function RecipeLineRow({
  line, onDelete, onUpdate,
}: {
  line: RecipeLine;
  onDelete: (id: string) => void;
  onUpdate: (id: string, field: string, value: string) => void;
}) {
  const [editQty, setEditQty] = useState(false);
  const [editWaste, setEditWaste] = useState(false);
  const [qty, setQty] = useState(line.quantity);
  const [waste, setWaste] = useState(line.wastePercent);

  // Real-time cost preview while editing qty or waste
  const unitCost = parseFloat((line as any).ingredientCost ?? '0');
  const previewCost =
    (editQty || editWaste)
      ? unitCost * parseFloat(qty || '0') * (1 + parseFloat(waste || '0') / 100)
      : null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{line.ingredientName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {/* Quantity */}
          {editQty ? (
            <input autoFocus type="number" step="0.001" min="0" value={qty}
              className="w-20 px-1.5 py-0.5 rounded-md bg-secondary border border-primary/40 text-xs focus:outline-none"
              onChange={e => setQty(e.target.value)}
              onBlur={() => { onUpdate(line.id, 'quantity', qty); setEditQty(false); }}
              onKeyDown={e => e.key === 'Enter' && (onUpdate(line.id, 'quantity', qty), setEditQty(false))} />
          ) : (
            <button onClick={() => setEditQty(true)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              {parseFloat(line.quantity).toFixed(3)} {line.unit}
              <Pencil size={9} className="opacity-50" />
            </button>
          )}
          <span className="text-muted-foreground text-[10px]">·</span>
          {/* Waste */}
          {editWaste ? (
            <input autoFocus type="number" step="1" min="0" max="100" value={waste}
              className="w-14 px-1.5 py-0.5 rounded-md bg-secondary border border-primary/40 text-xs focus:outline-none"
              onChange={e => setWaste(e.target.value)}
              onBlur={() => { onUpdate(line.id, 'wastePercent', waste); setEditWaste(false); }}
              onKeyDown={e => e.key === 'Enter' && (onUpdate(line.id, 'wastePercent', waste), setEditWaste(false))} />
          ) : (
            <button onClick={() => setEditWaste(true)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              merma {parseFloat(line.wastePercent).toFixed(0)}%
              <Pencil size={9} className="opacity-50" />
            </button>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        {previewCost !== null ? (
          <p className="text-sm font-bold text-primary">{previewCost.toFixed(4)}€</p>
        ) : (
          <p className="text-sm font-bold">{parseFloat(line.lineCost).toFixed(4)}€</p>
        )}
        <p className="text-[10px] text-muted-foreground">{parseFloat((line as any).ingredientCost ?? '0').toFixed(4)}€/{(line as any).ingredientUnit ?? line.unit}</p>
      </div>
      <button onClick={() => onDelete(line.id)} disabled={false}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
        <X size={13} />
      </button>
    </div>
  );
}

// ── Allergen recalculate button ───────────────────────────────────────────────
const BASE_URL_PROD = import.meta.env.BASE_URL.replace(/\/$/, '');
function AllergenRecalcButton({ productId, onResult }: { productId: string; onResult: (computed: string) => void }) {
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      // Trigger recalculation
      await fetch(`${BASE_URL_PROD}/api/admin/products/${productId}/allergens/recalculate`, { method: 'POST', headers });
      // Fetch updated cache
      const res = await fetch(`${BASE_URL_PROD}/api/admin/products/${productId}/allergens`, { headers });
      if (!res.ok) throw new Error();
      const data: { allergenCode: string; type: string }[] = await res.json();
      if (data.length === 0) {
        toast.info('No se detectaron alérgenos en los ingredientes de esta receta');
      } else {
        const list = data.map(a => a.allergenCode).join(', ');
        onResult(list);
        toast.success('Alérgenos actualizados desde los ingredientes');
      }
    } catch {
      toast.error('Error al recalcular alérgenos');
    } finally {
      setLoading(false);
    }
  };
  return (
    <button onClick={handle} disabled={loading}
      className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
      title="Calcular alérgenos desde los ingredientes de la receta">
      {loading ? <RefreshCw size={10} className="animate-spin" /> : <ShieldCheck size={10} />}
      {loading ? 'Calculando…' : 'Desde ingredientes'}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProductosPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useGetAdminProducts({});
  const { data: categories = [] } = useGetAdminCategories();
  const { data: modifierGroups = [] } = useGetAdminModifierGroups();

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'price'>('name');
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null | 'new'>(null);
  const [showImportExport, setShowImportExport] = useState(false);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) qc.invalidateQueries({ queryKey: getGetAdminProductsQueryKey() });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [qc]);

  const filtered = products
    .filter((p) => {
      if (!showArchived && !p.active) return false;
      if (filterCat && p.categoryId !== filterCat) return false;
      if (search) {
        const s = search.toLowerCase();
        return p.name.toLowerCase().includes(s) || (p.internalCode ?? '').toLowerCase().includes(s);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'price') return parseFloat(a.price ?? '0') - parseFloat(b.price ?? '0');
      return a.name.localeCompare(b.name, 'es');
    });

  const activeCategories = (categories as AdminCategory[]).filter((c) => c.active);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-card shrink-0">
        <button onClick={() => setLocation('/admin')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <Package size={20} className="text-primary" />
        <div>
          <h1 className="font-black text-base leading-tight">Productos</h1>
          <p className="text-xs text-muted-foreground leading-none">{products.filter((p) => p.active).length} activos</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowImportExport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors border border-border"
            title="Importar / Exportar"
          >
            <FileDown size={15} /> <span className="hidden sm:inline">Importar / Exportar</span>
          </button>
          <button
            onClick={() => setEditingProduct('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} /> Nuevo
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="px-4 py-2.5 border-b border-border bg-card/50 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código…"
              autoFocus
            className="w-full pl-8 pr-3 py-2 bg-secondary rounded-xl text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
          className="bg-secondary rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary">
          <option value="">Todas las cat.</option>
          {activeCategories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="bg-secondary rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary">
          <option value="name">A-Z</option>
          <option value="price">Precio ↑</option>
        </select>
        <button onClick={() => setShowArchived(!showArchived)}
          className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-colors ${showArchived ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-secondary border-border text-muted-foreground hover:text-foreground'}`}
          title={showArchived ? 'Ocultar archivados' : 'Mostrar archivados'}>
          {showArchived ? <CircleCheck size={16} /> : <CircleOff size={16} />}
        </button>
      </div>

      {/* Grid */}
      <main className="flex-1 overflow-y-auto p-4">
        {isLoading && <p className="text-center text-muted-foreground py-16 text-sm">Cargando…</p>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-16 text-sm">
            <Package size={40} className="mx-auto mb-3 opacity-20" />
            <p>{search || filterCat ? 'Sin resultados para este filtro.' : 'No hay productos todavía.'}</p>
            {(search || filterCat) ? (
              <button onClick={() => { setSearch(''); setFilterCat(''); }} className="mt-2 text-primary underline">Borrar filtros</button>
            ) : (
              <button onClick={() => setEditingProduct('new')} className="mt-2 text-primary underline">Crear el primero</button>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} onEdit={() => setEditingProduct(p)} />
          ))}
        </div>
      </main>

      {/* Edit sheet */}
      {editingProduct !== null && (
        <ProductSheet
          product={editingProduct === 'new' ? null : editingProduct}
          categories={activeCategories}
          modifierGroups={modifierGroups as AdminModifierGroup[]}
          onClose={() => setEditingProduct(null)}
          onSave={() => setEditingProduct(null)}
          onDelete={() => setEditingProduct(null)}
        />
      )}

      {/* Import / Export sheet */}
      {showImportExport && (
        <ImportExportSheet
          onClose={() => setShowImportExport(false)}
          onImportDone={() => qc.invalidateQueries({ queryKey: getGetAdminProductsQueryKey() })}
        />
      )}
    </div>
  );
}

// ── Import / Export sheet ─────────────────────────────────────────────────────
function ImportExportSheet({ onClose, onImportDone }: { onClose: () => void; onImportDone: () => void }) {
  const importMut = useImportProducts();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  const handleExport = async (fmt: 'csv' | 'xlsx') => {
    setExporting(fmt);
    try {
      await downloadProductExport(fmt);
    } catch { toast.error('Error al exportar'); }
    finally { setExporting(null); }
  };

  const handleImport = async () => {
    if (!file) { toast.error('Selecciona un archivo primero'); return; }
    try {
      const res = await importMut.mutateAsync({ file });
      setResult(res);
      onImportDone();
      toast.success(`${res.imported} productos importados`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al importar');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[85vh] flex flex-col bg-card border border-border rounded-t-2xl sm:rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
            <X size={16} />
          </button>
          <h2 className="font-black text-base flex-1">Importar / Exportar</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Export */}
          <section>
            <p className="text-xs font-black text-muted-foreground uppercase tracking-wide mb-2">Exportar catálogo</p>
            <p className="text-xs text-muted-foreground mb-3">
              Descarga todos los productos con nombre, categoría, precio, coste, IVA y alérgenos.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleExport('csv')}
                disabled={!!exporting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-secondary text-sm font-semibold hover:bg-secondary/80 disabled:opacity-60 transition-colors"
              >
                <Download size={14} />
                {exporting === 'csv' ? 'Descargando…' : 'CSV'}
              </button>
              <button
                onClick={() => handleExport('xlsx')}
                disabled={!!exporting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-secondary text-sm font-semibold hover:bg-secondary/80 disabled:opacity-60 transition-colors"
              >
                <Download size={14} />
                {exporting === 'xlsx' ? 'Descargando…' : 'Excel (.xlsx)'}
              </button>
            </div>
          </section>

          <div className="border-t border-border" />

          {/* Import */}
          <section>
            <p className="text-xs font-black text-muted-foreground uppercase tracking-wide mb-2">Importar desde archivo</p>
            <p className="text-xs text-muted-foreground mb-3">
              Sube un CSV o Excel (.xlsx) con las columnas: <span className="font-bold text-foreground">nombre</span>, <span className="font-bold text-foreground">precio</span> (obligatorias) y opcionalmente: codigo, categoria, coste, iva, zona_prep, alergenos.
            </p>

            {/* File picker */}
            <label className="flex flex-col items-center justify-center gap-2 w-full py-6 rounded-xl border-2 border-dashed border-border cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors">
              <Upload size={20} className="text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {file ? file.name : 'Seleccionar archivo CSV o XLSX'}
              </span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="sr-only"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
              />
            </label>

            {file && !result && (
              <button
                onClick={handleImport}
                disabled={importMut.isPending}
                className="mt-3 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                <FileUp size={14} />
                {importMut.isPending ? 'Importando…' : 'Importar productos'}
              </button>
            )}

            {/* Result summary */}
            {result && (
              <div className="mt-3 rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-black text-green-400">{result.imported}</p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase">Importados</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-amber-400">{result.skipped}</p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase">Omitidos</p>
                  </div>
                </div>
                {result.errors.length > 0 && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-[11px] text-amber-400 leading-relaxed">{e}</p>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { setFile(null); setResult(null); }}
                  className="w-full py-2 rounded-lg bg-secondary text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Nueva importación
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
