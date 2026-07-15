import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAdminCategories,
  useCreateAdminCategory,
  useUpdateAdminCategory,
  useDeleteAdminCategory,
  useCreateSubcategory,
  useUpdateSubcategory,
  useDeleteSubcategory,
  getGetAdminCategoriesQueryKey,
} from '@workspace/api-client-react';
import type { AdminCategory, Subcategory } from '@workspace/api-client-react';
import {
  ArrowLeft, Tag, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  GripVertical, Check, X, Folder, FolderOpen, Search,
} from 'lucide-react';

const PALETTE = [
  '#ed874c','#6082dc','#ec82aa','#a064dc','#3caa78','#d2a032',
  '#32b9d2','#f06464','#61895f','#50b4a0','#8282a0','#a08250',
];

const ICONS = ['🍕','🍔','🥗','🍜','🍣','🥩','🍷','🍺','🥤','☕','🍰','🍦','🥐','🌮','🫕','🍱','🥘','🍝','🎂','🍫'];

function ColorPicker({ value, onChange }: { value?: string | null; onChange: (c: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(value === c ? null : c)}
          className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110"
          style={{ backgroundColor: c, borderColor: value === c ? 'white' : 'transparent' }}
        />
      ))}
    </div>
  );
}

function IconPicker({ value, onChange }: { value?: string | null; onChange: (i: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {ICONS.map((ic) => (
        <button
          key={ic}
          type="button"
          onClick={() => onChange(value === ic ? null : ic)}
          className={`w-8 h-8 text-base rounded-lg border transition-all ${value === ic ? 'border-primary bg-primary/20' : 'border-border hover:bg-secondary'}`}
        >
          {ic}
        </button>
      ))}
    </div>
  );
}

// ── Inline editable field ─────────────────────────────────────────────────────
function InlineEdit({ value, onSave, className = '' }: {
  value: string; onSave: (v: string) => void; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => { setDraft(value); setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); };
  const save = () => { if (draft.trim() && draft !== value) onSave(draft.trim()); setEditing(false); };
  const cancel = () => setEditing(false);

  if (editing) return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
        className={`bg-secondary border border-primary rounded-md px-2 py-0.5 text-sm outline-none ${className}`}
      />
      <button onClick={save} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
      <button onClick={cancel} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
    </div>
  );

  return (
    <button onClick={start} className={`text-left hover:text-primary transition-colors group ${className}`}>
      <span className="border-b border-dashed border-transparent group-hover:border-muted-foreground">{value}</span>
      <Pencil size={11} className="inline ml-1 opacity-0 group-hover:opacity-50" />
    </button>
  );
}

