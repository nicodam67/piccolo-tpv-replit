import { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Plus,
  Search,
  X,
  AlertTriangle,
  Package,
  ChevronRight,
  PackagePlus,
  Edit2,
} from 'lucide-react';
import {
  useGetAdminIngredients,
  useCreateAdminIngredient,
  useUpdateAdminIngredient,
  useDeleteAdminIngredient,
  useStockIn,
  getGetAdminIngredientsQueryKey,
  getGetStockAlertsQueryKey,
} from '@workspace/api-client-react';
import type { Ingredient } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const UNITS = ['ud', 'kg', 'g', 'l', 'ml', 'cl', 'l', 'docena'];
const ALLERGEN_OPTIONS = [
  { code: 'gluten', label: 'Gluten' },
  { code: 'crustaceos', label: 'Crustáceos' },
  { code: 'huevos', label: 'Huevos' },
  { code: 'pescado', label: 'Pescado' },
  { code: 'cacahuetes', label: 'Cacahuetes' },
  { code: 'soja', label: 'Soja' },
  { code: 'lacteos', label: 'Lácteos' },
  { code: 'frutos_cascara', label: 'Frutos de cáscara' },
  { code: 'apio', label: 'Apio' },
  { code: 'mostaza', label: 'Mostaza' },
  { code: 'sesamo', label: 'Sésamo' },
  { code: 'sulfitos', label: 'Sulfitos' },
  { code: 'moluscos', label: 'Moluscos' },
  { code: 'altramuces', label: 'Altramuces' },
];

type Sheet = { kind: 'new' } | { kind: 'edit'; ingredient: Ingredient } | { kind: 'stock-in'; ingredient: Ingredient } | null;

function stockStatus(ing: Ingredient): 'ok' | 'warn' | 'low' | 'zero' {
  const cur = parseFloat(ing.currentStock);
  const min = parseFloat(ing.minStock);
  const opt = parseFloat(ing.optimalStock ?? '0');
  if (cur <= 0) return 'zero';
  if (cur <= min) return 'low';
  if (opt > 0 && cur <= opt) return 'warn';
  return 'ok';
}

const STATUS_COLORS = {
  ok: { bg: 'rgba(60,170,120,0.12)', text: '#3caa78', border: 'rgba(60,170,120,0.25)' },
  warn: { bg: 'rgba(250,200,50,0.12)', text: '#c8a830', border: 'rgba(250,200,50,0.30)' },
  low: { bg: 'rgba(237,135,76,0.12)', text: '#ed874c', border: 'rgba(237,135,76,0.3)' },
  zero: { bg: 'rgba(220,60,60,0.12)', text: '#dc3c3c', border: 'rgba(220,60,60,0.3)' },
};

