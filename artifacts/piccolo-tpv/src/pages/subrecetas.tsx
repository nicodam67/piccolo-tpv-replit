import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  Plus,
  FlaskConical,
  Pencil,
  X,
  ChevronRight,
  Loader2,
  Search,
} from 'lucide-react';
import {
  useGetAdminSubrecipes,
  useGetAdminSubrecipe,
  useCreateSubrecipe,
  useUpdateSubrecipe,
  useDeleteSubrecipe,
  useAddSubrecipeItem,
  useUpdateSubrecipeItem,
  useDeleteSubrecipeItem,
  useGetAdminIngredients,
  getGetAdminSubrecipesQueryKey,
  getGetAdminSubrecipeQueryKey,
} from '@workspace/api-client-react';
import type { Subrecipe, Ingredient, SubrecipeItem } from '@workspace/api-client-react';

// ── SubrecipeList page ─────────────────────────────────────────────────────────
export default function Subrecetas() {
  const [, setLocation] = useLocation();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (selected) {
    return <SubrecipeDetail id={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-border bg-card">
        <button onClick={() => setLocation('/admin')}
          className="p-2 rounded-lg hover:bg-secondary transition-colors">
          <ChevronLeft size={18} />
        </button>
        <FlaskConical size={18} className="text-primary" />
        <h1 className="font-bold text-base flex-1">Subrecetas</h1>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold">
          <Plus size={13} /> Nueva
        </button>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-3">
        {creating && (
          <CreateSubrecipeForm
            onClose={() => setCreating(false)}
            onCreated={(id) => { setCreating(false); setSelected(id); }}
          />
        )}
        <SubrecipeListItems onSelect={setSelected} />
      </div>
    </div>
  );
}

// ── Create form ────────────────────────────────────────────────────────────────
function CreateSubrecipeForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const create = useCreateSubrecipe();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('ud');
  const [yieldQty, setYieldQty] = useState('1');

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return; }
    try {
      const result = await create.mutateAsync({ data: { name, unit, yieldQuantity: yieldQty } });
      qc.invalidateQueries({ queryKey: getGetAdminSubrecipesQueryKey() });
      toast.success('Subreceta creada');
      onCreated(result.id);
    } catch { toast.error('Error al crear subreceta'); }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <p className="text-xs font-bold text-primary">Nueva subreceta</p>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre (ej. Salsa de tomate)"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') onClose(); }}
        className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary/50" />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">Unidad de medida</label>
          <select value={unit} onChange={e => setUnit(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary/50">
            {['ud', 'kg', 'g', 'l', 'ml', 'cl', 'docena', 'porción'].map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="w-24">
          <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">Rendimiento</label>
          <input type="number" step="0.001" min="0.001" value={yieldQty} onChange={e => setYieldQty(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary/50" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-secondary text-xs font-semibold">Cancelar</button>
        <button onClick={handleCreate} disabled={create.isPending}
          className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-60">
          {create.isPending ? 'Creando…' : 'Crear'}
        </button>
      </div>
    </div>
  );
}

// ── Subrecipe list ────────────────────────────────────────────────────────────
function SubrecipeListItems({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: subrecipes = [], isLoading } = useGetAdminSubrecipes();
  const [search, setSearch] = useState('');

  const list = (subrecipes as Subrecipe[]);
  const filtered = search.trim()
    ? list.filter(sr => sr.name.toLowerCase().includes(search.toLowerCase()))
    : list;

  if (isLoading) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 size={20} className="animate-spin" />
    </div>
  );

  if (!list.length) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
      <FlaskConical size={32} strokeWidth={1.2} />
      <p className="text-sm">Sin subrecetas. Crea la primera para empezar.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          value={search}
          autoFocus
            onChange={e => setSearch(e.target.value)}
          placeholder="Buscar subreceta…"
          className="w-full pl-9 pr-8 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={13} />
          </button>
        )}
      </div>
      {filtered.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-8">
          <p>Sin resultados para "{search}"</p>
          <button onClick={() => setSearch('')} className="mt-2 text-primary font-semibold hover:underline">Borrar búsqueda</button>
        </div>
      )}
      {filtered.map(sr => (
        <button key={sr.id} onClick={() => onSelect(sr.id)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors text-left">
          <FlaskConical size={16} className="text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{sr.name}</p>
            <p className="text-[11px] text-muted-foreground">
              Rendimiento: {parseFloat(sr.yieldQuantity).toFixed(2)} {sr.unit} · Coste/ud: <span className="font-bold text-foreground">{parseFloat(sr.cost).toFixed(4)}€</span>
            </p>
          </div>
          {!sr.active && (
            <span className="text-[10px] font-bold uppercase text-muted-foreground border border-border rounded px-1.5 py-0.5">Archivada</span>
          )}
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ── Subrecipe detail page ─────────────────────────────────────────────────────
function SubrecipeDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: subrecipe, isLoading } = useGetAdminSubrecipe(id);
  const { data: allIngredients = [] } = useGetAdminIngredients();
  const update = useUpdateSubrecipe();
  const archive = useDeleteSubrecipe();
  const addItem = useAddSubrecipeItem();
  const updateItem = useUpdateSubrecipeItem();
  const deleteItem = useDeleteSubrecipeItem();

  const [editName, setEditName] = useState(false);
  const [name, setName] = useState('');
  const [editYield, setEditYield] = useState(false);
  const [yieldQty, setYieldQty] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [addIngId, setAddIngId] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addWaste, setAddWaste] = useState('0');
  const [ingSearch, setIngSearch] = useState('');

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: getGetAdminSubrecipeQueryKey(id) });
    qc.invalidateQueries({ queryKey: getGetAdminSubrecipesQueryKey() });
  }, [qc, id]);

  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) invalidate(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [invalidate]);

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-muted-foreground" />
    </div>
  );

  const sr = subrecipe as Subrecipe & { items: SubrecipeItem[]; totalRawCost: string; costPerUnit: string };
  if (!sr) return null;

  const activeIngredients = (allIngredients as Ingredient[]).filter(i => i.active);
  const filteredIng = activeIngredients.filter(i =>
    !ingSearch || i.name.toLowerCase().includes(ingSearch.toLowerCase()),
  );
  const selectedIng = activeIngredients.find(i => i.id === addIngId);

  const handleSaveName = async () => {
    if (!name.trim()) return;
    try {
      await update.mutateAsync({ id, data: { name } });
      invalidate();
      setEditName(false);
    } catch { toast.error('Error al actualizar'); }
  };

  const handleSaveYield = async () => {
    if (!yieldQty || parseFloat(yieldQty) <= 0) return;
    try {
      await update.mutateAsync({ id, data: { yieldQuantity: yieldQty } });
      invalidate();
      setEditYield(false);
    } catch { toast.error('Error al actualizar'); }
  };

  const handleAddItem = async () => {
    if (!addIngId || !addQty || parseFloat(addQty) <= 0) {
      toast.error('Selecciona un ingrediente y cantidad'); return;
    }
    try {
      await addItem.mutateAsync({ subrecipeId: id, data: { ingredientId: addIngId, quantity: addQty, wastePercent: addWaste } });
      invalidate();
      setAddIngId(''); setAddQty(''); setAddWaste('0'); setIngSearch(''); setAddingItem(false);
    } catch { toast.error('Error al añadir ingrediente'); }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteItem.mutateAsync({ itemId });
      invalidate();
    } catch { toast.error('Error al eliminar'); }
  };

  const handleArchive = async () => {
    try {
      await archive.mutateAsync({ id });
      invalidate();
      toast.success('Subreceta archivada');
      onBack();
    } catch { toast.error('Error al archivar'); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-border bg-card">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-secondary transition-colors">
          <ChevronLeft size={18} />
        </button>
        <FlaskConical size={16} className="text-primary" />
        <h1 className="font-bold text-sm flex-1 truncate">{sr.name}</h1>
        <button onClick={handleArchive} disabled={archive.isPending}
          className="text-[11px] text-muted-foreground hover:text-destructive px-2 py-1 rounded border border-border hover:border-destructive/40 transition-colors disabled:opacity-60">
          {archive.isPending ? 'Archivando…' : 'Archivar'}
        </button>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-5">
        {/* Meta fields */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          {/* Name */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Nombre</label>
            {editName ? (
              <div className="flex gap-2">
                <input autoFocus value={name} onChange={e => setName(e.target.value)}
                  className="flex-1 px-2 py-1 rounded-lg bg-secondary border border-primary/30 text-sm focus:outline-none"
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()} />
                <button onClick={handleSaveName} className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold">✓</button>
                <button onClick={() => setEditName(false)} className="px-2 py-1 rounded-lg bg-secondary text-xs">✕</button>
              </div>
            ) : (
              <button onClick={() => { setName(sr.name); setEditName(true); }}
                className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors">
                {sr.name} <Pencil size={11} className="text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Yield */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Rendimiento</label>
            {editYield ? (
              <div className="flex gap-2 items-center">
                <input autoFocus type="number" step="0.001" min="0.001" value={yieldQty}
                  onChange={e => setYieldQty(e.target.value)}
                  className="w-28 px-2 py-1 rounded-lg bg-secondary border border-primary/30 text-sm focus:outline-none"
                  onKeyDown={e => e.key === 'Enter' && handleSaveYield()} />
                <span className="text-sm text-muted-foreground">{sr.unit}</span>
                <button onClick={handleSaveYield} className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold">✓</button>
                <button onClick={() => setEditYield(false)} className="px-2 py-1 rounded-lg bg-secondary text-xs">✕</button>
              </div>
            ) : (
              <button onClick={() => { setYieldQty(sr.yieldQuantity); setEditYield(true); }}
                className="flex items-center gap-1.5 text-sm hover:text-primary transition-colors">
                {parseFloat(sr.yieldQuantity).toFixed(2)} {sr.unit} <Pencil size={11} className="text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Cost summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Coste total elaboración</p>
            <p className="text-lg font-black">{parseFloat(sr.totalRawCost ?? '0').toFixed(4)}€</p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Coste por {sr.unit}</p>
            <p className="text-lg font-black text-primary">{parseFloat(sr.costPerUnit ?? sr.cost).toFixed(4)}€</p>
          </div>
        </div>

        {/* Ingredient lines */}
        <div>
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Ingredientes</h2>
          {(sr.items ?? []).length === 0 && !addingItem && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground rounded-xl border border-dashed border-border">
              <p className="text-sm">Sin ingredientes. Añade el primero.</p>
            </div>
          )}
          <div className="space-y-2">
            {(sr.items ?? []).map((item: SubrecipeItem) => (
              <SubrecipeItemRow key={item.id} item={item}
                onUpdate={async (itemId, field, value) => {
                  await updateItem.mutateAsync({ itemId, data: { [field]: value } });
                  invalidate();
                }}
                onDelete={handleDeleteItem} />
            ))}
          </div>
        </div>

        {/* Add item form */}
        {addingItem ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-xs font-bold text-primary">Nuevo ingrediente</p>
            <div className="relative">
              <input type="text" placeholder="Buscar ingrediente…"
                value={ingSearch || (selectedIng?.name ?? '')}
                onChange={e => { setIngSearch(e.target.value); setAddIngId(''); }}
                className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary/50" />
              {ingSearch && !addIngId && (
                <div className="absolute top-full left-0 right-0 z-10 bg-card border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto mt-0.5">
                  {filteredIng.slice(0, 8).map(i => (
                    <button key={i.id} onClick={() => { setAddIngId(i.id); setIngSearch(''); }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary flex items-center justify-between">
                      <span>{i.name}</span>
                      <span className="text-[10px] text-muted-foreground">{parseFloat(i.purchaseCost).toFixed(3)}€/{i.unit}</span>
                    </button>
                  ))}
                  {filteredIng.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      <span>Sin resultados</span>
                      {ingSearch && <button onClick={() => setIngSearch('')} className="ml-2 text-primary hover:underline">Borrar</button>}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">Cantidad {selectedIng ? `(${selectedIng.unit})` : ''}</label>
                <input type="number" step="0.001" min="0" value={addQty} onChange={e => setAddQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary/50" />
              </div>
              <div className="w-20">
                <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">Merma %</label>
                <input type="number" step="1" min="0" max="100" value={addWaste} onChange={e => setAddWaste(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setAddingItem(false); setAddIngId(''); setAddQty(''); setAddWaste('0'); setIngSearch(''); }}
                className="flex-1 py-2 rounded-lg bg-secondary text-xs font-semibold">Cancelar</button>
              <button onClick={handleAddItem} disabled={addItem.isPending}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-60">
                {addItem.isPending ? 'Añadiendo…' : 'Añadir'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddingItem(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-border text-muted-foreground text-sm hover:border-primary/40 hover:text-primary transition-colors">
            <Plus size={14} /> Añadir ingrediente
          </button>
        )}
      </div>
    </div>
  );
}

function SubrecipeItemRow({ item, onUpdate, onDelete }: {
  item: SubrecipeItem;
  onUpdate: (id: string, field: string, value: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editQty, setEditQty] = useState(false);
  const [editWaste, setEditWaste] = useState(false);
  const [qty, setQty] = useState(item.quantity);
  const [waste, setWaste] = useState(item.wastePercent);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{item.ingredientName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {editQty ? (
            <input autoFocus type="number" step="0.001" min="0" value={qty}
              className="w-20 px-1.5 py-0.5 rounded-md bg-secondary border border-primary/40 text-xs focus:outline-none"
              onChange={e => setQty(e.target.value)}
              onBlur={() => { onUpdate(item.id, 'quantity', qty); setEditQty(false); }}
              onKeyDown={e => e.key === 'Enter' && (onUpdate(item.id, 'quantity', qty), setEditQty(false))} />
          ) : (
            <button onClick={() => setEditQty(true)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              {parseFloat(item.quantity).toFixed(3)} {item.unit} <Pencil size={9} className="opacity-50" />
            </button>
          )}
          <span className="text-muted-foreground text-[10px]">·</span>
          {editWaste ? (
            <input autoFocus type="number" step="1" min="0" max="100" value={waste}
              className="w-14 px-1.5 py-0.5 rounded-md bg-secondary border border-primary/40 text-xs focus:outline-none"
              onChange={e => setWaste(e.target.value)}
              onBlur={() => { onUpdate(item.id, 'wastePercent', waste); setEditWaste(false); }}
              onKeyDown={e => e.key === 'Enter' && (onUpdate(item.id, 'wastePercent', waste), setEditWaste(false))} />
          ) : (
            <button onClick={() => setEditWaste(true)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              merma {parseFloat(item.wastePercent).toFixed(0)}% <Pencil size={9} className="opacity-50" />
            </button>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold">{parseFloat(item.lineCost).toFixed(4)}€</p>
        <p className="text-[10px] text-muted-foreground">{parseFloat(item.ingredientCost).toFixed(4)}€/{item.ingredientUnit}</p>
      </div>
      <button onClick={() => onDelete(item.id)}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
        <X size={13} />
      </button>
    </div>
  );
}