// ── Category row ──────────────────────────────────────────────────────────────
function CategoryRow({
  cat, expanded, onToggle, onRename, onUpdateColor, onUpdateIcon, onArchive, archiving,
  onAddSubcat, onRenameSubcat, onArchiveSubcat,
}: {
  cat: AdminCategory;
  expanded: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onUpdateColor: (color: string | null) => void;
  onUpdateIcon: (icon: string | null) => void;
  onArchive: () => void;
  archiving?: boolean;
  onAddSubcat: (name: string) => void;
  onRenameSubcat: (id: string, name: string) => void;
  onArchiveSubcat: (id: string) => void;
}) {
  const [showMeta, setShowMeta] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [addingSubcat, setAddingSubcat] = useState(false);

  const activeSubs = cat.subcategories.filter((s) => s.active);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-card cursor-pointer"
        onClick={onToggle}
      >
        <GripVertical size={16} className="text-muted-foreground/40 shrink-0" />
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
          style={{ backgroundColor: cat.color ? `${cat.color}30` : undefined, color: cat.color ?? undefined }}
        >
          {cat.icon ? cat.icon : expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <InlineEdit value={cat.name} onSave={onRename} className="font-semibold text-sm" />
          {activeSubs.length > 0 && (
            <div className="text-xs text-muted-foreground">{activeSubs.length} subcategoría{activeSubs.length !== 1 ? 's' : ''}</div>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMeta(!showMeta); }}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary transition-colors"
          title="Color e icono"
        >
          🎨
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(); }}
          disabled={archiving}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        >
          <Trash2 size={13} />
        </button>
        {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
      </div>

      {/* Meta panel */}
      {showMeta && (
        <div className="px-4 py-3 bg-secondary/20 border-t border-border space-y-2" onClick={(e) => e.stopPropagation()}>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Color</p>
            <ColorPicker value={cat.color} onChange={onUpdateColor} />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Icono</p>
            <IconPicker value={cat.icon} onChange={onUpdateIcon} />
          </div>
        </div>
      )}

      {/* Subcategories */}
      {expanded && (
        <div className="bg-secondary/10 border-t border-border divide-y divide-border/50">
          {activeSubs.map((sub) => (
            <div key={sub.id} className="flex items-center gap-3 px-4 py-2.5 pl-11">
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
              <InlineEdit value={sub.name} onSave={(n) => onRenameSubcat(sub.id, n)} className="flex-1 text-sm text-muted-foreground" />
              <button
                onClick={() => onArchiveSubcat(sub.id)}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive transition-colors"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          {/* Add subcategory */}
          {addingSubcat ? (
            <div className="flex items-center gap-2 px-4 py-2.5 pl-11" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSubName.trim()) { onAddSubcat(newSubName.trim()); setNewSubName(''); setAddingSubcat(false); }
                  if (e.key === 'Escape') { setAddingSubcat(false); setNewSubName(''); }
                }}
                placeholder="Nombre de subcategoría…"
                className="flex-1 bg-secondary border border-primary rounded-md px-2 py-1 text-sm outline-none"
              />
              <button onClick={() => { if (newSubName.trim()) { onAddSubcat(newSubName.trim()); setNewSubName(''); setAddingSubcat(false); } }} className="text-green-400"><Check size={14} /></button>
              <button onClick={() => { setAddingSubcat(false); setNewSubName(''); }} className="text-muted-foreground"><X size={14} /></button>
            </div>
          ) : (
            <button
              onClick={() => setAddingSubcat(true)}
              className="w-full flex items-center gap-2 px-4 py-2.5 pl-11 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
            >
              <Plus size={12} /> Añadir subcategoría
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CategoriasPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: categories = [], isLoading } = useGetAdminCategories();
  const createCat = useCreateAdminCategory();
  const updateCat = useUpdateAdminCategory();
  const deleteCat = useDeleteAdminCategory();
  const createSub = useCreateSubcategory();
  const updateSub = useUpdateSubcategory();
  const deleteSub = useDeleteSubcategory();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: getGetAdminCategoriesQueryKey() }), [qc]);

  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) invalidate(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [invalidate]);

  const toggle = (id: string) => setExpanded((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const handleRename = async (id: string, name: string) => {
    try { await updateCat.mutateAsync({ id, data: { name } }); invalidate(); toast.success('Nombre actualizado'); }
    catch { toast.error('Error al renombrar'); }
  };

  const handleUpdateColor = async (id: string, color: string | null) => {
    try { await updateCat.mutateAsync({ id, data: { color } }); invalidate(); }
    catch { toast.error('Error al actualizar color'); }
  };

  const handleUpdateIcon = async (id: string, icon: string | null) => {
    try { await updateCat.mutateAsync({ id, data: { icon } }); invalidate(); }
    catch { toast.error('Error al actualizar icono'); }
  };

  const handleArchiveCat = async (cat: AdminCategory) => {
    if (!confirm(`¿Archivar la categoría "${cat.name}"? Los productos asociados quedarán inactivos.`)) return;
    try { await deleteCat.mutateAsync({ id: cat.id }); invalidate(); toast.success('Categoría archivada'); }
    catch { toast.error('Error al archivar'); }
  };

  const handleAddCat = async () => {
    if (!newCatName.trim()) return;
    try {
      const cat = await createCat.mutateAsync({ data: { name: newCatName.trim(), sortOrder: categories.length } });
      invalidate(); setNewCatName(''); setAddingCat(false);
      setExpanded((p) => { const n = new Set(p); n.add((cat as any).id); return n; });
      toast.success('Categoría creada');
    } catch { toast.error('Error al crear categoría'); }
  };

  const handleAddSubcat = async (catId: string, name: string) => {
    try {
      await createSub.mutateAsync({ data: { categoryId: catId, name, sortOrder: 0 } });
      invalidate(); toast.success('Subcategoría añadida');
    } catch { toast.error('Error al añadir subcategoría'); }
  };

  const handleRenameSubcat = async (id: string, name: string) => {
    try { await updateSub.mutateAsync({ id, data: { name } }); invalidate(); }
    catch { toast.error('Error al renombrar subcategoría'); }
  };

  const handleArchiveSubcat = async (id: string) => {
    try { await deleteSub.mutateAsync({ id }); invalidate(); toast.success('Subcategoría eliminada'); }
    catch { toast.error('Error al eliminar subcategoría'); }
  };

  const [catSearch, setCatSearch] = useState('');

  const activeCats = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    return categories.filter((c) => c.active && (!q || c.name.toLowerCase().includes(q)));
  }, [categories, catSearch]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-card shrink-0">
        <button onClick={() => setLocation('/admin')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <Tag size={20} className="text-primary" />
        <div>
          <h1 className="font-black text-base leading-tight">Categorías</h1>
          <p className="text-xs text-muted-foreground leading-none">Grupos y secciones de la carta</p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setAddingCat(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} /> Nueva categoría
          </button>
        </div>
      </header>

      {/* Search bar */}
      <div className="px-4 py-2 border-b border-border bg-card/50 shrink-0">
        <div className="relative max-w-2xl mx-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={catSearch}
            autoFocus
            onChange={e => setCatSearch(e.target.value)}
            placeholder="Buscar categoría…"
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {catSearch && (
            <button onClick={() => setCatSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full space-y-3">
        {isLoading && <p className="text-center text-muted-foreground py-16 text-sm">Cargando…</p>}

        {/* New category form */}
        {addingCat && (
          <div className="flex items-center gap-2 p-3 bg-card border border-primary rounded-xl">
            <input
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCat(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName(''); } }}
              placeholder="Nombre de la categoría…"
              className="flex-1 bg-transparent text-sm outline-none font-semibold"
            />
            <button onClick={handleAddCat} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
            <button onClick={() => { setAddingCat(false); setNewCatName(''); }} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
          </div>
        )}

        {activeCats.map((cat) => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            expanded={expanded.has(cat.id)}
            onToggle={() => toggle(cat.id)}
            onRename={(n) => handleRename(cat.id, n)}
            onUpdateColor={(c) => handleUpdateColor(cat.id, c)}
            onUpdateIcon={(ic) => handleUpdateIcon(cat.id, ic)}
            onArchive={() => handleArchiveCat(cat)}
            onAddSubcat={(n) => handleAddSubcat(cat.id, n)}
            onRenameSubcat={handleRenameSubcat}
            onArchiveSubcat={handleArchiveSubcat}
          />
        ))}

        {!isLoading && activeCats.length === 0 && !addingCat && (
          <div className="text-center text-muted-foreground py-16 text-sm">
            <Tag size={40} className="mx-auto mb-3 opacity-20" />
            <p>No hay categorías todavía.</p>
            <button onClick={() => setAddingCat(true)} className="mt-2 text-primary underline">Crear la primera</button>
          </div>
        )}
      </main>
    </div>
  );
}
