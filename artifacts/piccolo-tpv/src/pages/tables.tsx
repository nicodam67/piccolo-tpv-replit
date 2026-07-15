import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import {
  useGetDashboardSummary,
  useGetZones,
  useGetZoneTables,
  useGetCanvasElements,
  useOpenTable,
  useUpdateZone,
  getGetZoneTablesQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetAllTablesQueryKey,
  getGetCanvasElementsQueryKey,
  getGetZonesQueryKey,
  type Table,
  type CanvasElement,
} from "@workspace/api-client-react";
import { LogOut, Loader2, Monitor, Settings, ZoomIn, ZoomOut, Maximize2, Package } from "lucide-react";
import { toast } from "sonner";

// ─── Emoji palette (shared with configuracion) ────────────────────────────────
const ZONE_EMOJIS = [
  '🍕', '🍔', '🌮', '🥩', '🐟', '🦞',
  '🍷', '🍺', '☕', '🧉', '🥂', '🍹',
  '🌿', '🏖️', '🎉', '⭐', '🔥', '🌙',
  '🎭', '🎸', '🌺', '❄️', '🏔️', '🌅',
];

// ─── Mini emoji picker popover for zone tabs ──────────────────────────────────
interface ZoneEmojiPickerProps {
  currentIcon: string | null | undefined;
  onSelect: (icon: string | null) => void;
  onClose: () => void;
}

