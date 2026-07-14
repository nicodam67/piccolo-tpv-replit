import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import {
  useGetDashboardSummary,
  useGetZones,
  useGetZoneTables,
  useOpenTable,
  getGetZoneTablesQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetAllTablesQueryKey,
  type Table,
} from "@workspace/api-client-react";
import { LogOut, Loader2, Monitor, Settings, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { toast } from "sonner";

// Canvas constants — same as zone-editor so layouts match
const CANVAS_W = 1600;
const CANVAS_H = 900;

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.0;
const ZOOM_STORAGE_KEY = "piccolo_floor_zoom";

// SVG grid background
const GRID_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='rgba(255,255,255,0.04)' stroke-width='1'/%3E%3C/svg%3E")`;

// Max pointer movement (in CSS px) between pointerdown and pointerup
// that still counts as a deliberate tap. Anything larger is treated as a
// scroll/drag and the click is suppressed.
const TAP_SLOP = 8;

function TableCard({ table, onClick, isBusy }: { table: Table; onClick: () => void; isBusy: boolean }) {
  const isFree   = table.status === "free";
  const isMerged = !!table.mergeGroup;

  const borderColor = isMerged
    ? (isFree ? "#7c3aed" : "#9f1239")
    : isFree
    ? "#3f573c"
    : "#6b3127";

  const bgColor   = isFree ? "#253324" : "#45201a";
  const textColor = isFree ? "#dcecdb" : "#f5dcd8";
  const dotColor  = isFree ? "#61895f" : "#c05c4a";
  const radius    = table.shape === "round" ? "50%" : "10px";

  // Track pointer position at press time so we can ignore drags / scrolls.
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerOrigin.current = { x: e.clientX, y: e.clientY };
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isBusy) return;
    if (pointerOrigin.current) {
      const dx = e.clientX - pointerOrigin.current.x;
      const dy = e.clientY - pointerOrigin.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > TAP_SLOP) {
        // The pointer drifted — this is a scroll, not a tap. Ignore it.
        pointerOrigin.current = null;
        return;
      }
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
        backgroundColor: bgColor,
        border: `2.5px solid ${borderColor}`,
        boxShadow: `0 2px 10px rgba(0,0,0,0.45)`,
        cursor: isBusy ? "wait" : "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        transition: "border-color 0.15s, box-shadow 0.15s",
        userSelect: "none",
      }}
      className="hover:brightness-110 active:scale-[0.97] transition-transform"
    >
      {isBusy ? (
        <Loader2 style={{ width: 20, height: 20, color: textColor, opacity: 0.6 }} className="animate-spin" />
      ) : (
        <>
          <span style={{
            color: textColor, fontWeight: 900,
            fontSize: Math.max(10, Math.min(table.width, table.height) / 5),
            lineHeight: 1, pointerEvents: "none",
          }}>
            {table.name}
          </span>
          <span style={{ color: textColor, opacity: 0.6, fontSize: 10, pointerEvents: "none" }}>
            {table.capacity}p
          </span>
        </>
      )}
      {/* Status dot */}
      <div style={{
        position: "absolute", top: 6, right: 6,
        width: 8, height: 8, borderRadius: "50%",
        backgroundColor: dotColor,
        boxShadow: `0 0 6px ${dotColor}`,
      }} />
    </div>
  );
}

export default function Tables() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const [employeeName, setEmployeeName] = useState<string>("");
  const [employeeRole, setEmployeeRole] = useState<string>("");

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

  // Pinch-to-zoom — non-passive so we can preventDefault and block scroll
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

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

  const { data: tables, isLoading: loadingTables } = useGetZoneTables(activeZone!, {
    query: { enabled: !!activeZone, queryKey: getGetZoneTablesQueryKey(activeZone!) }
  });

  // Keep a ref to the active zone so the socket handler always reads the
  // latest value without needing to reconnect when the zone changes.
  const activeZoneRef = useRef<string | null>(null);
  activeZoneRef.current = activeZone;

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

  const handleTableClick = (table: Table) => {
    if (table.status === "free") {
      openTable.mutate(
        { tableId: table.id },
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
          {isAdmin && (
            <>
              <button onClick={() => setLocation("/configuracion")}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 text-sm font-bold uppercase tracking-wider"
                title="Configuración de salas">
                <Settings size={14} />
                <span className="hidden sm:inline">Config</span>
              </button>
              <button onClick={() => setLocation("/kds")}
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
                return (
                  <button key={zone.id} onClick={() => setActiveZone(zone.id)}
                    className={`px-6 py-3 rounded-t-xl font-semibold text-sm transition-all whitespace-nowrap
                      ${isActive
                        ? "bg-background text-primary border-t-2 border-primary shadow-[0_-4px_10px_rgba(0,0,0,0.05)]"
                        : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                    {zone.name}
                  </button>
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

      {/* Floor plan canvas */}
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
    </div>
  );
}