export default function Ingredientes() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<Sheet>(null);

  const { data: ingredients = [], isLoading } = useGetAdminIngredients();

  const createMut = useCreateAdminIngredient();
  const updateMut = useUpdateAdminIngredient();
  const deleteMut = useDeleteAdminIngredient();
  const stockInMut = useStockIn();

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: getGetAdminIngredientsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetStockAlertsQueryKey() });
  }, [qc]);

  const filtered = ingredients.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.internalCode ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const alertCount = ingredients.filter(i => stockStatus(i) === 'low' || stockStatus(i) === 'zero').length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 shrink-0 flex items-center px-4 gap-3 bg-card border-b border-border">
        <button onClick={() => setLocation('/admin')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <Package size={18} className="text-amber-500" />
        <div className="flex-1">
          <p className="font-black text-sm leading-tight">Ingredientes</p>
          <p className="text-[11px] text-muted-foreground">Materias primas · stock · costes</p>
        </div>
        {alertCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25 text-[11px] font-bold">
            <AlertTriangle size={11} />
            {alertCount} bajo mínimo
          </div>
        )}
        <button
          onClick={() => setSheet({ kind: 'new' })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
        >
          <Plus size={15} strokeWidth={2.5} />
          Nuevo
        </button>
      </header>

      {/* Search */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar ingrediente o código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Package size={36} strokeWidth={1.2} />
            <p className="text-sm">{search ? 'Sin resultados' : 'No hay ingredientes todavía.'}</p>
            {!search && (
              <button onClick={() => setSheet({ kind: 'new' })} className="text-primary text-sm font-semibold hover:underline">
                Crear el primero
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            {filtered.map(ing => {
              const status = stockStatus(ing);
              const sc = STATUS_COLORS[status];
              return (
                <div
                  key={ing.id}
                  className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => setSheet({ kind: 'edit', ingredient: ing })}
                >
                  {/* Stock badge */}
                  <div className="shrink-0 w-14 text-right">
                    <span
                      className="text-xs font-black px-1.5 py-0.5 rounded-md border"
                      style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}
                    >
                      {parseFloat(ing.currentStock).toFixed(2)}
                      <span className="font-medium ml-0.5 opacity-70">{ing.unit}</span>
                    </span>
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{ing.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {ing.internalCode && <span className="mr-2 font-mono">{ing.internalCode}</span>}
                      {ing.supplierName && <span>{ing.supplierName}</span>}
                    </p>
                  </div>

                  {/* Cost */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">{parseFloat(ing.purchaseCost).toFixed(3)}€<span className="text-muted-foreground font-normal">/{ing.unit}</span></p>
                    {parseFloat(ing.minStock) > 0 && (
                      <p className="text-[10px] text-muted-foreground">mín {parseFloat(ing.minStock).toFixed(2)} {ing.unit}</p>
                    )}
                  </div>

                  {/* Quick stock-in */}
                  <button
                    onClick={e => { e.stopPropagation(); setSheet({ kind: 'stock-in', ingredient: ing }); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary/10 text-primary transition-colors shrink-0"
                    title="Añadir stock"
                  >
                    <PackagePlus size={16} />
                  </button>

                  <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sheets */}
      {sheet && sheet.kind === 'new' && (
        <IngredientSheet
          title="Nuevo ingrediente"
          onClose={() => setSheet(null)}
          onSave={async data => {
            await createMut.mutateAsync({ data: data as any });
            invalidate();
            toast.success('Ingrediente creado');
            setSheet(null);
          }}
          saving={createMut.isPending}
        />
      )}
      {sheet && sheet.kind === 'edit' && (
        <IngredientSheet
          title="Editar ingrediente"
          initial={sheet.ingredient}
          onClose={() => setSheet(null)}
          onSave={async data => {
            await updateMut.mutateAsync({ id: sheet.ingredient.id, data: data as any });
            invalidate();
            toast.success('Guardado');
            setSheet(null);
          }}
          onDelete={async () => {
            await deleteMut.mutateAsync({ id: sheet.ingredient.id });
            invalidate();
            toast.success('Archivado');
            setSheet(null);
          }}
          saving={updateMut.isPending}
        />
      )}
      {sheet && sheet.kind === 'stock-in' && (
        <StockInSheet
          ingredient={sheet.ingredient}
          onClose={() => setSheet(null)}
          onSave={async (qty, cost, reason) => {
            await stockInMut.mutateAsync({
              id: sheet.ingredient.id,
              data: { quantity: qty, unitCost: cost || undefined, reason },
            });
            invalidate();
            toast.success(`+${qty} ${sheet.ingredient.unit} de ${sheet.ingredient.name}`);
            setSheet(null);
          }}
          saving={stockInMut.isPending}
        />
      )}
    </div>
  );
}

// ─── IngredientSheet ──────────────────────────────────────────────────────────
function IngredientSheet({
  title, initial, onClose, onSave, onDelete, saving,
}: {
  title: string;
  initial?: Ingredient;
  onClose: () => void;
  onSave: (data: {
    name: string; internalCode?: string; unit: string; purchaseCost: string;
    currentStock: string; minStock: string; optimalStock: string; supplierName?: string; allergenTags: string[];
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    internalCode: initial?.internalCode ?? '',
    unit: initial?.unit ?? 'ud',
    purchaseCost: initial?.purchaseCost ?? '0',
    currentStock: initial?.currentStock ?? '0',
    minStock: initial?.minStock ?? '0',
    optimalStock: (initial as any)?.optimalStock ?? '0',
    supplierName: initial?.supplierName ?? '',
    allergenTags: (initial?.allergenTags ?? []) as string[],
  });

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    await onSave({
      name: form.name.trim(),
      internalCode: form.internalCode || undefined,
      unit: form.unit,
      purchaseCost: form.purchaseCost,
      currentStock: form.currentStock,
      minStock: form.minStock,
      optimalStock: form.optimalStock,
      supplierName: form.supplierName || undefined,
      allergenTags: form.allergenTags,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card border border-border rounded-t-3xl md:rounded-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-black text-base">{title}</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary">
            <X size={16} />
          </button>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Nombre *</label>
            <input className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
              value={form.name} onChange={e => set('name', e.target.value)} placeholder="Harina de trigo" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Código interno</label>
            <input className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
              value={form.internalCode} onChange={e => set('internalCode', e.target.value)} placeholder="ING-001" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Unidad</label>
            <select className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
              value={form.unit} onChange={e => set('unit', e.target.value)}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Coste compra (€/{form.unit})</label>
            <input type="number" step="0.0001" min="0" className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
              value={form.purchaseCost} onChange={e => set('purchaseCost', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Stock actual ({form.unit})</label>
            <input type="number" step="0.01" min="0" className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
              value={form.currentStock} onChange={e => set('currentStock', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Stock mínimo ({form.unit})</label>
            <input type="number" step="0.01" min="0" className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
              value={form.minStock} onChange={e => set('minStock', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Stock óptimo ({form.unit})</label>
            <input type="number" step="0.01" min="0" className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
              value={form.optimalStock} onChange={e => set('optimalStock', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Proveedor principal</label>
            <input className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
              value={form.supplierName} onChange={e => set('supplierName', e.target.value)} placeholder="Nombre del proveedor" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-bold text-muted-foreground mb-2 block">Alérgenos</label>
            <div className="flex flex-wrap gap-1.5">
              {ALLERGEN_OPTIONS.map(a => (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => set('allergenTags', form.allergenTags.includes(a.code)
                    ? form.allergenTags.filter(x => x !== a.code)
                    : [...form.allergenTags, a.code])}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border transition-colors ${
                    form.allergenTags.includes(a.code)
                      ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                      : 'bg-secondary text-muted-foreground border-border'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          {onDelete && (
            <button onClick={onDelete} className="px-4 py-2.5 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold hover:bg-destructive/10 transition-colors">
              Archivar
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── StockInSheet ─────────────────────────────────────────────────────────────
function StockInSheet({
  ingredient, onClose, onSave, saving,
}: {
  ingredient: Ingredient;
  onClose: () => void;
  onSave: (qty: string, cost: string, reason: string) => Promise<void>;
  saving: boolean;
}) {
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState(ingredient.purchaseCost);
  const [reason, setReason] = useState('Entrada de mercancía');

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-t-3xl md:rounded-2xl p-5 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black text-base">Entrada de stock</p>
            <p className="text-xs text-muted-foreground">{ingredient.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary"><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Cantidad ({ingredient.unit}) *</label>
            <input type="number" step="0.01" min="0" autoFocus
              className="w-full px-3 py-3 rounded-xl bg-secondary border border-border text-lg font-black focus:outline-none focus:border-primary/50 text-center"
              value={qty} onChange={e => setQty(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Coste unitario (€/{ingredient.unit})</label>
            <input type="number" step="0.0001" min="0"
              className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
              value={cost} onChange={e => setCost(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Motivo</label>
            <input className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
              value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold">Cancelar</button>
          <button
            onClick={() => { if (parseFloat(qty) > 0) onSave(qty, cost, reason); else toast.error('Cantidad inválida'); }}
            disabled={saving || !qty}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Registrar entrada'}
          </button>
        </div>
      </div>
    </div>
  );
}
