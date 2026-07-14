import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Trash2, Link, Unlink, Loader2, Check, ZoomIn, ZoomOut, Maximize2, Lock, LockOpen, Copy } from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetZoneTables,
  useGetZones,
  useCreateTable,
  useUpdateTable,
  useDeleteTable,
  useDuplicateTable,
  getGetZoneTablesQueryKey,
  getGetZonesQueryKey,
  type Table,
} from '@workspace/api-client-react';

// Canvas logical size
const CANVAS_W = 1600;
const CANVAS_H = 900;
const GRID = 20; // snap size in px

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.0;
const ZOOM_STORAGE_KEY = 'piccolo_editor_zoom';

type LocalTable = Table & { _saving?: boolean };

type DragState = {
  pointerId: number;
  originPointer: { x: number; y: number };
  originPositions: Record<string, { x: number; y: number }>;
};

type Shape = 'square' | 'round' | 'rect';
const SIZES: Record<'S' | 'M' | 'L', { square: [number, number]; round: [number, number]; rect: [number, number] }> = {
  S: { square: [60, 60],  round: [60, 60],  rect: [90,  60]  },
  M: { square: [80, 80],  round: [80, 80],  rect: [120, 80]  },
  L: { square: [100, 100], round: [100, 100], rect: [160, 100] },
};

function snap(v: number, min = 0, max = 9999) {
  return Math.max(min, Math.min(max, Math.round(v / GRID) * GRID));
}

function tableStyles(t: LocalTable, _selected: boolean) {
  const base: React.CSSProperties = {
    position: 'absolute',
    left: t.x,
    top: t.y,
    width: t.width,
    height: t.height,
    cursor: 'pointer',
    transition: 'box-shadow 0.1s, border-color 0.1s',
    userSelect: 'none',
    touchAction: 'none',
  };
  return base;
}

