import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, LayoutDashboard, Check, X, Loader2, GripVertical, Palette, Copy, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useGetZones,
  useCreateZone,
  useUpdateZone,
  useDeleteZone,
  useDuplicateZone,
  getGetZonesQueryKey,
} from '@workspace/api-client-react';

// ─── Color palette ─────────────────────────────────────────────────────────────
const ZONE_COLORS = [
  { label: 'Verde',   value: '#22c55e' },
  { label: 'Lima',    value: '#84cc16' },
  { label: 'Naranja', value: '#f97316' },
  { label: 'Rojo',    value: '#ef4444' },
  { label: 'Rosa',    value: '#ec4899' },
  { label: 'Violeta', value: '#a855f7' },
  { label: 'Índigo',  value: '#6366f1' },
  { label: 'Azul',    value: '#3b82f6' },
  { label: 'Cian',    value: '#06b6d4' },
  { label: 'Amarillo',value: '#eab308' },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Zone {
  id: string;
  name: string;
  type: string;
  sortOrder: number;
  color?: string | null;
  active?: boolean;
  activeLayout?: string;
}

// ─── Color picker popover ─────────────────────────────────────────────────────
interface ColorPickerProps {
  currentColor: string | null | undefined;
  onSelect: (color: string | null) => void;
  onClose: () => void;
}

function ColorPicker({ currentColor, onSelect, onClose }: ColorPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handleClick); };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-2xl shadow-2xl p-3"
      style={{ minWidth: 220 }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">Color de la sala</p>
      <div className="grid grid-cols-5 gap-2 mb-2">
        {ZONE_COLORS.map(c => (
          <button
            key={c.value}
            title={c.label}
            onClick={() => { onSelect(c.value); onClose(); }}
            className="w-9 h-9 rounded-xl transition-all active:scale-90 flex items-center justify-center"
            style={{ backgroundColor: c.value, boxShadow: currentColor === c.value ? `0 0 0 3px white, 0 0 0 5px ${c.value}` : 'none' }}
          >
            {currentColor === c.value && <Check size={14} color="white" strokeWidth={3} />}
          </button>
        ))}
      </div>
      <button
        onClick={() => { onSelect(null); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-secondary transition-colors"
      >
        <div className="w-5 h-5 rounded-md border-2 border-dashed border-muted-foreground/40" />
        Sin color
      </button>
    </div>
  );
}

// ─── Sortable card ────────────────────────────────────────────────────────────
interface SortableZoneCardProps {
  zone: Zone;
  editingId: string | null;
  editingName: string;
  deletingId: string | null;
  colorPickerZoneId: string | null;
  onEditStart: (id: string, name: string) => void;
  onEditChange: (name: string) => void;
  onEditSave: (id: string) => void;
  onEditCancel: () => void;
  onDeleteStart: (id: string) => void;
  onNavigate: (id: string) => void;
  onColorPickerToggle: (id: string) => void;
  onColorPickerClose: () => void;
  onColorSelect: (zoneId: string, color: string | null) => void;
  onDuplicate: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
}

function SortableZoneCard({
  zone,
  editingId,
  editingName,
  colorPickerZoneId,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDeleteStart,
  onNavigate,
  onColorPickerToggle,
  onColorPickerClose,
  onColorSelect,
  onDuplicate,
  onToggleActive,
}: SortableZoneCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: zone.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const isEditing  = editingId === zone.id;
  const isColorOpen = colorPickerZoneId === zone.id;
  const isInactive  = zone.active === false;

  const LAYOUT_LABELS: Record<string, string> = {
    normal: 'Normal', verano: 'Verano', invierno: 'Invierno', eventos: 'Eventos',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-3 ${
        isInactive ? 'border-border/40 opacity-55' : 'border-border'
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-grab active:cursor-grabbing touch-none"
        aria-label="Arrastrar para reordenar"
      >
        <GripVertical size={18} />
      </button>

      {/* Color dot */}
      <div
        className="shrink-0 w-4 h-4 rounded-full border-2 border-border transition-all"
        style={zone.color ? { backgroundColor: zone.color, borderColor: zone.color } : {}}
      />

      {/* Name / edit row */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={editingName}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onEditSave(zone.id);
                if (e.key === 'Escape') onEditCancel();
              }}
              className="flex-1 bg-background border border-primary rounded-lg px-3 py-1.5 text-base font-bold focus:outline-none"
            />
            <button
              onClick={() => onEditSave(zone.id)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground active:scale-95"
            >
              <Check size={14} />
            </button>
            <button
              onClick={onEditCancel}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary active:scale-95"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black leading-tight truncate">{zone.name}</h2>
              {isInactive && (
                <span className="px-2 py-0.5 rounded-full bg-secondary text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Inactiva
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">{zone.type}</span>
              {zone.activeLayout && zone.activeLayout !== 'normal' && (
                <span className="text-xs text-primary font-bold uppercase tracking-widest">
                  · {LAYOUT_LABELS[zone.activeLayout] ?? zone.activeLayout}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions — hidden while editing */}
      {!isEditing && (
        <div className="flex items-center gap-2 shrink-0">
          {/* Active toggle */}
          <button
            onClick={() => onToggleActive(zone.id, !isInactive)}
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors active:scale-95 ${
              isInactive
                ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
            }`}
            title={isInactive ? 'Activar sala' : 'Desactivar sala'}
          >
            {isInactive ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>

          {/* Color picker trigger */}
          <div className="relative">
            <button
              onClick={() => onColorPickerToggle(zone.id)}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95"
              title="Cambiar color"
            >
              {zone.color
                ? <div className="w-4 h-4 rounded-full border-2 border-border" style={{ backgroundColor: zone.color }} />
                : <Palette size={14} />
              }
            </button>
            {isColorOpen && (
              <ColorPicker
                currentColor={zone.color}
                onSelect={(color) => onColorSelect(zone.id, color)}
                onClose={onColorPickerClose}
              />
            )}
          </div>

          {!isInactive && (
            <button
              onClick={() => onNavigate(zone.id)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary border border-primary/30 rounded-xl font-bold text-sm hover:bg-primary hover:text-primary-foreground transition-all active:scale-95"
            >
              <LayoutDashboard size={13} />
              <span className="hidden sm:inline">Plano</span>
            </button>
          )}
          <button
            onClick={() => onDuplicate(zone.id)}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95"
            title="Duplicar sala"
          >
            <Copy size={14} />
          </button>
          <button
            onClick={() => onEditStart(zone.id, zone.name)}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDeleteStart(zone.id)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all active:scale-95"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Configuracion() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Admin guard
  useEffect(() => {
    const empStr = localStorage.getItem('employee');
    if (!empStr) { setLocation('/'); return; }
    try {
      const emp = JSON.parse(empStr);
      if (emp.role !== 'admin') setLocation('/tables');
    } catch { setLocation('/'); }
  }, [setLocation]);

  // Admin sees all zones including inactive
  const { data: serverZones, isLoading } = useGetZones(
    { all: true } as any,
    { query: { queryKey: [...getGetZonesQueryKey(), 'all'] } }
  );

  const [localZones, setLocalZones] = useState<Zone[]>([]);
  useEffect(() => {
    if (serverZones) setLocalZones(serverZones as Zone[]);
  }, [serverZones]);

  const createZone    = useCreateZone();
  const updateZone    = useUpdateZone();
  const deleteZone    = useDeleteZone();
  const duplicateZone = useDuplicateZone();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newZoneName, setNewZoneName]           = useState('');
  const [editingId, setEditingId]               = useState<string | null>(null);
  const [editingName, setEditingName]           = useState('');
  const [deletingId, setDeletingId]             = useState<string | null>(null);
  const [colorPickerZoneId, setColorPickerZoneId] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetZonesQueryKey() });
    queryClient.invalidateQueries({ queryKey: [...getGetZonesQueryKey(), 'all'] });
  };

  // ─── DnD sensors ────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localZones.findIndex(z => z.id === active.id);
    const newIndex = localZones.findIndex(z => z.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(localZones, oldIndex, newIndex);
    const withOrder = reordered.map((z, i) => ({ ...z, sortOrder: i + 1 }));
    setLocalZones(withOrder);

    const originalById = Object.fromEntries(localZones.map(z => [z.id, z.sortOrder]));
    const changed = withOrder.filter(z => z.sortOrder !== originalById[z.id]);

    Promise.all(
      changed.map(z =>
        updateZone.mutateAsync({ zoneId: z.id, data: { sortOrder: z.sortOrder } })
      )
    )
      .then(invalidate)
      .catch(() => {
        if (serverZones) setLocalZones(serverZones as Zone[]);
        toast.error('Error al guardar el orden');
      });
  };

  // ─── CRUD handlers ────────────────────────────────────────────────────────
  const handleCreate = () => {
    if (!newZoneName.trim()) return;
    createZone.mutate(
      { data: { name: newZoneName.trim(), type: 'dining' } },
      {
        onSuccess: () => { invalidate(); setShowCreateDialog(false); setNewZoneName(''); toast.success('Sala creada'); },
        onError: () => toast.error('Error al crear sala'),
      }
    );
  };

  const handleRename = (zoneId: string) => {
    if (!editingName.trim()) return;
    updateZone.mutate(
      { zoneId, data: { name: editingName.trim() } },
      {
        onSuccess: () => { invalidate(); setEditingId(null); toast.success('Sala renombrada'); },
        onError: () => toast.error('Error al renombrar sala'),
      }
    );
  };

  const handleDelete = (zoneId: string) => {
    deleteZone.mutate(
      { zoneId },
      {
        onSuccess: () => { invalidate(); setDeletingId(null); toast.success('Sala eliminada'); },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? 'Error al eliminar sala';
          toast.error(msg);
          setDeletingId(null);
        },
      }
    );
  };

  const handleDuplicate = (zoneId: string) => {
    duplicateZone.mutate(
      { zoneId },
      {
        onSuccess: (zone: any) => { invalidate(); toast.success(`Sala "${zone.name}" creada`); },
        onError: () => toast.error('Error al duplicar sala'),
      }
    );
  };

  const handleColorSelect = (zoneId: string, color: string | null) => {
    setLocalZones(prev => prev.map(z => z.id === zoneId ? { ...z, color } : z));
    updateZone.mutate(
      { zoneId, data: { color } },
      {
        onSuccess: () => invalidate(),
        onError: () => {
          if (serverZones) setLocalZones(serverZones as Zone[]);
          toast.error('Error al guardar el color');
        },
      }
    );
  };

  const handleToggleActive = (zoneId: string, makeActive: boolean) => {
    setLocalZones(prev => prev.map(z => z.id === zoneId ? { ...z, active: makeActive } : z));
    updateZone.mutate(
      { zoneId, data: { active: makeActive } },
      {
        onSuccess: () => { invalidate(); toast.success(makeActive ? 'Sala activada' : 'Sala desactivada'); },
        onError: () => {
          if (serverZones) setLocalZones(serverZones as Zone[]);
          toast.error('Error al cambiar estado de la sala');
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-16 flex items-center px-4 lg:px-6 border-b border-border bg-card shrink-0 shadow-sm">
        <button
          onClick={() => setLocation('/tables')}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-xl font-bold ml-3">Configuración · Salas</h1>
        <div className="flex-1" />
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md text-sm"
        >
          <Plus size={16} /> Nueva Sala
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 p-6 lg:p-10 max-w-2xl mx-auto w-full">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : !localZones.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <LayoutDashboard size={48} className="mb-4 opacity-30" />
            <p className="text-lg font-semibold">No hay salas configuradas</p>
            <p className="text-sm mt-1">Crea la primera sala para empezar a distribuir mesas</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
              <GripVertical size={13} className="opacity-60" />
              Arrastra las salas para cambiar el orden · El ojo activa o desactiva la sala
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={localZones.map(z => z.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3">
                  {localZones.map(zone => (
                    <SortableZoneCard
                      key={zone.id}
                      zone={zone}
                      editingId={editingId}
                      editingName={editingName}
                      deletingId={deletingId}
                      colorPickerZoneId={colorPickerZoneId}
                      onEditStart={(id, name) => { setEditingId(id); setEditingName(name); }}
                      onEditChange={setEditingName}
                      onEditSave={handleRename}
                      onEditCancel={() => setEditingId(null)}
                      onDeleteStart={setDeletingId}
                      onNavigate={id => setLocation(`/configuracion/salas/${id}`)}
                      onColorPickerToggle={id => setColorPickerZoneId(prev => prev === id ? null : id)}
                      onColorPickerClose={() => setColorPickerZoneId(null)}
                      onColorSelect={handleColorSelect}
                      onDuplicate={handleDuplicate}
                      onToggleActive={handleToggleActive}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
      </main>

      {/* Create dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-black mb-4">Nueva Sala</h3>
            <input
              autoFocus
              placeholder="Ej. Terraza, Privado, Barra…"
              value={newZoneName}
              onChange={e => setNewZoneName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreateDialog(false); }}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-base focus:outline-none focus:border-primary transition-colors mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowCreateDialog(false); setNewZoneName(''); }}
                className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl active:scale-95">Cancelar</button>
              <button onClick={handleCreate} disabled={createZone.isPending || !newZoneName.trim()}
                className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                {createZone.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-black mb-2">¿Eliminar sala?</h3>
            <p className="text-muted-foreground text-sm mb-6">Se eliminarán también todas las mesas de esta sala. Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 py-3 bg-secondary font-bold rounded-xl active:scale-95">Cancelar</button>
              <button onClick={() => handleDelete(deletingId)} disabled={deleteZone.isPending}
                className="flex-1 py-3 bg-destructive text-destructive-foreground font-bold rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                {deleteZone.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
