import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Plus, Trash2, Link, Unlink, Loader2, Check, ZoomIn, ZoomOut,
  Maximize2, Lock, LockOpen, Copy, Eye, RefreshCw, RotateCcw,
  Minus, Square, Circle, RectangleHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetZoneTables,
  useGetZones,
  useCreateTable,
  useUpdateTable,
  useDeleteTable,
  useDuplicateTable,
  useUpdateZone,
  getGetZoneTablesQueryKey,
  getGetZonesQueryKey,
  type Table,
} from '@workspace/api-client-react';

// ── Canvas constants ──────────────────────────────────────────────────────────
const CANVAS_W = 1600;
const CANVAS_H = 900;
const GRID = 20;
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.0;
const ZOOM_STORAGE_KEY = 'piccolo_editor_zoom';

// ── Layouts ───────────────────────────────────────────────────────────────────
const LAYOUTS: Array<{ key: string; label: string }> = [
  { key: 'normal',   label: 'Normal'   },
  { key: 'verano',   label: 'Verano'   },
  { key: 'invierno', label: 'Invierno' },
  { key: 'eventos',  label: 'Eventos'  },
];

// ── Element types ─────────────────────────────────────────────────────────────
type ElementType = 'wall' | 'door' | 'bar' | 'column';
const ELEMENT_DEFS: Array<{ type: ElementType; label: string; icon: string }> = [
  { type: 'wall',   label: 'Pared',   icon: '▬' },
  { type: 'door',   label: 'Puerta',  icon: '🚪' },
  { type: 'bar',    label: 'Barra',   icon: '🍺' },
  { type: 'column', label: 'Columna', icon: '⬤' },
];

const ELEMENT_DEFAULTS: Record<ElementType, { w: number; h: number; color: string }> = {
  wall:   { w: 160, h: 20,  color: '#64748b' },
  door:   { w: 80,  h: 20,  color: '#854d0e' },
  bar:    { w: 200, h: 60,  color: '#78350f' },
  column: { w: 40,  h: 40,  color: '#475569' },
};

// ── Local types ───────────────────────────────────────────────────────────────
type Shape = 'square' | 'round' | 'rect';
type LocalTable = Table & { _saving?: boolean };

interface CanvasElement {
  id: string;
  zoneId: string;
  layout: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string | null;
  label: string | null;
  active: boolean;
}

type SelectionMode = 'tables' | 'elements';

type DragState = {
  pointerId: number;
  kind: 'tables' | 'element';
  originPointer: { x: number; y: number };
  originPositions: Record<string, { x: number; y: number }>;
};

const SIZES: Record<'S' | 'M' | 'L', Record<Shape, [number, number]>> = {
  S: { square: [60, 60],  round: [60, 60],  rect: [90,  60]  },
  M: { square: [80, 80],  round: [80, 80],  rect: [120, 80]  },
  L: { square: [100, 100], round: [100, 100], rect: [160, 100] },
};

function snap(v: number, min = 0, max = 9999) {
  return Math.max(min, Math.min(max, Math.round(v / GRID) * GRID));
}

