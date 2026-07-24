import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAdminModifierGroups,
  useCreateAdminModifierGroup,
  useUpdateAdminModifierGroup,
  useDeleteAdminModifierGroup,
  useCreateAdminModifier,
  useUpdateAdminModifier,
  useDeleteAdminModifier,
  getGetAdminModifierGroupsQueryKey,
} from '@workspace/api-client-react/catalog-admin';
import type { AdminModifierGroup } from '@workspace/api-client-react/catalog-admin';
import {
  ArrowLeft, Sliders, Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Search, Loader2,
} from 'lucide-react';

// ── Inline editable ───────────────────────────────────────────────────────────
function InlineEdit({ value, onSave, className = '' }: { value: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const start = () => { setDraft(value); setEditing(true); };
  const save = () => { if (draft.trim() && draft !== value) onSave(draft.trim()); setEditing(false); };
  if (editing) return (
    <div className="flex items-center gap-1">
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        className={`bg-secondary border border-primary rounded-md px-2 py-0.5 text-sm outline-none ${className}`} />
      <button onClick={save} className="text-green-400"><Check size={13} /></button>
      <button onClick={() => setEditing(false)} className="text-muted-foreground"><X size={13} /></button>
    </div>
  );
  return (
    <button onClick={start} className={`text-left hover:text-primary transition-colors group ${className}`}>
      <span className="border-b border-dashed border-transparent group-hover:border-muted-foreground">{value}</span>
    </button>
  );
}

// ── Group row ─────────────────────────────────────────────────────────────────
function GroupRow({ group, onRefresh }: { group: AdminModifierGroup; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [addingOption, setAddingOption] = useState(false);
  const [optName, setOptName] = useState('');
  const [optDelta, setOptDelta] = useState('0');

  const updateGroup = useUpdateAdminModifierGroup();
  const deleteGroup = useDeleteAdminModifierGroup();
  const createModifier = useCreateAdminModifier();
  const updateModifier = useUpdateAdminModifier();
  const deleteModifier = useDeleteAdminModifier();

  const handleRename = async (name: string) => {
    try { await updateGroup.mutateAsync({ id: group.id, data: { name } }); onRefresh(); }
    catch { toast.error('Error al renombrar'); }
  };

  const handleToggleRequired = async () => {
    try { await updateGroup.mutateAsync({ id: group.id, data: { required: !group.required } }); onRefresh(); }
    catch { toast.error('Error'); }
  };

  const handleMaxSelect = async (n: number) => {
    if (n < 1) return;
    try { await updateGroup.mutateAsync({ id: group.id, data: { maxSelect: n } }); onRefresh(); }
    catch { toast.error('Error'); }
  };

  const handleArchive = async () => {
    if (!confirm(`¿Archivar el grupo "${group.name}"?`)) return;
    try { await deleteGroup.mutateAsync({ id: group.id }); onRefresh(); toast.success('Grupo archivado'); }
    catch { toast.error('Error al archivar'); }
  };

  const handleAddOption = async () => {
    if (!optName.trim()) return;
    try {
      await createModifier.mutateAsync({ groupId: group.id, data: { name: optName.trim(), priceDelta: optDelta || '0' } });
      onRefresh(); setOptName(''); setOptDelta('0'); setAddingOption(false); toast.success('Opción añadida');
    } catch { toast.error('Error al añadir'); }
  };

  const handleRenameOpt = async (id: string, name: string) => {
    try { await updateModifier.mutateAsync({ id, data: { name } }); onRefresh(); }
    catch { toast.error('Error'); }
  };

  const handleArchiveOpt = async (id: string) => {
    try { await deleteModifier.mutateAsync({ id }); onRefresh(); toast.success('Opción eliminada'); }
    catch { toast.error('Error'); }
  };

  const activeOptions = group.modifiers.filter((m) => m.active);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <Sliders size={15} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <InlineEdit value={group.name} onSave={handleRename} className="font-semibold text-sm" />
          <div className="flex items-center gap-3 mt-0.5">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${group.required ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-secondary text-muted-foreground border-border'}`}>
              {group.required ? 'Obligatorio' : 'Opcional'}
            </span>
            <span className="text-[10px] text-muted-foreground">Máx {group.maxSelect} selección{group.maxSelect !== 1 ? 'es' : ''}</span>
            <span className="text-[10px] text-muted-foreground">{activeOptions.length} opción{activeOptions.length !== 1 ? 'es' : ''}</span>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); handleArchive(); }} disabled={deleteGroup.isPending}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50">
          {deleteGroup.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
        {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
      </div>

      {expanded && (
        <div className="border-t border-border bg-secondary/10">
          {/* Group settings */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border/50">
            <button onClick={handleToggleRequired} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {group.required ? <ToggleRight size={16} className="text-amber-400" /> : <ToggleLeft size={16} />}
              {group.required ? 'Obligatorio' : 'Opcional'}
            </button>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Máx:</span>
              <button onClick={() => handleMaxSelect(group.maxSelect - 1)} className="w-5 h-5 rounded border border-border hover:bg-secondary flex items-center justify-center font-bold">−</button>
              <span className="font-semibold text-foreground w-4 text-center">{group.maxSelect}</span>
              <button onClick={() => handleMaxSelect(group.maxSelect + 1)} className="w-5 h-5 rounded border border-border hover:bg-secondary flex items-center justify-center font-bold">+</button>
            </div>
          </div>

          {/* Options */}
          <div className="divide-y divide-border/30">
            {activeOptions.map((opt) => (
              <div key={opt.id} className="flex items-center gap-3 px-4 py-2 pl-7">
                <InlineEdit value={opt.name} onSave={(n) => handleRenameOpt(opt.id, n)} className="flex-1 text-sm" />
                <span className={`text-xs font-mono ${parseFloat(opt.priceDelta) > 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                  {parseFloat(opt.priceDelta) > 0 ? '+' : ''}{parseFloat(opt.priceDelta).toFixed(2)}€
                </span>
                <button onClick={() => handleArchiveOpt(opt.id)} disabled={deleteModifier.isPending}
                  className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive transition-colors disabled:opacity-50">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>

          {/* Add option */}
          {addingOption ? (
            <div className="flex items-center gap-2 px-4 py-2.5 pl-7 border-t border-border/50">
              <input
                autoFocus value={optName} onChange={(e) => setOptName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(); if (e.key === 'Escape') setAddingOption(false); }}
                placeholder="Nombre de opción…"
                className="flex-1 bg-secondary border border-primary rounded-md px-2 py-1 text-sm outline-none"
              />
              <input
                value={optDelta} onChange={(e) => setOptDelta(e.target.value)}
                placeholder="±€"
                className="w-16 bg-secondary border border-border rounded-md px-2 py-1 text-sm outline-none text-center"
              />
              <button onClick={handleAddOption} className="text-green-400"><Check size={14} /></button>
              <button onClick={() => setAddingOption(false)} className="text-muted-foreground"><X size={14} /></button>
            </div>
          ) : (
            <button
              onClick={() => setAddingOption(true)}
              className="w-full flex items-center gap-2 px-4 py-2.5 pl-7 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors border-t border-border/50"
            >
              <Plus size={12} /> Añadir opción
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ModificadoresPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: groups = [], isLoading } = useGetAdminModifierGroups();
  const createGroup = useCreateAdminModifierGroup();

  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: getGetAdminModifierGroupsQueryKey() }), [qc]);

  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) invalidate(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [invalidate]);

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createGroup.mutateAsync({ data: { name: newGroupName.trim(), sortOrder: groups.length } });
      invalidate(); setNewGroupName(''); setAddingGroup(false); toast.success('Grupo creado');
    } catch { toast.error('Error al crear grupo'); }
  };

  const [modSearch, setModSearch] = useState('');

  const activeGroups = useMemo(() => {
    const q = modSearch.trim().toLowerCase();
    return groups.filter((g) => g.active && (!q || g.name.toLowerCase().includes(q)));
  }, [groups, modSearch]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-card shrink-0">
        <button onClick={() => setLocation('/admin')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <Sliders size={20} className="text-primary" />
        <div>
          <h1 className="font-black text-base leading-tight">Modificadores</h1>
          <p className="text-xs text-muted-foreground leading-none">Grupos de opciones por producto</p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setAddingGroup(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} /> Nuevo grupo
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border bg-card/50 shrink-0">
        <div className="relative max-w-2xl mx-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={modSearch}
            autoFocus
            onChange={e => setModSearch(e.target.value)}
            placeholder="Buscar grupo de modificadores…"
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {modSearch && (
            <button onClick={() => setModSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full space-y-3">
        {isLoading && <p className="text-center text-muted-foreground py-16 text-sm">Cargando…</p>}

        {addingGroup && (
          <div className="flex items-center gap-2 p-3 bg-card border border-primary rounded-xl">
            <input
              autoFocus value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName(''); } }}
              placeholder="Nombre del grupo (ej: Sin ingredientes)…"
              className="flex-1 bg-transparent text-sm outline-none font-semibold"
            />
            <button onClick={handleAddGroup} className="text-green-400"><Check size={16} /></button>
            <button onClick={() => { setAddingGroup(false); setNewGroupName(''); }} className="text-muted-foreground"><X size={16} /></button>
          </div>
        )}

        {activeGroups.map((group) => (
          <GroupRow key={group.id} group={group} onRefresh={invalidate} />
        ))}

        {!isLoading && activeGroups.length === 0 && !addingGroup && (
          <div className="text-center text-muted-foreground py-16 text-sm">
            <Sliders size={40} className="mx-auto mb-3 opacity-20" />
            <p>No hay grupos de modificadores todavía.</p>
            <button onClick={() => setAddingGroup(true)} className="mt-2 text-primary underline">Crear el primero</button>
          </div>
        )}
      </main>
    </div>
  );
}
