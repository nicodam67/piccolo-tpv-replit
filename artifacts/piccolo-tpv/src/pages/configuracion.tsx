import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { ChevronLeft, Plus, Pencil, Trash2, LayoutDashboard, Check, X, Loader2, GripVertical, Palette, Copy, Eye, EyeOff, Smile, FileText, Search } from 'lucide-react';
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
  useGetAlertConfig,
  usePatchAlertConfig,
  getGetZonesQueryKey,
  getGetAlertConfigQueryKey,
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

// ─── Emoji palette ─────────────────────────────────────────────────────────────
const ZONE_EMOJIS = [
  '🍕', '🍔', '🌮', '🥩', '🐟', '🦞',
  '🍷', '🍺', '☕', '🧉', '🥂', '🍹',
  '🌿', '🏖️', '🎉', '⭐', '🔥', '🌙',
  '🎭', '🎸', '🌺', '❄️', '🏔️', '🌅',
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Zone {
  id: string;
  name: string;
  type: string;
  sortOrder: number;
  color?: string | null;
  icon?: string | null;
  active?: boolean;
  activeLayout?: string;
}

interface ReorderQueueItem {
  /** The desired post-drag zone list — applied to UI on successful flush. */
  intendedZones: Zone[];
  /** The pre-drag snapshot — restored if flush ultimately fails (conflict/server error). */
  preDragSnapshot: Zone[];
}

// ─── Reorder queue helpers ────────────────────────────────────────────────────
const REORDER_QUEUE_KEY = 'piccolo_reorder_queue';

function loadReorderQueue(): ReorderQueueItem[] {
  try {
    const raw = localStorage.getItem(REORDER_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as ReorderQueueItem[]) : [];
  } catch { return []; }
}

function saveReorderQueue(queue: ReorderQueueItem[]) {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(REORDER_QUEUE_KEY);
    } else {
      localStorage.setItem(REORDER_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch {}
}

// ─── Emoji picker popover ─────────────────────────────────────────────────────
interface EmojiPickerProps {
  currentIcon: string | null | undefined;
  onSelect: (icon: string | null) => void;
  onClose: () => void;
}

function EmojiPicker({ currentIcon, onSelect, onClose }: EmojiPickerProps) {
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
      style={{ minWidth: 230 }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">Icono de la sala</p>
      <div className="grid grid-cols-6 gap-1 mb-2">
        {ZONE_EMOJIS.map(emoji => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose(); }}
            className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all active:scale-90 hover:bg-secondary ${currentIcon === emoji ? 'bg-primary/15 ring-2 ring-primary/40' : ''}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <button
        onClick={() => { onSelect(null); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-secondary transition-colors"
      >
        <div className="w-5 h-5 rounded-md border-2 border-dashed border-muted-foreground/40" />
        Sin icono
      </button>
    </div>
  );
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
  emojiPickerZoneId: string | null;
  onEditStart: (id: string, name: string) => void;
  onEditChange: (name: string) => void;
  onEditSave: (id: string) => void;
  onEditCancel: () => void;
  onDeleteStart: (id: string) => void;
  onNavigate: (id: string) => void;
  onColorPickerToggle: (id: string) => void;
  onColorPickerClose: () => void;
  onColorSelect: (zoneId: string, color: string | null) => void;
  onEmojiPickerToggle: (id: string) => void;
  onEmojiPickerClose: () => void;
  onIconSelect: (zoneId: string, icon: string | null) => void;
  onDuplicate: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
}

function SortableZoneCard({
  zone,
  editingId,
  editingName,
  colorPickerZoneId,
  emojiPickerZoneId,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDeleteStart,
  onNavigate,
  onColorPickerToggle,
  onColorPickerClose,
  onColorSelect,
  onEmojiPickerToggle,
  onEmojiPickerClose,
  onIconSelect,
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

  const isEditing    = editingId === zone.id;
  const isColorOpen  = colorPickerZoneId === zone.id;
  const isEmojiOpen  = emojiPickerZoneId === zone.id;
  const isInactive   = zone.active === false;

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

      {/* Color dot / emoji badge */}
      {zone.icon ? (
        <span className="shrink-0 text-xl leading-none">{zone.icon}</span>
      ) : (
        <div
          className="shrink-0 w-4 h-4 rounded-full border-2 border-border transition-all"
          style={zone.color ? { backgroundColor: zone.color, borderColor: zone.color } : {}}
        />
      )}

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

          {/* Emoji picker trigger */}
          <div className="relative">
            <button
              onClick={() => onEmojiPickerToggle(zone.id)}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95"
              title="Cambiar icono"
            >
              {zone.icon
                ? <span className="text-lg leading-none">{zone.icon}</span>
                : <Smile size={14} />
              }
            </button>
            {isEmojiOpen && (
              <EmojiPicker
                currentIcon={zone.icon}
                onSelect={(icon) => onIconSelect(zone.id, icon)}
                onClose={onEmojiPickerClose}
              />
            )}
          </div>

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
    { all: true },
    { query: { queryKey: getGetZonesQueryKey({ all: true }) } }
  );

  // Alert config
  const { data: alertConfig } = useGetAlertConfig({ query: { queryKey: getGetAlertConfigQueryKey() } });
  const patchAlertConfig = usePatchAlertConfig();
  const [alertForm, setAlertForm] = useState({ reservaProximaMin: 30, sinComandaMin: 15, prefacturaPendienteMin: 10, mesaSuciaMin: 5 });
  const [alertSaved, setAlertSaved] = useState(false);
  useEffect(() => {
    if (alertConfig) {
      setAlertForm({
        reservaProximaMin: alertConfig.reservaProximaMin,
        sinComandaMin: alertConfig.sinComandaMin,
        prefacturaPendienteMin: alertConfig.prefacturaPendienteMin,
        mesaSuciaMin: alertConfig.mesaSuciaMin,
      });
    }
  }, [alertConfig]);

  const handleSaveAlertConfig = () => {
    patchAlertConfig.mutate(
      { data: alertForm },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAlertConfigQueryKey() });
          setAlertSaved(true);
          setTimeout(() => setAlertSaved(false), 2500);
        },
        onError: () => toast.error("No se pudo guardar la configuración"),
      }
    );
  };

  const [localZones, setLocalZones] = useState<Zone[]>([]);
  useEffect(() => {
    if (serverZones) setLocalZones(serverZones as Zone[]);
  }, [serverZones]);

  const [zoneSearch, setZoneSearch] = useState('');
  const filteredZones = useMemo(() => {
    const q = zoneSearch.trim().toLowerCase();
    return q ? localZones.filter(z => z.name.toLowerCase().includes(q)) : localZones;
  }, [localZones, zoneSearch]);

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
  const [emojiPickerZoneId, setEmojiPickerZoneId] = useState<string | null>(null);

  // ─── Reorder retry queue ─────────────────────────────────────────────────────
  const reorderQueueRef = useRef<ReorderQueueItem[]>(loadReorderQueue());
  const isFlushing = useRef(false);

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetZonesQueryKey() });
    queryClient.invalidateQueries({ queryKey: [...getGetZonesQueryKey(), 'all'] });
  }, [queryClient]);

  // Re-fetch zones when returning from another screen
  React.useEffect(() => {
    const onVisibility = () => { if (!document.hidden) invalidate(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [invalidate]);

  // ─── Flush queued reorder operations ────────────────────────────────────────
  // Processes queued items one-by-one in FIFO order. Called on reconnect.
  //
  // Before retrying each item we fetch the CURRENT server zone list and compute
  // patches as the diff between that state and the intended order, using the
  // server's live sortOrder values as expectedSortOrder. This means:
  //   • Patches that already landed before the network dropped are no-ops
  //     (server is already at the intended value → not included in the diff)
  //   • Stale expectedSortOrder values are never sent, so no spurious 409s
  //
  // Outcomes:
  //   Network error on fetch/patch → item stays in queue, loop stops
  //   409 or other server error    → item dropped, pre-drag snapshot restored
  //   All patches succeed / no-op  → intended order applied to UI
  const flushReorderQueue = useRef<() => Promise<void>>(undefined as any);
  flushReorderQueue.current = async () => {
    if (isFlushing.current) return;
    if (reorderQueueRef.current.length === 0) return;

    isFlushing.current = true;
    try {
      while (reorderQueueRef.current.length > 0) {
        const item = reorderQueueRef.current[0];

        // Step 1: fetch fresh server state so we know which patches are still needed
        // and can use live sortOrders as expectedSortOrder.
        let currentZones: Zone[];
        try {
          currentZones = await queryClient.fetchQuery({
            queryKey: getGetZonesQueryKey({ all: true }),
            staleTime: 0,
          }) as Zone[];
        } catch {
          // Still offline — stop and wait for the next online event
          break;
        }

        // Step 2: compute minimal patch set (only zones not yet at intended sortOrder)
        const currentOrderById = Object.fromEntries(currentZones.map(z => [z.id, z.sortOrder]));
        const patchesNeeded = item.intendedZones
          .filter(z => currentOrderById[z.id] !== undefined && currentOrderById[z.id] !== z.sortOrder)
          .map(z => ({
            zoneId: z.id,
            sortOrder: z.sortOrder,
            // Use the LIVE server sortOrder so we never send a stale expected value
            expectedSortOrder: currentOrderById[z.id],
          }));

        if (patchesNeeded.length === 0) {
          // Already converged — nothing to send
          setLocalZones(item.intendedZones);
          reorderQueueRef.current = reorderQueueRef.current.slice(1);
          saveReorderQueue(reorderQueueRef.current);
          continue;
        }

        // Step 3: send only the patches that are still outstanding
        try {
          await Promise.all(
            patchesNeeded.map(p =>
              updateZone.mutateAsync({
                zoneId: p.zoneId,
                data: { sortOrder: p.sortOrder, expectedSortOrder: p.expectedSortOrder },
              })
            )
          );
          // Success — apply intended order and remove from queue
          setLocalZones(item.intendedZones);
          reorderQueueRef.current = reorderQueueRef.current.slice(1);
          saveReorderQueue(reorderQueueRef.current);
          queryClient.invalidateQueries({ queryKey: getGetZonesQueryKey({ all: true }) });
        } catch (err: any) {
          const isNetworkError = !err?.response;
          if (isNetworkError) {
            // Still offline — keep item in queue, stop loop
            break;
          }
          // Server rejected (conflict or other) — drop item, restore snapshot
          reorderQueueRef.current = reorderQueueRef.current.slice(1);
          saveReorderQueue(reorderQueueRef.current);
          setLocalZones(item.preDragSnapshot);
          queryClient.invalidateQueries({ queryKey: getGetZonesQueryKey({ all: true }) });

          const isConflict = err?.response?.status === 409;
          toast.error(isConflict
            ? 'Orden cambiado por otro usuario. Por favor, reordena de nuevo.'
            : 'Error al guardar el orden. Los cambios han sido revertidos.'
          );
        }
      }
    } finally {
      isFlushing.current = false;
    }
  };

  // ─── Listen for reconnection to flush pending reorders ───────────────────────
  useEffect(() => {
    const handleOnline = () => {
      if (reorderQueueRef.current.length > 0) {
        flushReorderQueue.current();
      }
    };
    window.addEventListener('online', handleOnline);
    // Also attempt flush on mount in case we were offline and came back
    if (navigator.onLine && reorderQueueRef.current.length > 0) {
      flushReorderQueue.current();
    }
    return () => window.removeEventListener('online', handleOnline);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Live zone updates from other admin sessions ─────────────────────────────
  useEffect(() => {
    const socket = io({ path: '/api/socket.io' });
    socket.on('zones:refresh', () => {
      queryClient.invalidateQueries({ queryKey: getGetZonesQueryKey({ all: true }) });
    });
    return () => { socket.disconnect(); };
  }, [queryClient]);

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

    // Full pre-drag snapshot used to roll back the UI immediately on any error.
    // (serverZones from the query cache may still be stale at catch time, so we
    // capture our own copy here before the optimistic update overwrites state.)
    const preDragSnapshot = [...localZones];

    // Snapshot sort orders BEFORE the optimistic update so we can send them
    // as expectedSortOrder for optimistic concurrency control.
    const originalById = Object.fromEntries(localZones.map(z => [z.id, z.sortOrder]));

    const reordered = arrayMove(localZones, oldIndex, newIndex);
    const withOrder = reordered.map((z, i) => ({ ...z, sortOrder: i + 1 }));
    setLocalZones(withOrder);

    const changed = withOrder.filter(z => z.sortOrder !== originalById[z.id]);

    // Use allSettled so a mid-flight network drop doesn't throw — we inspect
    // each result individually to decide whether to queue, restore, or succeed.
    Promise.allSettled(
      changed.map(z =>
        updateZone.mutateAsync({
          zoneId: z.id,
          data: {
            sortOrder: z.sortOrder,
            // Guard against concurrent reorders: server rejects with 409 if
            // another admin already changed this zone's sortOrder.
            expectedSortOrder: originalById[z.id],
          },
        })
      )
    ).then(results => {
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      if (failures.length === 0) {
        // Every patch landed — just sync the query cache
        invalidate();
        return;
      }

      const hasNetworkFailure = failures.some(r => !r.reason?.response);
      const hasConflict       = failures.some(r => r.reason?.response?.status === 409);

      if (hasNetworkFailure) {
        // At least one patch failed due to connectivity.
        // Queue the full intended state; the flush will re-fetch current server
        // zones and compute which patches are still outstanding, so any patches
        // that already landed before the drop become no-ops on retry.
        reorderQueueRef.current = [
          ...reorderQueueRef.current,
          { intendedZones: withOrder, preDragSnapshot },
        ];
        saveReorderQueue(reorderQueueRef.current);
        toast('Sin conexión — el orden se guardará al reconectar', { icon: '📶' });
        // Keep the optimistic UI so staff can see the intended order.
        // Immediately attempt a flush in case connectivity returned before
        // this callback ran (the `online` event would have fired while the
        // queue was still empty, so we cannot rely on it alone).
        if (navigator.onLine) {
          flushReorderQueue.current();
        }
      } else {
        // Server-side failure (conflict or other) with no network issues —
        // restore immediately so the UI reflects the true committed state.
        setLocalZones(preDragSnapshot);

        if (hasConflict) {
          toast.error('Otro usuario reordenó las salas al mismo tiempo. Por favor, inténtalo de nuevo.');
        } else {
          toast.error('Error al guardar el orden');
        }

        // Re-fetch so localZones converges to whatever the server committed
        // (partial patches may have landed before the failure).
        queryClient.invalidateQueries({ queryKey: getGetZonesQueryKey({ all: true }) });
      }
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

  const handleIconSelect = (zoneId: string, icon: string | null) => {
    setLocalZones(prev => prev.map(z => z.id === zoneId ? { ...z, icon } : z));
    updateZone.mutate(
      { zoneId, data: { icon } },
      {
        onSuccess: () => invalidate(),
        onError: () => {
          if (serverZones) setLocalZones(serverZones as Zone[]);
          toast.error('Error al guardar el icono');
        },
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
          onClick={() => setLocation('/configuracion/documentos')}
          className="hidden sm:flex items-center gap-2 px-3 py-2 bg-secondary text-muted-foreground hover:text-foreground border border-border rounded-xl font-bold text-sm hover:border-primary/40 active:scale-95 transition-all mr-2"
        >
          <FileText size={15} /> Documentos
        </button>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md text-sm"
        >
          <Plus size={16} /> Nueva Sala
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 p-6 lg:p-10 max-w-2xl mx-auto w-full space-y-10">
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
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                value={zoneSearch}
                autoFocus
              onChange={e => setZoneSearch(e.target.value)}
                placeholder="Buscar sala…"
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {zoneSearch && (
                <button onClick={() => setZoneSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={13} />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
              <GripVertical size={13} className="opacity-60" />
              Arrastra las salas para cambiar el orden · El ojo activa o desactiva la sala
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={zoneSearch ? undefined : handleDragEnd}>
              <SortableContext items={localZones.map(z => z.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3">
                  {filteredZones.length === 0 && zoneSearch && (
                    <div className="text-center text-muted-foreground text-sm py-8">
                      <p>Sin salas para "{zoneSearch}"</p>
                      <button onClick={() => setZoneSearch('')} className="mt-2 text-primary font-semibold hover:underline">Borrar búsqueda</button>
                    </div>
                  )}
                  {filteredZones.map(zone => (
                    <SortableZoneCard
                      key={zone.id}
                      zone={zone}
                      editingId={editingId}
                      editingName={editingName}
                      deletingId={deletingId}
                      colorPickerZoneId={colorPickerZoneId}
                      emojiPickerZoneId={emojiPickerZoneId}
                      onEditStart={(id, name) => { setEditingId(id); setEditingName(name); }}
                      onEditChange={setEditingName}
                      onEditSave={handleRename}
                      onEditCancel={() => setEditingId(null)}
                      onDeleteStart={setDeletingId}
                      onNavigate={id => setLocation(`/configuracion/salas/${id}`)}
                      onColorPickerToggle={id => setColorPickerZoneId(prev => prev === id ? null : id)}
                      onColorPickerClose={() => setColorPickerZoneId(null)}
                      onColorSelect={handleColorSelect}
                      onEmojiPickerToggle={id => setEmojiPickerZoneId(prev => prev === id ? null : id)}
                      onEmojiPickerClose={() => setEmojiPickerZoneId(null)}
                      onIconSelect={handleIconSelect}
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

      {/* Alert thresholds panel (admin only) */}
      <section className="bg-card border border-border rounded-2xl p-6 max-w-2xl mx-auto w-full -mt-4">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <span className="text-amber-500 text-sm">⚠️</span>
          </div>
          <div>
            <h2 className="font-black text-base leading-tight">Umbrales de alerta</h2>
            <p className="text-muted-foreground text-xs mt-0.5">El plano resaltará las mesas que superen estos tiempos</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([
            { key: 'reservaProximaMin',       label: 'Reserva próxima',         hint: 'min antes de la hora reservada' },
            { key: 'sinComandaMin',            label: 'Mesa ocupada sin comanda', hint: 'min desde apertura sin envío' },
            { key: 'prefacturaPendienteMin',   label: 'Prefactura sin cobrar',    hint: 'min con prefactura impresa' },
            { key: 'mesaSuciaMin',             label: 'Mesa pendiente de limpieza', hint: 'min en estado "sucia"' },
          ] as const).map(({ key, label, hint }) => (
            <div key={key}>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">{label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={alertForm[key]}
                  onChange={e => setAlertForm(f => ({ ...f, [key]: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-20 px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors text-center"
                />
                <span className="text-xs text-muted-foreground">{hint}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-5 pt-5 border-t border-border">
          <button
            onClick={handleSaveAlertConfig}
            disabled={patchAlertConfig.isPending}
            className="px-5 py-2.5 bg-primary text-primary-foreground font-black text-sm uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all flex items-center gap-2 shadow-md disabled:opacity-50"
          >
            {patchAlertConfig.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {alertSaved ? '✓ Guardado' : 'Guardar umbrales'}
          </button>
          {alertSaved && <span className="text-xs text-green-500 font-bold animate-pulse">Cambios guardados</span>}
        </div>
      </section>

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