// ── TableShape component ──────────────────────────────────────────────────────
function TableShape({ t, selected, locked, onPointerDown }: {
  t: LocalTable; selected: boolean; locked?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const isMerged       = !!t.mergeGroup;
  const isOutOfService = t.status === 'out_of_service';
  const rotation       = t.rotation ?? 0;

  const borderColor = isOutOfService ? '#44444e'
    : selected ? '#f59e0b'
    : isMerged ? '#c084fc'
    : t.status === 'occupied' ? '#c05c4a' : '#3f573c';

  const bgColor   = isOutOfService ? '#1a1a1e' : t.status === 'occupied' ? '#45201a' : '#253324';
  const textColor = isOutOfService ? '#666670' : t.status === 'occupied' ? '#f5dcd8' : '#dcecdb';
  const radius    = t.shape === 'round' ? '50%' : '10px';

  return (
    <div
      style={{
        position: 'absolute',
        left: t.x, top: t.y, width: t.width, height: t.height,
        borderRadius: radius, backgroundColor: bgColor,
        border: `2.5px solid ${borderColor}`,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: 'center center',
        opacity: isOutOfService ? 0.6 : 1,
        boxShadow: selected
          ? `0 0 0 3px rgba(245,158,11,0.35), 0 4px 16px rgba(0,0,0,0.5)`
          : isMerged
          ? `0 0 0 2px rgba(192,132,252,0.2), 0 2px 8px rgba(0,0,0,0.4)`
          : `0 2px 8px rgba(0,0,0,0.4)`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2,
        cursor: locked ? 'default' : 'grab',
        userSelect: 'none', touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
    >
      <span style={{ color: textColor, fontWeight: 900, fontSize: Math.max(11, t.width / 6), lineHeight: 1, pointerEvents: 'none' }}>
        {t.name}
      </span>
      <span style={{ color: textColor, opacity: 0.65, fontSize: 10, pointerEvents: 'none' }}>{t.capacity}p</span>
      {isMerged && <span style={{ position: 'absolute', top: 3, right: 4, fontSize: 8, color: '#c084fc', fontWeight: 700 }}>⬡</span>}
      {isOutOfService && <span style={{ position: 'absolute', top: 3, left: 4, fontSize: 9, color: '#666670', fontWeight: 700 }}>⊘</span>}
      {rotation !== 0 && <span style={{ position: 'absolute', bottom: 3, right: 4, fontSize: 8, color: textColor, opacity: 0.5 }}>{rotation}°</span>}
    </div>
  );
}

// ── CanvasElementShape component ──────────────────────────────────────────────
function CanvasElementShape({ el, selected, locked, onPointerDown }: {
  el: CanvasElement; selected: boolean; locked?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const color  = el.color ?? ELEMENT_DEFAULTS[el.type]?.color ?? '#64748b';
  const isCol  = el.type === 'column';
  const isDoor = el.type === 'door';
  const isBar  = el.type === 'bar';

  return (
    <div
      style={{
        position: 'absolute',
        left: el.x, top: el.y, width: el.width, height: el.height,
        backgroundColor: color,
        borderRadius: isCol ? '50%' : isDoor ? '4px 4px 0 0' : isBar ? '8px' : '3px',
        border: selected ? `2px solid #f59e0b` : `1px solid ${color}dd`,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        boxShadow: selected ? `0 0 0 3px rgba(245,158,11,0.35)` : `0 1px 4px rgba(0,0,0,0.5)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: locked ? 'default' : 'grab',
        userSelect: 'none', touchAction: 'none',
        opacity: 0.85,
      }}
      onPointerDown={onPointerDown}
    >
      {(isBar || (el.label)) && (
        <span style={{
          color: '#fff', fontSize: Math.max(9, Math.min(el.height / 2, 14)),
          fontWeight: 800, letterSpacing: 1, opacity: 0.9, pointerEvents: 'none',
          textTransform: 'uppercase',
        }}>
          {el.label ?? el.type}
        </span>
      )}
      {isDoor && (
        <svg width={el.width * 0.7} height={el.height * 1.5} viewBox="0 0 40 40"
          style={{ position: 'absolute', bottom: el.height * 0.9, pointerEvents: 'none', opacity: 0.6 }}>
          <path d="M0,40 A40,40 0 0,1 40,40" fill="none" stroke="#fff" strokeWidth="2" />
        </svg>
      )}
    </div>
  );
}

// ── Main Editor ───────────────────────────────────────────────────────────────
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

  // ── Zoom ─────────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const saved = sessionStorage.getItem(ZOOM_STORAGE_KEY);
      const parsed = saved ? parseFloat(saved) : NaN;
      return !isNaN(parsed) && parsed >= ZOOM_MIN && parsed <= ZOOM_MAX ? parsed : 1;
    } catch { return 1; }
  });
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const persistZoom = useCallback((z: number) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, parseFloat(z.toFixed(2))));
    setZoom(clamped);
    try { sessionStorage.setItem(ZOOM_STORAGE_KEY, String(clamped)); } catch { /* */ }
    return clamped;
  }, []);

  const handleZoomIn  = () => persistZoom(zoom + ZOOM_STEP);
  const handleZoomOut = () => persistZoom(zoom - ZOOM_STEP);
  const handleFit = useCallback(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const { width: cw, height: ch } = el.getBoundingClientRect();
    persistZoom(Math.min(cw / CANVAS_W, ch / CANVAS_H) * 0.98);
  }, [persistZoom]);

  // Pinch-to-zoom — non-passive so we can preventDefault and block scroll
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    /** Canvas-space coordinates of the pinch midpoint at gesture start */
    canvasPoint: { x: number; y: number };
    /** Pinch midpoint position relative to the container's top-left edge */
    midScreen: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const elOrNull = canvasContainerRef.current;
    if (!elOrNull) return;
    const el: HTMLDivElement = elOrNull;
    function dist(t: TouchList) {
      const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        const rect = el.getBoundingClientRect();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        // Position of midpoint relative to the scrollable container's origin
        const relX = midX - rect.left;
        const relY = midY - rect.top;
        const z = zoomRef.current;
        // Canvas coordinates under the midpoint (inverse of scale+scroll transform)
        const cx = (el.scrollLeft + relX) / z;
        const cy = (el.scrollTop + relY) / z;
        pinchRef.current = {
          startDist: dist(e.touches),
          startZoom: z,
          canvasPoint: { x: cx, y: cy },
          midScreen: { x: relX, y: relY },
        };
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault(); // prevent browser pan/zoom during pinch
        const scale = dist(e.touches) / pinchRef.current.startDist;
        const rawZoom = pinchRef.current.startZoom * scale;
        // Clamp (mirror persistZoom logic so scroll uses the final value)
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, parseFloat(rawZoom.toFixed(2))));
        // Reposition scroll so the pinch midpoint stays fixed on screen
        const { canvasPoint, midScreen } = pinchRef.current;
        el.scrollLeft = canvasPoint.x * newZoom - midScreen.x;
        el.scrollTop  = canvasPoint.y * newZoom - midScreen.y;
        persistZoom(newZoom);
      }
    }
    function onTouchEnd() { pinchRef.current = null; }
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

  // ── Layout ────────────────────────────────────────────────────────────────
  const [activeLayout, setActiveLayout] = useState<string>('normal');

  // ── Zone / table data ─────────────────────────────────────────────────────
  const { data: zones } = useGetZones({ all: true } as any, { query: { queryKey: [...getGetZonesQueryKey(), 'all'] } });
  const zone    = zones?.find(z => z.id === zoneId);
  const zoneName = zone?.name ?? '…';
  const zoneActiveLayout = (zone as any)?.activeLayout ?? 'normal';

  const tablesQueryKey = [...getGetZoneTablesQueryKey(zoneId!), activeLayout];
  const { data: serverTables, isLoading } = useGetZoneTables(
    zoneId!,
    { layout: activeLayout } as any,
    { query: { enabled: !!zoneId, queryKey: tablesQueryKey } }
  );

  const [localTables, setLocalTables] = useState<LocalTable[]>([]);
  useEffect(() => {
    if (serverTables) setLocalTables(serverTables.map(t => ({ ...t })));
  }, [serverTables]);

  // ── Canvas elements (fetched fresh on layout change) ─────────────────────
  const [localElements, setLocalElements] = useState<CanvasElement[]>([]);
  const [elementsLoading, setElementsLoading] = useState(false);

  const fetchElements = useCallback(async () => {
    if (!zoneId) return;
    setElementsLoading(true);
    try {
      const token = localStorage.getItem('token') ?? '';
      const base = (import.meta as any).env?.BASE_URL?.replace(/\/$/, '') ?? '';
      const res = await fetch(`${base}/api/zones/${zoneId}/elements?layout=${activeLayout}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLocalElements(data);
      }
    } catch { /* ignore */ }
    finally { setElementsLoading(false); }
  }, [zoneId, activeLayout]);

  useEffect(() => { fetchElements(); }, [fetchElements]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Clear selection when layout changes
  useEffect(() => { setSelectedIds(new Set()); setSelectedElementId(null); }, [activeLayout]);

  // ── Drag state ────────────────────────────────────────────────────────────
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [locked, setLocked] = useState(false);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createTable    = useCreateTable();
  const updateTable    = useUpdateTable();
  const deleteTable    = useDeleteTable();
  const duplicateTable = useDuplicateTable();
  const updateZone     = useUpdateZone();

  const invalidateTables = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: tablesQueryKey });
  }, [queryClient, tablesQueryKey]);

  // ── Element API helpers ───────────────────────────────────────────────────
  const apiCall = useCallback(async (method: string, url: string, body?: unknown) => {
    const token = localStorage.getItem('token') ?? '';
    const base = (import.meta as any).env?.BASE_URL?.replace(/\/$/, '') ?? '';
    const res = await fetch(`${base}/api${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Error ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }, []);

  // ── Table drag ────────────────────────────────────────────────────────────
  const handleTablePointerDown = useCallback((e: React.PointerEvent, tableId: string) => {
    if (locked) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedElementId(null);
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
    setDragState({ pointerId: e.pointerId, kind: 'tables', originPointer: { x: e.clientX, y: e.clientY }, originPositions });
    canvasRef.current?.setPointerCapture(e.pointerId);
  }, [locked, selectedIds, localTables]);

  // ── Element drag ──────────────────────────────────────────────────────────
  const handleElementPointerDown = useCallback((e: React.PointerEvent, elId: string) => {
    if (locked) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedIds(new Set());
    setSelectedElementId(elId);
    const el = localElements.find(el => el.id === elId);
    if (!el) return;
    setDragState({
      pointerId: e.pointerId, kind: 'element',
      originPointer: { x: e.clientX, y: e.clientY },
      originPositions: { [elId]: { x: el.x, y: el.y } },
    });
    canvasRef.current?.setPointerCapture(e.pointerId);
  }, [locked, localElements]);

  // ── Canvas pointer move ───────────────────────────────────────────────────
  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;
    const z = zoomRef.current;
    const dx = (e.clientX - dragState.originPointer.x) / z;
    const dy = (e.clientY - dragState.originPointer.y) / z;

    if (dragState.kind === 'tables') {
      setLocalTables(prev => prev.map(t => {
        if (!dragState.originPositions[t.id]) return t;
        const ox = dragState.originPositions[t.id].x;
        const oy = dragState.originPositions[t.id].y;
        return { ...t, x: snap(ox + dx, 0, CANVAS_W - t.width), y: snap(oy + dy, 0, CANVAS_H - t.height) };
      }));
    } else {
      setLocalElements(prev => prev.map(el => {
        if (!dragState.originPositions[el.id]) return el;
        const ox = dragState.originPositions[el.id].x;
        const oy = dragState.originPositions[el.id].y;
        return { ...el, x: snap(ox + dx, 0, CANVAS_W - el.width), y: snap(oy + dy, 0, CANVAS_H - el.height) };
      }));
    }
  }, [dragState]);

  // ── Canvas pointer up ─────────────────────────────────────────────────────
  const handleCanvasPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;
    setDragState(null);

    if (dragState.kind === 'tables') {
      for (const id of Object.keys(dragState.originPositions)) {
        const t = localTables.find(t => t.id === id);
        if (!t) continue;
        const orig = dragState.originPositions[id];
        if (t.x !== orig.x || t.y !== orig.y) {
          updateTable.mutate({ tableId: id, data: { x: t.x, y: t.y } }, {
            onSuccess: invalidateTables,
            onError: () => toast.error('Error al guardar posición'),
          });
        }
      }
    } else {
      const id = Object.keys(dragState.originPositions)[0];
      const el = localElements.find(el => el.id === id);
      if (el) {
        const orig = dragState.originPositions[id];
        if (el.x !== orig.x || el.y !== orig.y) {
          apiCall('PATCH', `/elements/${id}`, { x: el.x, y: el.y })
            .catch(() => toast.error('Error al guardar posición'));
        }
      }
    }
  }, [dragState, localTables, localElements, updateTable, invalidateTables, apiCall]);

  const handleCanvasBgClick = (e: React.PointerEvent) => {
    if (e.target === canvasRef.current) { setSelectedIds(new Set()); setSelectedElementId(null); }
  };

  // ── Table actions ─────────────────────────────────────────────────────────
  const handleAddTable = (shape: Shape = 'square') => {
    const nextNum = (localTables.reduce((m, t) => Math.max(m, parseInt(t.name.replace(/\D/g, '')) || 0), 0)) + 1;
    const x = snap(Math.min(CANVAS_W / 2 - 40, 400) + Math.random() * 60, 0, CANVAS_W - 80);
    const y = snap(Math.min(CANVAS_H / 2 - 40, 200) + Math.random() * 60, 0, CANVAS_H - 80);
    const w = shape === 'rect' ? 120 : 80;
    createTable.mutate(
      { zoneId: zoneId!, data: { name: String(nextNum), capacity: 4, x, y, width: w, height: 80, shape, layout: activeLayout } as any },
      {
        onSuccess: (newTable: any) => { invalidateTables(); setSelectedIds(new Set([newTable.id])); toast.success(`Mesa ${newTable.name} creada`); },
        onError: () => toast.error('Error al crear mesa'),
      }
    );
  };

  const handleAddElement = async (type: ElementType) => {
    const def = ELEMENT_DEFAULTS[type];
    const x = snap(CANVAS_W / 2 - def.w / 2 + Math.random() * 40, 0, CANVAS_W - def.w);
    const y = snap(CANVAS_H / 2 - def.h / 2 + Math.random() * 40, 0, CANVAS_H - def.h);
    try {
      const el = await apiCall('POST', `/zones/${zoneId}/elements`, {
        type, layout: activeLayout, x, y, width: def.w, height: def.h, color: def.color,
        label: type === 'bar' ? 'Barra' : null,
      });
      if (el) { setLocalElements(prev => [...prev, el]); setSelectedElementId(el.id); setSelectedIds(new Set()); }
    } catch (err: any) { toast.error(err.message ?? 'Error al crear elemento'); }
  };

  const handleMerge = () => {
    if (selectedIds.size < 2) { toast.error('Selecciona al menos 2 mesas'); return; }
    const groupId = crypto.randomUUID();
    for (const id of selectedIds) {
      updateTable.mutate({ tableId: id, data: { mergeGroup: groupId } }, {
        onSuccess: invalidateTables, onError: () => toast.error('Error al unir mesas'),
      });
    }
    toast.success('Mesas unidas');
  };

  const handleUnmerge = () => {
    for (const id of selectedIds) {
      updateTable.mutate({ tableId: id, data: { mergeGroup: null } }, {
        onSuccess: invalidateTables, onError: () => toast.error('Error al separar mesas'),
      });
    }
    toast.success('Mesas separadas');
  };

  const handleDelete = () => {
    if (selectedElementId) {
      apiCall('DELETE', `/elements/${selectedElementId}`)
        .then(() => { setLocalElements(prev => prev.filter(el => el.id !== selectedElementId)); setSelectedElementId(null); toast.success('Elemento eliminado'); })
        .catch((err: any) => toast.error(err.message ?? 'Error al eliminar'));
      return;
    }
    if (!selectedIds.size) return;
    for (const id of selectedIds) {
      deleteTable.mutate({ tableId: id }, {
        onSuccess: () => { invalidateTables(); setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; }); },
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Error al eliminar mesa'),
      });
    }
  };

  const handleDuplicate = () => {
    if (selectedIds.size !== 1) return;
    const id = [...selectedIds][0];
    duplicateTable.mutate({ tableId: id }, {
      onSuccess: (newTable: any) => { invalidateTables(); setSelectedIds(new Set([newTable.id])); toast.success(`Mesa duplicada`); },
      onError: () => toast.error('Error al duplicar mesa'),
    });
  };

  const handleUpdateProp = (field: string, value: unknown) => {
    for (const id of selectedIds) {
      updateTable.mutate({ tableId: id, data: { [field]: value } as any }, {
        onSuccess: invalidateTables, onError: () => toast.error('Error al actualizar'),
      });
    }
    setLocalTables(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, [field]: value } as LocalTable : t));
  };

  const handleShapeChange = (shape: Shape) => {
    for (const id of selectedIds) {
      const t = localTables.find(t => t.id === id);
      if (!t) continue;
      const w = shape === 'rect' ? Math.max(t.width, Math.round(t.height * 1.5)) : t.height;
      updateTable.mutate({ tableId: id, data: { shape, width: w, height: t.height } as any }, {
        onSuccess: invalidateTables, onError: () => toast.error('Error al actualizar forma'),
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
      updateTable.mutate({ tableId: id, data: { width: w, height: h } as any }, {
        onSuccess: invalidateTables, onError: () => toast.error('Error al actualizar tamaño'),
      });
    }
    setLocalTables(prev => prev.map(t => {
      if (!selectedIds.has(t.id)) return t;
      const [w, h] = SIZES[sizeKey][t.shape as Shape] ?? SIZES[sizeKey].square;
      return { ...t, width: w, height: h };
    }));
  };

  const handleActivateLayout = () => {
    updateZone.mutate(
      { zoneId: zoneId!, data: { activeLayout } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [...getGetZonesQueryKey(), 'all'] });
          queryClient.invalidateQueries({ queryKey: getGetZonesQueryKey() });
          toast.success(`Distribución "${LAYOUTS.find(l => l.key === activeLayout)?.label}" activada`);
        },
        onError: () => toast.error('Error al activar distribución'),
      }
    );
  };

  const handleCancelChanges = () => {
    queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    fetchElements();
    setSelectedIds(new Set());
    setSelectedElementId(null);
    toast('Cambios cancelados — datos recargados del servidor');
  };

  const handleUpdateElement = async (id: string, patch: Partial<CanvasElement>) => {
    try {
      await apiCall('PATCH', `/elements/${id}`, patch);
      setLocalElements(prev => prev.map(el => el.id === id ? { ...el, ...patch } : el));
    } catch (err: any) { toast.error(err.message ?? 'Error al actualizar'); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const firstSelected   = selectedIds.size === 1 ? localTables.find(t => t.id === [...selectedIds][0]) : null;
  const anyMerged       = [...selectedIds].some(id => localTables.find(t => t.id === id)?.mergeGroup);
  const selectedElement = selectedElementId ? localElements.find(el => el.id === selectedElementId) : null;
  const isActiveLayout  = zoneActiveLayout === activeLayout;

  const gridBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='rgba(255,255,255,0.04)' stroke-width='1'/%3E%3C/svg%3E")`;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* ── Header ── */}
      <header className="h-14 shrink-0 flex items-center px-3 border-b border-border bg-card shadow-sm z-20 gap-2 overflow-x-auto">
        <button onClick={() => setLocation('/configuracion')}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground shrink-0">
          <ChevronLeft size={20} />
        </button>
        <span className="font-black text-base shrink-0">{zoneName}</span>
        <span className="text-muted-foreground text-sm font-semibold shrink-0 hidden sm:block">· Editor</span>

        <div className="w-px h-6 bg-border mx-1 shrink-0" />

        {/* Table add */}
        <button onClick={() => handleAddTable('square')} disabled={createTable.isPending}
          className="flex items-center gap-1 h-8 px-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold uppercase tracking-wide hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 shrink-0">
          <Square size={11} /> Mesa
        </button>
        <button onClick={() => handleAddTable('round')}
          className="flex items-center gap-1 h-8 px-2 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-bold hover:bg-primary hover:text-primary-foreground active:scale-95 transition-all shrink-0" title="Añadir mesa redonda">
          <Circle size={11} />
        </button>
        <button onClick={() => handleAddTable('rect')}
          className="flex items-center gap-1 h-8 px-2 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-bold hover:bg-primary hover:text-primary-foreground active:scale-95 transition-all shrink-0" title="Añadir mesa rectangular">
          <RectangleHorizontal size={11} />
        </button>

        <div className="w-px h-6 bg-border mx-1 shrink-0" />

        {/* Elements */}
        {ELEMENT_DEFS.map(def => (
          <button key={def.type} onClick={() => handleAddElement(def.type)}
            title={`Añadir ${def.label}`}
            className="h-8 px-2 rounded-lg border border-border bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground text-xs font-bold active:scale-95 transition-all shrink-0">
            {def.icon}
          </button>
        ))}

        <div className="w-px h-6 bg-border mx-1 shrink-0" />

        {/* Merge / Unmerge */}
        <button onClick={handleMerge} disabled={selectedIds.size < 2}
          className="flex items-center gap-1 h-8 px-2.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-bold hover:bg-purple-500 hover:text-white active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none shrink-0">
          <Link size={12} /> <span className="hidden md:inline">Unir</span>
        </button>
        <button onClick={handleUnmerge} disabled={!anyMerged || !selectedIds.size}
          className="flex items-center gap-1 h-8 px-2.5 bg-secondary text-muted-foreground border border-border rounded-lg text-xs font-bold hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none shrink-0">
          <Unlink size={12} />
        </button>

        {/* Duplicate */}
        <button onClick={handleDuplicate} disabled={selectedIds.size !== 1 || duplicateTable.isPending}
          className="flex items-center gap-1 h-8 px-2.5 bg-secondary text-muted-foreground border border-border rounded-lg text-xs font-bold hover:bg-primary hover:text-primary-foreground active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none shrink-0">
          <Copy size={12} /> <span className="hidden md:inline">Dupl.</span>
        </button>

        {/* Delete */}
        <button onClick={handleDelete} disabled={!selectedIds.size && !selectedElementId}
          className="flex items-center gap-1 h-8 px-2.5 bg-destructive/10 text-destructive border border-destructive/30 rounded-lg text-xs font-bold hover:bg-destructive hover:text-destructive-foreground active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none shrink-0">
          <Trash2 size={12} />
        </button>

        <div className="w-px h-6 bg-border mx-1 shrink-0" />

        {/* Lock */}
        <button onClick={() => setLocked(l => !l)}
          className={`flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-bold uppercase tracking-wide active:scale-95 transition-all border shrink-0 ${locked ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-secondary text-muted-foreground border-border hover:bg-secondary/80'}`}>
          {locked ? <><Lock size={12} /> <span className="hidden sm:inline">Bloq.</span></> : <><LockOpen size={12} /></>}
        </button>

        {/* Preview */}
        <button onClick={() => setLocation('/tables')}
          className="flex items-center gap-1 h-8 px-2.5 bg-secondary text-muted-foreground border border-border rounded-lg text-xs font-bold hover:bg-secondary/80 active:scale-95 transition-all shrink-0">
          <Eye size={12} /> <span className="hidden sm:inline">Vista previa</span>
        </button>

        {/* Cancel */}
        <button onClick={handleCancelChanges}
          className="flex items-center gap-1 h-8 px-2.5 bg-secondary text-muted-foreground border border-border rounded-lg text-xs font-bold hover:bg-secondary/80 active:scale-95 transition-all shrink-0">
          <RefreshCw size={12} /> <span className="hidden sm:inline">Recargar</span>
        </button>

        <div className="flex-1" />

        {/* Zoom */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={handleZoomOut} disabled={zoom <= ZOOM_MIN}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors active:scale-90 disabled:opacity-30">
            <ZoomOut size={14} />
          </button>
          <span className="text-xs font-mono font-bold text-muted-foreground w-9 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} disabled={zoom >= ZOOM_MAX}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors active:scale-90 disabled:opacity-30">
            <ZoomIn size={14} />
          </button>
          <button onClick={handleFit}
            className="h-7 px-2 flex items-center gap-1 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground text-xs font-bold transition-colors active:scale-95 ml-0.5">
            <Maximize2 size={11} />
          </button>
        </div>
      </header>

      {/* ── Layout Tabs ── */}
      <div className="shrink-0 bg-card border-b border-border flex items-center px-3 gap-1 overflow-x-auto">
        {LAYOUTS.map(l => {
          const isThis   = activeLayout === l.key;
          const isActive = zoneActiveLayout === l.key;
          return (
            <button
              key={l.key}
              onClick={() => setActiveLayout(l.key)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-all rounded-t-xl
                ${isThis
                  ? 'bg-background text-foreground border-t-2 border-primary shadow-[0_-2px_8px_rgba(0,0,0,0.05)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}
            >
              {l.label}
              {isActive && (
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Distribución activa" />
              )}
            </button>
          );
        })}

        <div className="flex-1" />

        {/* Activate layout */}
        <button
          onClick={handleActivateLayout}
          disabled={isActiveLayout || updateZone.isPending}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all active:scale-95 mr-1 my-1
            ${isActiveLayout
              ? 'bg-green-500/10 text-green-400 border border-green-500/30 cursor-default'
              : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-primary-foreground disabled:opacity-50'}`}
        >
          {isActiveLayout ? <><Check size={12} /> Activa</> : <><Eye size={12} /> Activar distribución</>}
        </button>
      </div>

      {/* ── Main: canvas + sidebar ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div ref={canvasContainerRef} className="flex-1 overflow-auto bg-[#0d0d0d] relative">
          {(isLoading || elementsLoading) ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom, position: 'relative', flexShrink: 0 }}>
              <div
                ref={canvasRef}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: CANVAS_W, height: CANVAS_H,
                  transform: `scale(${zoom})`, transformOrigin: 'top left',
                  backgroundImage: gridBg, backgroundSize: '40px 40px',
                  cursor: dragState ? 'grabbing' : 'default',
                }}
                onPointerDown={handleCanvasBgClick}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
              >
                {/* Merge group bounding boxes */}
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
                          rx="12" ry="12" fill="rgba(192,132,252,0.06)"
                          stroke="rgba(192,132,252,0.35)" strokeWidth="1.5" strokeDasharray="6 4" />
                      );
                    });
                  })()}
                </svg>

                {/* Decorative elements */}
                {localElements.map(el => (
                  <CanvasElementShape key={el.id} el={el} selected={selectedElementId === el.id} locked={locked}
                    onPointerDown={e => handleElementPointerDown(e, el.id)} />
                ))}

                {/* Tables */}
                {localTables.map(t => (
                  <TableShape key={t.id} t={t} selected={selectedIds.has(t.id)} locked={locked}
                    onPointerDown={e => handleTablePointerDown(e, t.id)} />
                ))}

                {/* Empty state */}
                {localTables.length === 0 && localElements.length === 0 && !isLoading && !elementsLoading && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', gap: 12 }}>
                    <div style={{ fontSize: 48 }}>🪑</div>
                    <p style={{ fontSize: 16, fontWeight: 700 }}>Sin mesas · Pulsa "+ Mesa" para añadir</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="w-64 shrink-0 bg-card border-l border-border flex flex-col overflow-y-auto">
          {/* Table properties */}
          {firstSelected ? (
            <div className="p-4 flex flex-col gap-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Mesa seleccionada</h3>

              <PropField label="Número / Nombre">
                <NameInput value={firstSelected.name} onSave={v => handleUpdateProp('name', v)} />
              </PropField>

              <PropField label="Capacidad">
                <div className="flex items-center gap-2">
                  <button onClick={() => handleUpdateProp('capacity', Math.max(1, firstSelected.capacity - 1))}
                    className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center font-bold text-lg active:scale-90 hover:bg-primary hover:text-primary-foreground transition-colors">−</button>
                  <span className="flex-1 text-center text-xl font-black">{firstSelected.capacity}</span>
                  <button onClick={() => handleUpdateProp('capacity', Math.min(20, firstSelected.capacity + 1))}
                    className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center font-bold text-lg active:scale-90 hover:bg-primary hover:text-primary-foreground transition-colors">+</button>
                </div>
              </PropField>

              <PropField label="Forma">
                <div className="grid grid-cols-3 gap-1.5">
                  {(['square', 'round', 'rect'] as Shape[]).map(s => (
                    <button key={s} onClick={() => handleShapeChange(s)}
                      className={`h-9 rounded-lg border-2 flex items-center justify-center text-xs font-bold transition-all active:scale-95 ${firstSelected.shape === s ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground hover:border-primary/50'}`}>
                      {s === 'square' ? '⬛' : s === 'round' ? '⬤' : '▬'}
                    </button>
                  ))}
                </div>
              </PropField>

              <PropField label="Tamaño">
                <div className="grid grid-cols-3 gap-1.5">
                  {(['S', 'M', 'L'] as const).map(sz => {
                    const [sw, sh] = SIZES[sz][firstSelected.shape as Shape] ?? SIZES[sz].square;
                    const active = firstSelected.width === sw && firstSelected.height === sh;
                    return (
                      <button key={sz} onClick={() => handleSizeChange(sz)}
                        className={`h-9 rounded-lg border-2 flex items-center justify-center text-sm font-black transition-all active:scale-95 ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground hover:border-primary/50'}`}>
                        {sz}
                      </button>
                    );
                  })}
                </div>
              </PropField>

              <PropField label="Rotación">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleUpdateProp('rotation', ((firstSelected.rotation ?? 0) - 15 + 360) % 360)}
                    className="w-9 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold active:scale-90 hover:bg-primary hover:text-primary-foreground transition-colors shrink-0">−15°</button>
                  <input type="number" min={0} max={359} step={1}
                    value={firstSelected.rotation ?? 0}
                    onChange={e => {
                      const v = Math.round(parseInt(e.target.value) || 0) % 360;
                      handleUpdateProp('rotation', v < 0 ? v + 360 : v);
                    }}
                    className="flex-1 text-center bg-background border border-border rounded-lg py-1.5 font-bold text-sm focus:outline-none focus:border-primary min-w-0" />
                  <button onClick={() => handleUpdateProp('rotation', ((firstSelected.rotation ?? 0) + 15) % 360)}
                    className="w-9 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold active:scale-90 hover:bg-primary hover:text-primary-foreground transition-colors shrink-0">+15°</button>
                </div>
                {(firstSelected.rotation ?? 0) !== 0 && (
                  <button onClick={() => handleUpdateProp('rotation', 0)} className="w-full text-xs text-center text-muted-foreground hover:text-foreground py-1">
                    <RotateCcw size={10} className="inline mr-1" />Restablecer a 0°
                  </button>
                )}
              </PropField>

              <PropField label="Estado">
                <button
                  onClick={() => handleUpdateProp('status', firstSelected.status === 'out_of_service' ? 'free' : 'out_of_service')}
                  className={`w-full h-9 rounded-xl border-2 flex items-center justify-center text-xs font-bold transition-all active:scale-95 gap-1.5 ${
                    firstSelected.status === 'out_of_service'
                      ? 'border-green-500/40 bg-green-500/10 text-green-400'
                      : 'border-orange-500/40 bg-orange-500/10 text-orange-400'
                  }`}
                >
                  {firstSelected.status === 'out_of_service' ? '✓ F. servicio · Reactivar' : '⊘ Fuera de servicio'}
                </button>
              </PropField>

              {firstSelected.mergeGroup && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-2.5 text-xs text-purple-400 font-semibold">⬡ Mesa unida</div>
              )}

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground font-mono">x:{firstSelected.x} y:{firstSelected.y}</p>
                <p className="text-xs text-muted-foreground font-mono">w:{firstSelected.width} h:{firstSelected.height}</p>
              </div>
            </div>

          ) : selectedElement ? (
            /* Element properties */
            <div className="p-4 flex flex-col gap-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                {ELEMENT_DEFS.find(d => d.type === selectedElement.type)?.icon}{' '}
                {ELEMENT_DEFS.find(d => d.type === selectedElement.type)?.label}
              </h3>

              <PropField label="Etiqueta">
                <NameInput
                  value={selectedElement.label ?? ''}
                  onSave={v => handleUpdateElement(selectedElement.id, { label: v || null })}
                />
              </PropField>

              <PropField label="Dimensiones">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-bold uppercase">Ancho</label>
                    <input type="number" min={10} max={CANVAS_W}
                      value={selectedElement.width}
                      onChange={e => {
                        const v = Math.max(10, parseInt(e.target.value) || 10);
                        setLocalElements(prev => prev.map(el => el.id === selectedElement.id ? { ...el, width: v } : el));
                      }}
                      onBlur={e => handleUpdateElement(selectedElement.id, { width: Math.max(10, parseInt(e.target.value) || 10) })}
                      className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-bold uppercase">Alto</label>
                    <input type="number" min={10} max={CANVAS_H}
                      value={selectedElement.height}
                      onChange={e => {
                        const v = Math.max(10, parseInt(e.target.value) || 10);
                        setLocalElements(prev => prev.map(el => el.id === selectedElement.id ? { ...el, height: v } : el));
                      }}
                      onBlur={e => handleUpdateElement(selectedElement.id, { height: Math.max(10, parseInt(e.target.value) || 10) })}
                      className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:border-primary" />
                  </div>
                </div>
              </PropField>

              <PropField label="Rotación">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleUpdateElement(selectedElement.id, { rotation: ((selectedElement.rotation ?? 0) - 15 + 360) % 360 })}
                    className="w-9 h-8 rounded-lg bg-secondary text-xs font-bold active:scale-90 hover:bg-primary hover:text-primary-foreground transition-colors shrink-0">−15°</button>
                  <span className="flex-1 text-center text-sm font-bold">{selectedElement.rotation ?? 0}°</span>
                  <button onClick={() => handleUpdateElement(selectedElement.id, { rotation: ((selectedElement.rotation ?? 0) + 15) % 360 })}
                    className="w-9 h-8 rounded-lg bg-secondary text-xs font-bold active:scale-90 hover:bg-primary hover:text-primary-foreground transition-colors shrink-0">+15°</button>
                </div>
              </PropField>

              <PropField label="Color">
                <input type="color"
                  value={selectedElement.color ?? ELEMENT_DEFAULTS[selectedElement.type]?.color ?? '#64748b'}
                  onChange={e => setLocalElements(prev => prev.map(el => el.id === selectedElement.id ? { ...el, color: e.target.value } : el))}
                  onBlur={e => handleUpdateElement(selectedElement.id, { color: e.target.value })}
                  className="w-full h-9 rounded-lg border border-border bg-background cursor-pointer" />
              </PropField>

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground font-mono">x:{selectedElement.x} y:{selectedElement.y}</p>
              </div>
            </div>

          ) : selectedIds.size > 1 ? (
            <div className="p-4 flex flex-col gap-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Selección múltiple</h3>
              <p className="text-sm text-muted-foreground">{selectedIds.size} mesas</p>
              <PropField label="Forma (todas)">
                <div className="grid grid-cols-3 gap-1.5">
                  {(['square', 'round', 'rect'] as Shape[]).map(s => (
                    <button key={s} onClick={() => handleShapeChange(s)}
                      className="h-9 rounded-lg border-2 border-border bg-secondary flex items-center justify-center text-xs font-bold hover:border-primary/50 text-muted-foreground">
                      {s === 'square' ? '⬛' : s === 'round' ? '⬤' : '▬'}
                    </button>
                  ))}
                </div>
              </PropField>
              <PropField label="Tamaño (todas)">
                <div className="grid grid-cols-3 gap-1.5">
                  {(['S', 'M', 'L'] as const).map(sz => (
                    <button key={sz} onClick={() => handleSizeChange(sz)}
                      className="h-9 rounded-lg border-2 border-border bg-secondary flex items-center justify-center text-sm font-black hover:border-primary/50 text-muted-foreground">
                      {sz}
                    </button>
                  ))}
                </div>
              </PropField>
            </div>

          ) : (
            <div className="p-4 flex flex-col gap-3 text-center text-muted-foreground">
              <p className="text-3xl mt-8">🗺</p>
              <p className="text-sm font-semibold">Toca una mesa o elemento para ver sus propiedades</p>
              <div className="mt-4 text-left bg-secondary/40 rounded-xl p-3 text-xs space-y-1.5">
                <p className="font-bold text-foreground mb-1">Distribución: <span className="text-primary">{LAYOUTS.find(l => l.key === activeLayout)?.label}</span></p>
                <p>· Arrastra mesas para moverlas</p>
                <p>· Shift+clic → selección múltiple</p>
                <p>· Selecciona 2+ para unir</p>
                <p>· Las pestañas cambian la distribución</p>
                <p>· <span className="text-green-400">● verde</span> = distribución activa</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PropField / NameInput helpers ─────────────────────────────────────────────
function PropField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );
}

function NameInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setLocal(value); }, [value, editing]);
  return editing ? (
    <div className="flex items-center gap-1.5">
      <input autoFocus value={local} onChange={e => setLocal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onSave(local); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
        className="flex-1 bg-background border border-primary rounded-lg px-2.5 py-1.5 font-bold focus:outline-none text-sm" />
      <button onClick={() => { onSave(local); setEditing(false); }}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground active:scale-95">
        <Check size={12} />
      </button>
    </div>
  ) : (
    <button onClick={() => setEditing(true)}
      className="w-full text-left px-2.5 py-2 bg-background border border-border rounded-lg font-black text-base hover:border-primary transition-colors">
      {value || <span className="text-muted-foreground italic text-sm">Sin nombre</span>}
    </button>
  );
}