function ZoneEmojiPicker({ currentIcon, onSelect, onClose }: ZoneEmojiPickerProps) {
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
      className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-2xl shadow-2xl p-3"
      style={{ minWidth: 230 }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">Icono de la sala</p>
      <div className="grid grid-cols-6 gap-1 mb-2">
        {ZONE_EMOJIS.map(emoji => (
          <button
            key={emoji}
            onPointerDown={e => { e.stopPropagation(); }}
            onClick={() => { onSelect(emoji); onClose(); }}
            className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all active:scale-90 hover:bg-secondary ${currentIcon === emoji ? 'bg-primary/15 ring-2 ring-primary/40' : ''}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={() => { onSelect(null); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-secondary transition-colors"
      >
        <div className="w-5 h-5 rounded-md border-2 border-dashed border-muted-foreground/40" />
        Sin icono
      </button>
    </div>
  );
}

// Canvas constants — same as zone-editor so layouts match
const CANVAS_W = 1600;
const CANVAS_H = 900;

// Element colour defaults — must match zone-editor
const ELEMENT_COLOR: Record<string, string> = {
  wall: '#64748b', door: '#854d0e', window: '#7dd3fc', bar: '#78350f', column: '#475569',
};

/** Read-only element renderer for the camarero floor plan view */
function ElementShape({ el }: { el: CanvasElement }) {
  const color  = el.color ?? ELEMENT_COLOR[el.type] ?? '#64748b';
  const isCol  = el.type === 'column';
  const isDoor = el.type === 'door';
  const isBar  = el.type === 'bar';
  const isWin  = el.type === 'window';
  return (
    <div style={{
      position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height,
      backgroundColor: isWin ? 'transparent' : color,
      borderRadius: isCol ? '50%' : isDoor ? '4px 4px 0 0' : isBar ? '8px' : isWin ? '2px' : '3px',
      border: isWin ? `3px solid ${color}` : `1px solid ${color}dd`,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      transformOrigin: 'center center',
      boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: 0.78, pointerEvents: 'none', userSelect: 'none', overflow: 'visible',
    }}>
      {isWin && (
        <>
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, backgroundColor: color, transform: 'translateX(-50%)', opacity: 0.7 }} />
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, backgroundColor: color, transform: 'translateY(-50%)', opacity: 0.7 }} />
        </>
      )}
      {(isBar || el.label) && !isWin && (
        <span style={{ color: '#fff', fontSize: Math.max(9, Math.min(el.height / 2, 14)), fontWeight: 800, letterSpacing: 1, opacity: 0.9, textTransform: 'uppercase' }}>
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

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.0;
const ZOOM_STORAGE_PREFIX  = "piccolo_floor_zoom_";
const SCROLL_STORAGE_PREFIX = "piccolo_floor_scroll_";

// SVG grid background
const GRID_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='rgba(255,255,255,0.04)' stroke-width='1'/%3E%3C/svg%3E")`;

// Max pointer movement (in CSS px) between pointerdown and pointerup
// that still counts as a deliberate tap. Anything larger is treated as a
// scroll/drag and the click is suppressed.
const TAP_SLOP = 8;

// Extended status styles for all table states
const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; dot: string; glow: string }> = {
  free:           { bg: '#253324', border: '#3f573c', text: '#dcecdb', dot: '#61895f', glow: '#61895f' },
  occupied:       { bg: '#45201a', border: '#6b3127', text: '#f5dcd8', dot: '#c05c4a', glow: '#c05c4a' },
  waiting:        { bg: '#3a2c0f', border: '#7a5c1a', text: '#fde68a', dot: '#f59e0b', glow: '#f59e0b' },
  bill_requested: { bg: '#1a2040', border: '#3b4ea0', text: '#bfcfff', dot: '#4f6ef7', glow: '#4f6ef7' },
  out_of_service: { bg: '#1e1e22', border: '#44444e', text: '#888898', dot: '#55555f', glow: 'transparent' },
  reserved:       { bg: '#2a1a3a', border: '#6a3a8a', text: '#e4c8ff', dot: '#a855f7', glow: '#a855f7' },
};

function elapsed(openedAt: string | null | undefined): string {
  if (!openedAt) return '';
  const ms = Date.now() - new Date(openedAt).getTime();
  if (ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h${(mins % 60).toString().padStart(2, '0')}`;
}

function TableCard({ table, onClick, isBusy }: { table: Table; onClick: () => void; isBusy: boolean }) {
  const isMerged   = !!table.mergeGroup;
  const st         = STATUS_STYLES[table.status] ?? STATUS_STYLES.free;
  const rotation   = (table as any).rotation ?? 0;
  const radius     = table.shape === "round" ? "50%" : "10px";
  const elapsedStr = elapsed((table as any).openedAt);
  const hasAmount  = (table as any).currentTotal != null && (table as any).currentTotal > 0;
  const amountStr  = hasAmount ? `${Number((table as any).currentTotal).toFixed(2)}€` : '';

  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const handlePointerDown = (e: React.PointerEvent) => { pointerOrigin.current = { x: e.clientX, y: e.clientY }; };
  const handleClick = (e: React.MouseEvent) => {
    if (isBusy) return;
    if (pointerOrigin.current) {
      const dx = e.clientX - pointerOrigin.current.x;
      const dy = e.clientY - pointerOrigin.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > TAP_SLOP) { pointerOrigin.current = null; return; }
    }
    pointerOrigin.current = null;
    onClick();
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      style={{
        position: "absolute",
        left: table.x,
        top: table.y,
        width: table.width,
        height: table.height,
        borderRadius: radius,
        backgroundColor: st.bg,
        border: `2.5px solid ${isMerged ? (table.status === 'free' ? '#7c3aed' : '#6b3a8a') : st.border}`,
        boxShadow: `0 2px 10px rgba(0,0,0,0.45)`,
        cursor: isBusy ? "wait" : table.status === 'out_of_service' ? 'not-allowed' : 'pointer',
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: 'center center',
        opacity: table.status === 'out_of_service' ? 0.6 : 1,
        transition: "border-color 0.15s, box-shadow 0.15s",
        userSelect: "none",
      }}
      className="hover:brightness-110 active:scale-[0.97] transition-transform"
    >
      {isBusy ? (
        <Loader2 style={{ width: 20, height: 20, color: st.text, opacity: 0.6 }} className="animate-spin" />
      ) : (
        <>
          <span style={{ color: st.text, fontWeight: 900, fontSize: Math.max(10, Math.min(table.width, table.height) / 5), lineHeight: 1, pointerEvents: "none" }}>
            {table.name}
          </span>
          <span style={{ color: st.text, opacity: 0.6, fontSize: 10, pointerEvents: "none" }}>
            {table.capacity}p
          </span>
          {/* Employee initial — top-left */}
          {(table as any).employeeName && (
            <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 8, color: st.text, opacity: 0.55, fontWeight: 700, pointerEvents: 'none' }}>
              {(table as any).employeeName.charAt(0).toUpperCase()}
            </span>
          )}
          {/* Out-of-service icon — top-right */}
          {table.status === 'out_of_service' && (
            <span style={{ position: 'absolute', top: 3, right: 5, fontSize: 10, color: st.dot, pointerEvents: 'none' }}>⊘</span>
          )}
          {/* Elapsed time — bottom-left */}
          {elapsedStr && (
            <span style={{ position: 'absolute', bottom: 4, left: 6, fontSize: 8, color: st.text, opacity: 0.7, fontWeight: 700, pointerEvents: 'none' }}>
              {elapsedStr}
            </span>
          )}
          {/* Amount — bottom-right */}
          {amountStr && (
            <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 8, color: st.text, opacity: 0.7, fontWeight: 700, pointerEvents: 'none' }}>
              {amountStr}
            </span>
          )}
        </>
      )}
      {/* Status dot — hidden for out_of_service */}
      {table.status !== 'out_of_service' && (
        <div style={{
          position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%",
          backgroundColor: st.dot, boxShadow: `0 0 6px ${st.glow}`,
        }} />
      )}
    </div>
  );
}

export default function Tables() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const [employeeName, setEmployeeName] = useState<string>("");
  const [employeeRole, setEmployeeRole] = useState<string>("");

  // Zoom state — persisted per zone; starts at 1× until the first zone activates
  const [zoom, setZoom] = useState<number>(1);
  // Tracks the zone whose zoom is currently loaded, so persistZoom always
  // writes to the right key even when called from gesture handlers.
  const currentZoneIdRef = useRef<string | null>(null);

  const persistZoom = useCallback((z: number) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, parseFloat(z.toFixed(2))));
    setZoom(clamped);
    const zoneId = currentZoneIdRef.current;
    if (zoneId) {
      try { sessionStorage.setItem(ZOOM_STORAGE_PREFIX + zoneId, String(clamped)); } catch { /* ignore */ }
    }
    return clamped;
  }, []);

  /** Zoom in/out keeping the current viewport centre fixed on the canvas. */
  const zoomAroundCenter = useCallback((delta: number) => {
    const el = canvasContainerRef.current;
    const newZoom = persistZoom(zoom + delta);
    if (!el) return;
    const { width: cw, height: ch } = el.getBoundingClientRect();
    // Viewport centre in canvas-space coordinates (at the *old* zoom level)
    const oldZoom = zoom;
    const cx = (el.scrollLeft + cw / 2) / oldZoom;
    const cy = (el.scrollTop  + ch / 2) / oldZoom;
    // Reposition scroll so the same canvas point stays centred after zoom
    el.scrollLeft = cx * newZoom - cw / 2;
    el.scrollTop  = cy * newZoom - ch / 2;
  }, [zoom, persistZoom]);

  const handleZoomIn  = () => zoomAroundCenter(+ZOOM_STEP);
  const handleZoomOut = () => zoomAroundCenter(-ZOOM_STEP);

  const handleFit = useCallback(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const { width: cw, height: ch } = el.getBoundingClientRect();
    const fitZoom = Math.min(cw / CANVAS_W, ch / CANVAS_H) * 0.95;
    persistZoom(fitZoom);
    // Reset scroll so the whole canvas is visible from the top-left
    el.scrollLeft = 0;
    el.scrollTop  = 0;
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
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Single-finger pan state
  const panRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    /** Whether we've crossed TAP_SLOP and are actively panning */
    active: boolean;
  } | null>(null);

  useEffect(() => {
    const elOrNull = canvasContainerRef.current;
    if (!elOrNull) return;
    const el: HTMLDivElement = elOrNull;

    function dist(t: TouchList) {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        // Begin tracking a potential single-finger pan
        panRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop,
          active: false,
        };
      } else if (e.touches.length === 2) {
        // Cancel any in-progress pan when a second finger lands
        panRef.current = null;
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
      if (e.touches.length === 1 && panRef.current) {
        const dx = e.touches[0].clientX - panRef.current.startX;
        const dy = e.touches[0].clientY - panRef.current.startY;
        // Only start panning once the finger has moved beyond the tap slop
        if (!panRef.current.active) {
          if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) {
            panRef.current.active = true;
          } else {
            return; // still within tap threshold — do nothing yet
          }
        }
        e.preventDefault(); // block native scroll while panning
        el.scrollLeft = panRef.current.scrollLeft - dx;
        el.scrollTop  = panRef.current.scrollTop  - dy;
      } else if (e.touches.length === 2 && pinchRef.current) {
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

    function onTouchEnd() {
      panRef.current = null;
      pinchRef.current = null;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [persistZoom]);

  // Reset gesture refs when the page is hidden (screen lock, home button, tab
  // switch). Some iOS/Android versions suppress touchcancel in these cases,
  // leaving stale finger positions in the refs and causing position jumps on
  // return. visibilitychange fires reliably in both scenarios.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        pinchRef.current = null;
        panRef.current = null;
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const empStr = localStorage.getItem("employee");
    if (!token) {
      setLocation("/");
    } else if (empStr) {
      try {
        const emp = JSON.parse(empStr);
        setEmployeeName(emp.name);
        setEmployeeRole(emp.role ?? "");
      } catch (e) { /* ignore */ }
    }
  }, [setLocation]);

  const isAdmin = employeeRole === "admin";

  const { data: summary } = useGetDashboardSummary();
  const { data: zones, isLoading: loadingZones } = useGetZones();
  const [activeZone, setActiveZone] = useState<string | null>(null);

  useEffect(() => {
    if (zones?.length && !activeZone) setActiveZone(zones[0].id);
  }, [zones, activeZone]);

  /** Save the current canvas scroll position for a given zone to sessionStorage. */
  const saveScrollForZone = useCallback((zoneId: string) => {
    const el = canvasContainerRef.current;
    if (!el || !zoneId) return;
    try {
      sessionStorage.setItem(
        SCROLL_STORAGE_PREFIX + zoneId,
        JSON.stringify({ left: el.scrollLeft, top: el.scrollTop }),
      );
    } catch { /* ignore */ }
  }, []);

  /** Restore the saved scroll position for a zone (if any). Must be called after render. */
  const restoreScrollForZone = useCallback((zoneId: string) => {
    const el = canvasContainerRef.current;
    if (!el || !zoneId) return;
    try {
      const raw = sessionStorage.getItem(SCROLL_STORAGE_PREFIX + zoneId);
      if (raw) {
        const { left, top } = JSON.parse(raw) as { left: number; top: number };
        el.scrollLeft = left;
        el.scrollTop  = top;
      } else {
        // No saved position → start at top-left
        el.scrollLeft = 0;
        el.scrollTop  = 0;
      }
    } catch { /* ignore */ }
  }, []);

  // Pulse key — increments on every explicit zone switch so the accent div
  // remounts (via key={}) and re-runs its CSS animation. We skip the very
  // first auto-selection (null → zones[0]) so there's no animation on load.
  const [accentPulseKey, setAccentPulseKey] = useState(0);
  const accentInitRef = useRef(false);
  useEffect(() => {
    if (!activeZone) return;
    if (!accentInitRef.current) { accentInitRef.current = true; return; }
    setAccentPulseKey(k => k + 1);
  }, [activeZone]);

  /** Switch zone: persist current scroll first, then change the active zone. */
  const switchZone = useCallback((zoneId: string) => {
    if (activeZone) saveScrollForZone(activeZone);
    setActiveZone(zoneId);
  }, [activeZone, saveScrollForZone]);

  // After the active zone changes, restore the saved zoom and scroll position.
  // Zoom is restored synchronously so the canvas scales before the scroll is
  // applied; scroll uses rAF so the browser has painted the new content first.
  useEffect(() => {
    if (!activeZone) return;
    // Update the ref so persistZoom always writes to the correct zone key.
    currentZoneIdRef.current = activeZone;
    // Restore per-zone zoom (fall back to 1× if no saved level).
    try {
      const raw = sessionStorage.getItem(ZOOM_STORAGE_PREFIX + activeZone);
      const parsed = raw ? parseFloat(raw) : NaN;
      setZoom(!isNaN(parsed) && parsed >= ZOOM_MIN && parsed <= ZOOM_MAX ? parsed : 1);
    } catch { setZoom(1); }
    // Restore per-zone scroll position.
    const id = requestAnimationFrame(() => restoreScrollForZone(activeZone));
    return () => cancelAnimationFrame(id);
  }, [activeZone, restoreScrollForZone]);

  // No explicit layout param — server returns tables for the zone's active layout
  const { data: tables, isLoading: loadingTables } = useGetZoneTables(
    activeZone!,
    undefined,
    { query: { enabled: !!activeZone, queryKey: getGetZoneTablesQueryKey(activeZone!) } }
  );

  // Canvas elements (walls, doors, etc.) — read-only in camarero view
  const { data: elements } = useGetCanvasElements(
    activeZone!,
    { layout: 'normal' },
    { query: { enabled: !!activeZone, queryKey: getGetCanvasElementsQueryKey(activeZone!, { layout: 'normal' }) } }
  );

  // Auto-fit on first tables load so the full floor plan is visible immediately
  const didAutoFit = useRef(false);
  useEffect(() => {
    if (!tables?.length || didAutoFit.current) return;
    didAutoFit.current = true;
    requestAnimationFrame(() => handleFit());
  }, [tables, handleFit]);

  // Keep a ref to the active zone so the socket handler always reads the
  // latest value without needing to reconnect when the zone changes.
  const activeZoneRef = useRef<string | null>(null);
  activeZoneRef.current = activeZone;

  // Reset in-flight gesture state whenever the zone changes.
  // Normally touchend fires before a zone tap registers, but a cancelled
  // touch (browser interrupt, rapid switch) can leave stale pinch/pan state
  // that would anchor the *next* gesture to the wrong canvas coordinates.
  useEffect(() => {
    pinchRef.current = null;
    panRef.current = null;
  }, [activeZone]);

  // Real-time: socket is created once on mount and torn down on unmount.
  // Zone switches only change which queryKey is invalidated — no reconnect.
  useEffect(() => {
    const socket = io({ path: "/api/socket.io" });
    socket.on("tables:refresh", () => {
      const zone = activeZoneRef.current;
      if (zone) {
        queryClient.invalidateQueries({ queryKey: getGetZoneTablesQueryKey(zone) });
      }
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAllTablesQueryKey() });
    });
    return () => { socket.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  const openTable = useOpenTable();
  const updateZone = useUpdateZone();

  // Emoji picker state (admin only — zone tab long-press)
  const [emojiPickerZoneId, setEmojiPickerZoneId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flag set when a long-press fires the picker open; used to swallow the
  // subsequent `click` event that the browser fires after pointerup.
  const didLongPressRef = useRef(false);

  const handleZoneEmojiSelect = (zoneId: string, icon: string | null) => {
    updateZone.mutate(
      { zoneId, data: { icon: icon === null ? null : icon } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetZonesQueryKey() });
          toast.success(icon ? `Icono actualizado` : "Icono eliminado");
        },
        onError: () => toast.error("No se pudo actualizar el icono"),
      }
    );
  };

  // Guest count dialog state
  const [guestCountTable, setGuestCountTable] = useState<Table | null>(null);
  const [pendingGuestCount, setPendingGuestCount] = useState(2);

  const doOpenTable = (table: Table, guestCount: number) => {
    openTable.mutate(
      { tableId: table.id, data: { guestCount } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getGetZoneTablesQueryKey(activeZone!) });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAllTablesQueryKey() });
          setLocation(`/pedido/${table.id}/${data.order.id}`);
        },
        onError: () => toast.error("No se pudo abrir la mesa"),
      }
    );
    setGuestCountTable(null);
  };

  const handleTableClick = (table: Table) => {
    if (table.status === "free") {
      setPendingGuestCount(2);
      setGuestCountTable(table);
    } else if (table.status === "out_of_service") {
      // Out-of-service tables have no active order — do nothing
      return;
    } else {
      setLocation(`/pedido/${table.id}/current`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("employee");
    setLocation("/");
  };

  // Compute merge group bounding boxes for overlay
  const mergeGroups: Record<string, Table[]> = {};
  if (tables) {
    for (const t of tables) {
      if (t.mergeGroup) (mergeGroups[t.mergeGroup] = mergeGroups[t.mergeGroup] ?? []).push(t);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-card border-b border-border shadow-sm shrink-0 relative z-20">
        <button
          onClick={() => isAdmin && setLocation("/admin")}
          className={`flex items-center gap-3 ${isAdmin ? "hover:opacity-80 active:scale-95 transition-all cursor-pointer" : "cursor-default"}`}
          title={isAdmin ? "Volver al Dashboard" : undefined}
        >
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">P</div>
          <span className="font-semibold text-lg tracking-tight hidden sm:inline-block">Piccolo</span>
        </button>

        {summary && (
          <div className="flex items-center gap-5 text-sm font-medium bg-background px-4 py-2 rounded-full border border-border">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Total</span>
              <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">{summary.totalTables}</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-[#c05c4a]">Ocupadas</span>
              <span className="px-2 py-0.5 rounded bg-[#c05c4a]/10 text-[#c05c4a] font-mono">{summary.occupiedTables}</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-[#61895f]">Libres</span>
              <span className="px-2 py-0.5 rounded bg-[#61895f]/10 text-[#61895f] font-mono">{summary.freeTables}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/recogida")}
            className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 text-sm font-bold uppercase tracking-wider"
            title="Recogida de pedidos">
            <Package size={14} />
            <span className="hidden sm:inline">Recogida</span>
          </button>
          {isAdmin && (
            <>
              <button onClick={() => setLocation("/configuracion")}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 text-sm font-bold uppercase tracking-wider"
                title="Configuración de salas">
                <Settings size={14} />
                <span className="hidden sm:inline">Config</span>
              </button>
              <button onClick={() => setLocation("/kds/cocina")}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 text-sm font-bold uppercase tracking-wider"
                title="Pantalla de cocina">
                <Monitor size={14} />
                <span className="hidden sm:inline">KDS</span>
              </button>
              <button onClick={() => setLocation("/caja")}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 transition-colors active:scale-95 text-sm font-bold uppercase tracking-wider"
                title="Gestión de caja">
                <span className="text-base leading-none">🗃</span>
                <span className="hidden sm:inline">Caja</span>
              </button>
            </>
          )}

          {/* Employee chip */}
          <div className="flex items-center gap-2 text-sm font-medium pl-1">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-secondary-foreground">
                {employeeName.charAt(0) || "U"}
              </div>
              {isAdmin && (
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-card flex items-center justify-center text-[8px] font-black text-white leading-none">A</span>
              )}
            </div>
            <div className="hidden md:flex flex-col leading-none">
              <span className="font-semibold">{employeeName}</span>
              <span className={`text-[10px] uppercase tracking-widest font-bold mt-0.5 ${isAdmin ? "text-amber-500" : "text-muted-foreground"}`}>
                {employeeRole || "staff"}
              </span>
            </div>
          </div>

          <button onClick={handleLogout}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors active:scale-90"
            title="Cerrar sesión">
            <LogOut size={18} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* Zone Tabs + Zoom controls */}
      <div className="bg-card border-b border-border shrink-0 px-4 pt-4 pb-0 flex items-end justify-between overflow-x-auto hide-scrollbar">
        <div className="overflow-x-auto hide-scrollbar">
          {loadingZones ? (
            <div className="flex gap-2 pb-4">
              {[1, 2, 3].map(i => <div key={i} className="w-24 h-10 rounded-t-xl bg-secondary animate-pulse" />)}
            </div>
          ) : (
            <div className="flex gap-2">
              {zones?.map(zone => {
                const isActive = activeZone === zone.id;
                const zoneColor = zone.color ?? null;
                const isEmojiOpen = isAdmin && emojiPickerZoneId === zone.id;
                return (
                  <div key={zone.id} className="relative">
                    <button
                      onClick={() => {
                        // Swallow the click that the browser fires right after a long-press pointerup
                        if (didLongPressRef.current) { didLongPressRef.current = false; return; }
                        // A tap while the picker is open just closes it without switching zones
                        if (emojiPickerZoneId) { setEmojiPickerZoneId(null); return; }
                        switchZone(zone.id);
                      }}
                      onPointerDown={() => {
                        if (!isAdmin) return;
                        longPressTimerRef.current = setTimeout(() => {
                          longPressTimerRef.current = null;
                          didLongPressRef.current = true;
                          setEmojiPickerZoneId(zone.id);
                        }, 500);
                      }}
                      onPointerUp={() => {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                      onPointerLeave={() => {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                      onPointerCancel={() => {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                      onContextMenu={e => {
                        if (!isAdmin) return;
                        e.preventDefault();
                        didLongPressRef.current = false;
                        setEmojiPickerZoneId(prev => prev === zone.id ? null : zone.id);
                      }}
                      style={isActive && zoneColor ? { borderTopColor: zoneColor, color: zoneColor } : undefined}
                      className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-semibold text-sm transition-all whitespace-nowrap
                        ${isActive
                          ? "bg-background border-t-2 border-primary shadow-[0_-4px_10px_rgba(0,0,0,0.05)]"
                          : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"}
                        ${isAdmin ? "select-none" : ""}`}
                    >
                      {zone.icon ? (
                        <span className="shrink-0 text-base leading-none">{zone.icon}</span>
                      ) : zoneColor ? (
                        <span
                          className="shrink-0 w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: zoneColor, boxShadow: isActive ? `0 0 6px ${zoneColor}88` : undefined }}
                        />
                      ) : null}
                      {zone.name}
                    </button>
                    {isEmojiOpen && (
                      <ZoneEmojiPicker
                        currentIcon={zone.icon}
                        onSelect={icon => handleZoneEmojiSelect(zone.id, icon)}
                        onClose={() => setEmojiPickerZoneId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 mb-2 ml-4 shrink-0">
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
            <span>Encajar</span>
          </button>
        </div>
      </div>

      {/* Zone color accent — thin rule that follows the active zone.
          Always occupies 3 px so it acts as a visual separator even when
          the zone has no custom color. The empty-state overlay inside
          <main> is absolutely positioned and cannot cover this element.
          When the zone changes, accentPulseKey increments → the div remounts
          with key= so the CSS animation runs from scratch each time. */}
      <style>{`
        @keyframes zone-accent-pulse {
          0%   { transform: scaleY(1);   filter: brightness(1);   opacity: 1; }
          30%  { transform: scaleY(2.6); filter: brightness(1.9); opacity: 1; }
          100% { transform: scaleY(1);   filter: brightness(1);   opacity: 1; }
        }
        .zone-accent-pulse {
          animation: zone-accent-pulse 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transform-origin: center;
        }
      `}</style>
      {(() => {
        const activeZoneColor = zones?.find(z => z.id === activeZone)?.color ?? null;
        return (
          <div
            key={accentPulseKey}
            className={accentPulseKey > 0 ? "zone-accent-pulse" : undefined}
            style={{
              height: 3,
              minHeight: 3,
              flexShrink: 0,
              background: activeZoneColor ?? undefined,
              borderBottom: activeZoneColor ? undefined : "1px solid var(--border)",
              transition: "background 0.35s ease, border-color 0.35s ease",
            }}
          />
        );
      })()}

      {/* Floor plan canvas — overflow:auto creates a scroll container that
          clips absolutely-positioned children (e.g. the empty-state overlay)
          so they cannot bleed upward and obscure the accent rule above. */}
      <main ref={canvasContainerRef} className="flex-1 overflow-auto bg-[#0c0c0c] relative">
        {loadingTables ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !tables?.length ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <span className="font-bold text-2xl">!</span>
            </div>
            <p className="text-lg font-semibold">Sin mesas configuradas</p>
            {isAdmin && (
              <button onClick={() => setLocation("/configuracion")}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:opacity-90 active:scale-95 transition-all">
                Ir a Configuración →
              </button>
            )}
          </div>
        ) : (
          /* Outer wrapper occupies exactly the scaled canvas size so scrollbars appear correctly */
          <div style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom, position: "relative", flexShrink: 0 }}>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: CANVAS_W,
                height: CANVAS_H,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                backgroundImage: GRID_BG,
                backgroundSize: "40px 40px",
              }}
            >
              {/* Merge group bounding boxes */}
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                {Object.values(mergeGroups).filter(g => g.length >= 2).map((grp, gi) => {
                  const minX = Math.min(...grp.map(t => t.x)) - 6;
                  const minY = Math.min(...grp.map(t => t.y)) - 6;
                  const maxX = Math.max(...grp.map(t => t.x + t.width)) + 6;
                  const maxY = Math.max(...grp.map(t => t.y + t.height)) + 6;
                  return (
                    <rect key={gi} x={minX} y={minY} width={maxX - minX} height={maxY - minY}
                      rx="12" ry="12" fill="rgba(192,132,252,0.06)"
                      stroke="rgba(192,132,252,0.3)" strokeWidth="1.5" strokeDasharray="6 4" />
                  );
                })}
              </svg>

              {/* Canvas elements — read-only room layout (walls, doors, etc.) */}
              {elements?.map(el => <ElementShape key={el.id} el={el} />)}

              {/* Tables */}
              {tables.map(table => (
                <TableCard
                  key={table.id}
                  table={table}
                  onClick={() => handleTableClick(table)}
                  isBusy={openTable.isPending && openTable.variables?.tableId === table.id}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Guest count dialog */}
      {guestCountTable && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={() => setGuestCountTable(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-xs shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h2 className="font-black text-2xl leading-tight">{guestCountTable.name}</h2>
              <p className="text-muted-foreground text-sm mt-1 font-semibold">¿Cuántos comensales?</p>
            </div>
            <div className="p-4">
              {/* Quick selector grid */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setPendingGuestCount(n)}
                    className={`h-12 rounded-xl font-black text-xl transition-all active:scale-[0.95] border-2 ${
                      pendingGuestCount === n
                        ? 'bg-primary text-primary-foreground border-primary shadow-[0_4px_12px_rgba(0,0,0,0.3)]'
                        : 'bg-secondary/50 border-border text-foreground hover:border-primary/40'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {/* Manual +/- for more than 8 */}
              <div className="flex items-center justify-center gap-4 mb-5">
                <button
                  onClick={() => setPendingGuestCount(Math.max(1, pendingGuestCount - 1))}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-secondary border border-border hover:border-primary/40 text-foreground transition-colors active:scale-90 font-black text-lg"
                >−</button>
                <span className="text-3xl font-black w-12 text-center tabular-nums">{pendingGuestCount}</span>
                <button
                  onClick={() => setPendingGuestCount(pendingGuestCount + 1)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-secondary border border-border hover:border-primary/40 text-foreground transition-colors active:scale-90 font-black text-lg"
                >+</button>
              </div>
              <button
                onClick={() => doOpenTable(guestCountTable, pendingGuestCount)}
                disabled={openTable.isPending}
                className="w-full py-4 bg-primary text-primary-foreground font-black text-xl uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(0,0,0,0.3)] disabled:opacity-50 hover:-translate-y-0.5"
              >
                {openTable.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Abrir mesa
              </button>
              <button onClick={() => setGuestCountTable(null)} className="w-full mt-2.5 py-3 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors font-bold">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