function TableShape({ t, selected, locked, onPointerDown }: {
  t: LocalTable;
  selected: boolean;
  locked?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const isMerged       = !!t.mergeGroup;
  const isOutOfService = t.status === 'out_of_service';
  const rotation       = t.rotation ?? 0;

  const borderColor = isOutOfService
    ? '#44444e'
    : selected
    ? '#f59e0b'
    : isMerged
    ? '#c084fc'
    : t.status === 'occupied' ? '#c05c4a' : '#3f573c';

  const bgColor   = isOutOfService ? '#1a1a1e' : t.status === 'occupied' ? '#45201a' : '#253324';
  const textColor = isOutOfService ? '#666670' : t.status === 'occupied' ? '#f5dcd8' : '#dcecdb';
  const radius    = t.shape === 'round' ? '50%' : '10px';

  return (
    <div
      style={{
        ...tableStyles(t, selected),
        borderRadius: radius,
        backgroundColor: bgColor,
        border: `2.5px solid ${borderColor}`,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: 'center center',
        opacity: isOutOfService ? 0.6 : 1,
        boxShadow: selected
          ? `0 0 0 3px rgba(245,158,11,0.35), 0 4px 16px rgba(0,0,0,0.5)`
          : isMerged
          ? `0 0 0 2px rgba(192,132,252,0.2), 0 2px 8px rgba(0,0,0,0.4)`
          : `0 2px 8px rgba(0,0,0,0.4)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        cursor: locked ? 'default' : 'grab',
      }}
      onPointerDown={onPointerDown}
    >
      <span style={{ color: textColor, fontWeight: 900, fontSize: Math.max(11, t.width / 6), lineHeight: 1, pointerEvents: 'none' }}>
        {t.name}
      </span>
      <span style={{ color: textColor, opacity: 0.65, fontSize: 10, pointerEvents: 'none' }}>
        {t.capacity}p
      </span>
      {isMerged && (
        <span style={{ position: 'absolute', top: 3, right: 4, fontSize: 8, color: '#c084fc', fontWeight: 700 }}>⬡</span>
      )}
      {isOutOfService && (
        <span style={{ position: 'absolute', top: 3, left: 4, fontSize: 9, color: '#666670', fontWeight: 700 }}>⊘</span>
      )}
      {rotation !== 0 && (
        <span style={{ position: 'absolute', bottom: 3, right: 4, fontSize: 8, color: textColor, opacity: 0.5 }}>{rotation}°</span>
      )}
    </div>
  );
}

export default function ZoneEditor() {
  const { zoneId } = useParams<{ zoneId: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Admin guard
  useEffect(() => {
    const empStr = localStorage.getItem('employee');
    if (!empStr) { setLocation('/'); return; }
    try {
      const emp = JSON.parse(empStr);
      if (emp.role !== 'admin') setLocation('/tables');
    } catch { setLocation('/'); }
  }, [setLocation]);

  // Zoom state — persisted per session
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const saved = sessionStorage.getItem(ZOOM_STORAGE_KEY);
      const parsed = saved ? parseFloat(saved) : NaN;
      return !isNaN(parsed) && parsed >= ZOOM_MIN && parsed <= ZOOM_MAX ? parsed : 1;
    } catch { return 1; }
  });

  const persistZoom = useCallback((z: number) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, parseFloat(z.toFixed(2))));
    setZoom(clamped);
    try { sessionStorage.setItem(ZOOM_STORAGE_KEY, String(clamped)); } catch { /* ignore */ }
    return clamped;
  }, []);

  const handleZoomIn  = () => persistZoom(zoom + ZOOM_STEP);
  const handleZoomOut = () => persistZoom(zoom - ZOOM_STEP);

  const handleFit = useCallback(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const { width: cw, height: ch } = el.getBoundingClientRect();
    const fitZoom = Math.min(cw / CANVAS_W, ch / CANVAS_H) * 0.98;
    persistZoom(fitZoom);
  }, [persistZoom]);

  const { data: zones } = useGetZones({ query: { queryKey: getGetZonesQueryKey() } });
  const zoneName = zones?.find(z => z.id === zoneId)?.name ?? '…';

  const { data: serverTables, isLoading } = useGetZoneTables(zoneId!, {
    query: { enabled: !!zoneId, queryKey: getGetZoneTablesQueryKey(zoneId!) }
  });

  const [localTables, setLocalTables] = useState<LocalTable[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [locked, setLocked] = useState(false);

  // Keep a ref for zoom so drag handlers always see the latest value
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Pinch-to-zoom — non-passive so we can preventDefault and block scroll
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    function dist(t: TouchList) {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        pinchRef.current = { startDist: dist(e.touches), startZoom: zoomRef.current };
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault(); // prevent browser pan/zoom during pinch
        const scale = dist(e.touches) / pinchRef.current.startDist;
        persistZoom(pinchRef.current.startZoom * scale);
      }
    }

    function onTouchEnd() {
      pinchRef.current = null;
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [persistZoom]);

  useEffect(() => {
    if (serverTables) setLocalTables(serverTables.map(t => ({ ...t })));
  }, [serverTables]);

  const createTable    = useCreateTable();
  const updateTable    = useUpdateTable();
  const deleteTable    = useDeleteTable();
  const duplicateTable = useDuplicateTable();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetZoneTablesQueryKey(zoneId!) });
  }, [queryClient, zoneId]);

  // --- Drag & Drop ---
  const handleTablePointerDown = useCallback((e: React.PointerEvent, tableId: string) => {
    if (locked) return; // locked mode: no drag
    e.stopPropagation();
    e.preventDefault();

    setSelectedIds(prev => {
      const next = e.shiftKey ? new Set([...prev, tableId]) : (prev.has(tableId) ? prev : new Set([tableId]));
      return next;
    });

    const activeIds = selectedIds.has(tableId) ? selectedIds : new Set([tableId]);
    const originPositions: Record<string, { x: number; y: number }> = {};
    for (const id of activeIds) {
      const t = localTables.find(t => t.id === id);
      if (t) originPositions[id] = { x: t.x, y: t.y };
    }
    if (!originPositions[tableId]) {
      const t = localTables.find(t => t.id === tableId);
      if (t) originPositions[tableId] = { x: t.x, y: t.y };
    }

    setDragState({ pointerId: e.pointerId, originPointer: { x: e.clientX, y: e.clientY }, originPositions });
    canvasRef.current?.setPointerCapture(e.pointerId);
  }, [selectedIds, localTables]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;
    // Divide client-space delta by zoom to get canvas-space delta
    const z = zoomRef.current;
    const dx = (e.clientX - dragState.originPointer.x) / z;
    const dy = (e.clientY - dragState.originPointer.y) / z;
    setLocalTables(prev => prev.map(t => {
      if (!dragState.originPositions[t.id]) return t;
      const ox = dragState.originPositions[t.id].x;
      const oy = dragState.originPositions[t.id].y;
      return { ...t, x: snap(ox + dx, 0, CANVAS_W - t.width), y: snap(oy + dy, 0, CANVAS_H - t.height) };
    }));
  }, [dragState]);

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;
    setDragState(null);
    // Save moved tables
    const movedIds = Object.keys(dragState.originPositions);
    for (const id of movedIds) {
      const t = localTables.find(t => t.id === id);
      if (!t) continue;
      const orig = dragState.originPositions[id];
      if (t.x !== orig.x || t.y !== orig.y) {
        updateTable.mutate({ tableId: id, data: { x: t.x, y: t.y } }, {
          onSuccess: invalidate,
          onError: () => toast.error('Error al guardar posición'),
        });
      }
    }
  }, [dragState, localTables, updateTable, invalidate]);

  const handleCanvasBgClick = (e: React.PointerEvent) => {
    if (e.target === canvasRef.current) setSelectedIds(new Set());
  };

  // --- Actions ---
  const handleAddTable = () => {
    const nextNum = (localTables.reduce((m, t) => Math.max(m, parseInt(t.name.replace(/\D/g, '')) || 0), 0)) + 1;
    const x = snap(Math.min(CANVAS_W / 2 - 40, 400) + Math.random() * 60, 0, CANVAS_W - 80);
    const y = snap(Math.min(CANVAS_H / 2 - 40, 200) + Math.random() * 60, 0, CANVAS_H - 80);
    createTable.mutate(
      { zoneId: zoneId!, data: { name: String(nextNum), capacity: 4, x, y, width: 80, height: 80, shape: 'square' } },
      {
        onSuccess: (newTable) => {
          invalidate();
          setSelectedIds(new Set([newTable.id]));
          toast.success(`Mesa ${newTable.name} creada`);
        },
        onError: () => toast.error('Error al crear mesa'),
      }
    );
  };

  const handleMerge = () => {
    if (selectedIds.size < 2) { toast.error('Selecciona al menos 2 mesas'); return; }
    const groupId = crypto.randomUUID();
    for (const id of selectedIds) {
      updateTable.mutate({ tableId: id, data: { mergeGroup: groupId } }, {
        onSuccess: invalidate,
        onError: () => toast.error('Error al unir mesas'),
      });
    }
    toast.success('Mesas unidas');
  };

  const handleUnmerge = () => {
    for (const id of selectedIds) {
      updateTable.mutate({ tableId: id, data: { mergeGroup: null } }, {
        onSuccess: invalidate,
        onError: () => toast.error('Error al separar mesas'),
      });
    }
    toast.success('Mesas separadas');
  };

  const handleDelete = () => {
    if (!selectedIds.size) return;
    for (const id of selectedIds) {
      deleteTable.mutate({ tableId: id }, {
        onSuccess: () => {
          invalidate();
          setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? 'Error al eliminar mesa';
          toast.error(msg);
        },
      });
    }
    toast.success('Mesa(s) eliminada(s)');
  };

  const handleDuplicate = () => {
    if (selectedIds.size !== 1) return;
    const id = [...selectedIds][0];
    duplicateTable.mutate({ tableId: id }, {
      onSuccess: (newTable) => {
        invalidate();
        setSelectedIds(new Set([newTable.id]));
        toast.success(`Mesa duplicada → ${newTable.name}`);
      },
      onError: () => toast.error('Error al duplicar mesa'),
    });
  };

  const handleUpdateProp = (field: string, value: unknown) => {
    for (const id of selectedIds) {
      updateTable.mutate({ tableId: id, data: { [field]: value } }, {
        onSuccess: invalidate,
        onError: () => toast.error('Error al actualizar'),
      });
    }
    setLocalTables(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, [field]: value } as LocalTable : t));
  };

  const handleShapeChange = (shape: Shape) => {
    for (const id of selectedIds) {
      const t = localTables.find(t => t.id === id);
      if (!t) continue;
      const w = shape === 'rect' ? Math.max(t.width, Math.round(t.height * 1.5)) : t.height;
      updateTable.mutate({ tableId: id, data: { shape, width: w, height: t.height } }, {
        onSuccess: invalidate,
        onError: () => toast.error('Error al actualizar forma'),
      });
    }
    setLocalTables(prev => prev.map(t => {
      if (!selectedIds.has(t.id)) return t;
      const w = shape === 'rect' ? Math.max(t.width, Math.round(t.height * 1.5)) : t.height;
      return { ...t, shape, width: w };
    }));
  };

  const handleSizeChange = (sizeKey: 'S' | 'M' | 'L') => {
    for (const id of selectedIds) {
      const t = localTables.find(t => t.id === id);
      if (!t) continue;
      const [w, h] = SIZES[sizeKey][t.shape as Shape] ?? SIZES[sizeKey].square;
      updateTable.mutate({ tableId: id, data: { width: w, height: h } }, {
        onSuccess: invalidate,
        onError: () => toast.error('Error al actualizar tamaño'),
      });
    }
    setLocalTables(prev => prev.map(t => {
      if (!selectedIds.has(t.id)) return t;
      const [w, h] = SIZES[sizeKey][t.shape as Shape] ?? SIZES[sizeKey].square;
      return { ...t, width: w, height: h };
    }));
  };

  // Selected table data (first selected)
  const firstSelected = selectedIds.size === 1 ? localTables.find(t => t.id === [...selectedIds][0]) : null;
  const anyMerged = [...selectedIds].some(id => localTables.find(t => t.id === id)?.mergeGroup);

  // SVG grid background
  const gridBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='rgba(255,255,255,0.04)' stroke-width='1'/%3E%3C/svg%3E")`;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 shrink-0 flex items-center px-4 border-b border-border bg-card shadow-sm z-20">
        <button onClick={() => setLocation('/configuracion')}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95">
          <ChevronLeft size={20} />
        </button>
        <span className="font-black ml-2 text-base">{zoneName}</span>
        <span className="text-muted-foreground text-sm ml-2 font-semibold">· Editor de plano</span>

        {/* Toolbar */}
        <div className="flex items-center gap-2 ml-6">
          <button onClick={handleAddTable} disabled={createTable.isPending}
            className="flex items-center gap-1.5 h-8 px-3 bg-primary text-primary-foreground rounded-lg text-xs font-bold uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all disabled:opacity-50">
            <Plus size={13} /> Mesa
          </button>
          <button onClick={handleMerge} disabled={selectedIds.size < 2}
            className="flex items-center gap-1.5 h-8 px-3 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-purple-500 hover:text-white active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none">
            <Link size={13} /> Unir
          </button>
          <button onClick={handleUnmerge} disabled={!anyMerged || !selectedIds.size}
            className="flex items-center gap-1.5 h-8 px-3 bg-secondary text-muted-foreground border border-border rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none">
            <Unlink size={13} /> Separar
          </button>
          <button onClick={handleDelete} disabled={!selectedIds.size}
            className="flex items-center gap-1.5 h-8 px-3 bg-destructive/10 text-destructive border border-destructive/30 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-destructive hover:text-destructive-foreground active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none">
            <Trash2 size={13} /> Eliminar
          </button>
          <div className="w-px h-6 bg-border mx-0.5" />
          <button onClick={handleDuplicate} disabled={selectedIds.size !== 1 || duplicateTable.isPending}
            className="flex items-center gap-1.5 h-8 px-3 bg-secondary text-muted-foreground border border-border rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-primary-foreground active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none">
            <Copy size={13} /> Duplicar
          </button>
          <div className="w-px h-6 bg-border mx-0.5" />
          <button onClick={() => setLocked(l => !l)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold uppercase tracking-wider active:scale-95 transition-all border ${locked ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30' : 'bg-secondary text-muted-foreground border-border hover:bg-secondary/80'}`}>
            {locked ? <><Lock size={13} /> Bloqueado</> : <><LockOpen size={13} /> Bloquear</>}
          </button>
        </div>

        <div className="flex-1" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1 mr-3">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= ZOOM_MIN}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-90 disabled:opacity-30"
            title="Reducir zoom">
            <ZoomOut size={15} />
          </button>
          <span className="text-xs font-mono font-bold text-muted-foreground w-10 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= ZOOM_MAX}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-90 disabled:opacity-30"
            title="Ampliar zoom">
            <ZoomIn size={15} />
          </button>
          <button
            onClick={handleFit}
            className="h-8 px-2.5 flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 text-xs font-bold uppercase tracking-wider ml-1"
            title="Ajustar al área disponible">
            <Maximize2 size={12} />
            <span className="hidden lg:inline">Encajar</span>
          </button>
        </div>

        <div className="text-xs text-muted-foreground font-semibold hidden xl:block">
          {localTables.length} mesa{localTables.length !== 1 ? 's' : ''} · Arrastra para mover · Shift+clic para múltiple
        </div>
      </header>

      {/* Main: canvas + sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div ref={canvasContainerRef} className="flex-1 overflow-auto bg-[#0d0d0d] relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            /* Outer wrapper occupies the scaled canvas size so scrollbars appear correctly */
            <div style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom, position: 'relative', flexShrink: 0 }}>
              <div
                ref={canvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: CANVAS_W,
                  height: CANVAS_H,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  backgroundImage: gridBg,
                  backgroundSize: '40px 40px',
                  cursor: dragState ? 'grabbing' : 'default',
                }}
                onPointerDown={handleCanvasBgClick}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
              >
                {/* Merge group SVG connections */}
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {(() => {
                    const groups: Record<string, LocalTable[]> = {};
                    for (const t of localTables) {
                      if (t.mergeGroup) (groups[t.mergeGroup] = groups[t.mergeGroup] ?? []).push(t);
                    }
                    return Object.values(groups).map((grp, gi) => {
                      if (grp.length < 2) return null;
                      const minX = Math.min(...grp.map(t => t.x)) - 6;
                      const minY = Math.min(...grp.map(t => t.y)) - 6;
                      const maxX = Math.max(...grp.map(t => t.x + t.width)) + 6;
                      const maxY = Math.max(...grp.map(t => t.y + t.height)) + 6;
                      return (
                        <rect key={gi} x={minX} y={minY} width={maxX - minX} height={maxY - minY}
                          rx="12" ry="12" fill="rgba(192,132,252,0.06)" stroke="rgba(192,132,252,0.35)"
                          strokeWidth="1.5" strokeDasharray="6 4" />
                      );
                    });
                  })()}
                </svg>

                {/* Tables */}
                {localTables.map(t => (
                  <TableShape key={t.id} t={t} selected={selectedIds.has(t.id)} locked={locked}
                    onPointerDown={(e) => handleTablePointerDown(e, t.id)} />
                ))}

                {/* Empty state */}
                {localTables.length === 0 && !isLoading && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', gap: 12 }}>
                    <div style={{ fontSize: 48 }}>🪑</div>
                    <p style={{ fontSize: 16, fontWeight: 700 }}>Sin mesas · Pulsa "+ Mesa" para añadir</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-72 shrink-0 bg-card border-l border-border flex flex-col overflow-y-auto">
          {firstSelected ? (
            <div className="p-4 flex flex-col gap-5">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Propiedades</h3>

              {/* Name */}
              <PropField label="Número / Nombre">
                <NameInput
                  value={firstSelected.name}
                  onSave={(v) => handleUpdateProp('name', v)}
                />
              </PropField>

              {/* Capacity */}
              <PropField label="Capacidad (personas)">
                <div className="flex items-center gap-2">
                  <button onClick={() => firstSelected && handleUpdateProp('capacity', Math.max(1, firstSelected.capacity - 1))}
                    className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center font-bold text-lg active:scale-90 hover:bg-primary hover:text-primary-foreground transition-colors">−</button>
                  <span className="flex-1 text-center text-xl font-black">{firstSelected.capacity}</span>
                  <button onClick={() => firstSelected && handleUpdateProp('capacity', Math.min(20, firstSelected.capacity + 1))}
                    className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center font-bold text-lg active:scale-90 hover:bg-primary hover:text-primary-foreground transition-colors">+</button>
                </div>
              </PropField>

              {/* Shape */}
              <PropField label="Forma">
                <div className="grid grid-cols-3 gap-2">
                  {(['square', 'round', 'rect'] as Shape[]).map(s => (
                    <button key={s} onClick={() => handleShapeChange(s)}
                      className={`h-10 rounded-lg border-2 flex items-center justify-center text-xs font-bold uppercase transition-all active:scale-95 ${firstSelected.shape === s ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground hover:border-primary/50'}`}>
                      {s === 'square' ? '⬛' : s === 'round' ? '⬤' : '▬'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-0.5">
                  <span className="text-[10px] text-center text-muted-foreground font-semibold">Cuadrada</span>
                  <span className="text-[10px] text-center text-muted-foreground font-semibold">Redonda</span>
                  <span className="text-[10px] text-center text-muted-foreground font-semibold">Rectangular</span>
                </div>
              </PropField>

              {/* Size */}
              <PropField label="Tamaño">
                <div className="grid grid-cols-3 gap-2">
                  {(['S', 'M', 'L'] as ('S' | 'M' | 'L')[]).map(sz => {
                    const [sw, sh] = SIZES[sz][firstSelected.shape as Shape] ?? SIZES[sz].square;
                    const active = firstSelected.width === sw && firstSelected.height === sh;
                    return (
                      <button key={sz} onClick={() => handleSizeChange(sz)}
                        className={`h-10 rounded-lg border-2 flex items-center justify-center text-sm font-black transition-all active:scale-95 ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground hover:border-primary/50'}`}>
                        {sz}
                      </button>
                    );
                  })}
                </div>
              </PropField>

              {/* Rotation */}
              <PropField label="Rotación">
                <div className="flex items-center gap-2">
                  <button onClick={() => handleUpdateProp('rotation', ((firstSelected.rotation ?? 0) - 15 + 360) % 360)}
                    className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center font-bold text-xs active:scale-90 hover:bg-primary hover:text-primary-foreground transition-colors shrink-0">−15°</button>
                  <input
                    type="number" min={0} max={359} step={1}
                    value={firstSelected.rotation ?? 0}
                    onChange={e => {
                      const v = Math.round(parseInt(e.target.value) || 0) % 360;
                      handleUpdateProp('rotation', v < 0 ? v + 360 : v);
                    }}
                    className="flex-1 text-center bg-background border border-border rounded-lg py-2 font-bold text-sm focus:outline-none focus:border-primary min-w-0"
                  />
                  <button onClick={() => handleUpdateProp('rotation', ((firstSelected.rotation ?? 0) + 15) % 360)}
                    className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center font-bold text-xs active:scale-90 hover:bg-primary hover:text-primary-foreground transition-colors shrink-0">+15°</button>
                </div>
                {(firstSelected.rotation ?? 0) !== 0 && (
                  <button onClick={() => handleUpdateProp('rotation', 0)}
                    className="w-full text-xs text-center text-muted-foreground hover:text-foreground py-1 transition-colors">
                    Restablecer a 0°
                  </button>
                )}
              </PropField>

              {/* Out-of-service toggle */}
              <PropField label="Estado">
                <button
                  onClick={() => handleUpdateProp('status', firstSelected.status === 'out_of_service' ? 'free' : 'out_of_service')}
                  className={`w-full h-10 rounded-xl border-2 flex items-center justify-center text-sm font-bold transition-all active:scale-95 gap-2 ${
                    firstSelected.status === 'out_of_service'
                      ? 'border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20'
                      : 'border-orange-500/40 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                  }`}
                >
                  {firstSelected.status === 'out_of_service' ? '✓ Fuera de servicio · Reactivar' : '⊘ Poner fuera de servicio'}
                </button>
              </PropField>

              {/* Merge status */}
              {firstSelected.mergeGroup && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3 text-xs text-purple-400 font-semibold flex items-center gap-2">
                  <span>⬡</span> Mesa unida (grupo activo)
                </div>
              )}

              {/* Position display */}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest mb-2">Posición</p>
                <p className="text-xs text-muted-foreground font-mono">x: {firstSelected.x}px · y: {firstSelected.y}px</p>
                <p className="text-xs text-muted-foreground font-mono">w: {firstSelected.width}px · h: {firstSelected.height}px</p>
              </div>
            </div>
          ) : selectedIds.size > 1 ? (
            <div className="p-4 flex flex-col gap-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Selección múltiple</h3>
              <p className="text-sm text-muted-foreground">{selectedIds.size} mesas seleccionadas</p>

              <PropField label="Forma (todas)">
                <div className="grid grid-cols-3 gap-2">
                  {(['square', 'round', 'rect'] as Shape[]).map(s => (
                    <button key={s} onClick={() => handleShapeChange(s)}
                      className="h-10 rounded-lg border-2 border-border bg-secondary flex items-center justify-center text-xs font-bold uppercase transition-all active:scale-95 hover:border-primary/50 text-muted-foreground">
                      {s === 'square' ? '⬛' : s === 'round' ? '⬤' : '▬'}
                    </button>
                  ))}
                </div>
              </PropField>

              <PropField label="Tamaño (todas)">
                <div className="grid grid-cols-3 gap-2">
                  {(['S', 'M', 'L'] as ('S' | 'M' | 'L')[]).map(sz => (
                    <button key={sz} onClick={() => handleSizeChange(sz)}
                      className="h-10 rounded-lg border-2 border-border bg-secondary flex items-center justify-center text-sm font-black transition-all active:scale-95 hover:border-primary/50 text-muted-foreground">
                      {sz}
                    </button>
                  ))}
                </div>
              </PropField>
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-3 text-center text-muted-foreground">
              <p className="text-4xl mt-8">🗺</p>
              <p className="text-sm font-semibold">Haz clic en una mesa<br/>para ver sus propiedades</p>
              <p className="text-xs mt-4 opacity-60 leading-relaxed">Arrastra para mover<br/>Shift + clic para selección múltiple<br/>Selecciona 2+ mesas para unir</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PropField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );
}

function NameInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => { if (!editing) setLocal(value); }, [value, editing]);

  return editing ? (
    <div className="flex items-center gap-2">
      <input autoFocus value={local} onChange={e => setLocal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onSave(local); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
        className="flex-1 bg-background border border-primary rounded-lg px-3 py-2 font-bold focus:outline-none text-sm" />
      <button onClick={() => { onSave(local); setEditing(false); }}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground active:scale-95">
        <Check size={12} />
      </button>
    </div>
  ) : (
    <button onClick={() => setEditing(true)}
      className="w-full text-left px-3 py-2.5 bg-background border border-border rounded-lg font-black text-lg hover:border-primary transition-colors">
      {value}
    </button>
  );
}
