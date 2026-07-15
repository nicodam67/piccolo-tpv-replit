import React, { useState, useEffect, useRef, useCallback } from "react";
import { useScrollGuard } from "../hooks/use-scroll-guard";
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
  useGetEmployeeLoginList,
  useGetOccupationSummary,
  useGetAlertConfig,
  useGetTableHistory,
  useCleanTable,
  useBlockTable,
  useTransferTable,
  useMergeTables,
  useSeparateTable,
  useTransferWaiter,
  getGetZoneTablesQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetAllTablesQueryKey,
  getGetCanvasElementsQueryKey,
  getGetZonesQueryKey,
  getGetOccupationSummaryQueryKey,
  getGetAlertConfigQueryKey,
  type Table,
  type CanvasElement,
  type TableEvent,
  type AlertConfig,
} from "@workspace/api-client-react";
import {
  LogOut, Loader2, Monitor, Settings, ZoomIn, ZoomOut, Maximize2, Package,
  CheckCircle2, CalendarClock, Users, ChefHat, FileText, CreditCard,
  Sparkles, Lock, Clock, X, History, AlertTriangle, Info,
  LayoutGrid, Coins, ArrowRight, Layers, UserCog, Scissors, Calendar,
} from "lucide-react";
import { toast } from "sonner";

// ─── Emoji palette ────────────────────────────────────────────────────────────
const ZONE_EMOJIS = [
  '🍕','🍔','🌮','🥩','🐟','🦞','🍷','🍺','☕','🧉','🥂','🍹',
  '🌿','🏖️','🎉','⭐','🔥','🌙','🎭','🎸','🌺','❄️','🏔️','🌅',
];

// ─── Status configuration ──────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; dot: string; glow: string }> = {
  free:                { bg: '#253324', border: '#3f573c', text: '#dcecdb', dot: '#61895f', glow: '#61895f' },
  reserved:            { bg: '#2a1a3a', border: '#6a3a8a', text: '#e4c8ff', dot: '#a855f7', glow: '#a855f7' },
  occupied:            { bg: '#45201a', border: '#6b3127', text: '#f5dcd8', dot: '#c05c4a', glow: '#c05c4a' },
  comanda_abierta:     { bg: '#3d1f00', border: '#7c3d00', text: '#ffe0b0', dot: '#fb923c', glow: '#fb923c' },
  prefactura_impresa:  { bg: '#1a2040', border: '#3b4ea0', text: '#bfcfff', dot: '#4f6ef7', glow: '#4f6ef7' },
  pendiente_cobro:     { bg: '#3a2c0f', border: '#7a5c1a', text: '#fde68a', dot: '#f59e0b', glow: '#f59e0b' },
  parcialmente_cobrada:{ bg: '#0f2e2e', border: '#1e6262', text: '#99f6e4', dot: '#2dd4bf', glow: '#2dd4bf' },
  pendiente_limpieza:  { bg: '#1e1a2e', border: '#3a3060', text: '#c4b5fd', dot: '#8b5cf6', glow: '#8b5cf6' },
  bloqueada:           { bg: '#1e1e22', border: '#44444e', text: '#888898', dot: '#55555f', glow: 'transparent' },
  // Legacy aliases
  waiting:             { bg: '#3a2c0f', border: '#7a5c1a', text: '#fde68a', dot: '#f59e0b', glow: '#f59e0b' },
  bill_requested:      { bg: '#1a2040', border: '#3b4ea0', text: '#bfcfff', dot: '#4f6ef7', glow: '#4f6ef7' },
  out_of_service:      { bg: '#1e1e22', border: '#44444e', text: '#888898', dot: '#55555f', glow: 'transparent' },
};

const STATUS_ICONS: Record<string, React.FC<{ size?: number; style?: React.CSSProperties }>> = {
  free:                CheckCircle2,
  reserved:            CalendarClock,
  occupied:            Users,
  comanda_abierta:     ChefHat,
  prefactura_impresa:  FileText,
  pendiente_cobro:     CreditCard,
  parcialmente_cobrada:Coins,
  pendiente_limpieza:  Sparkles,
  bloqueada:           Lock,
  waiting:             CreditCard,
  bill_requested:      FileText,
  out_of_service:      Lock,
};

const STATUS_LABELS: Record<string, string> = {
  free:                'Libre',
  reserved:            'Reservada',
  occupied:            'Ocupada',
  comanda_abierta:     'Comanda abierta',
  prefactura_impresa:  'Prefactura impresa',
  pendiente_cobro:     'Pendiente de cobro',
  parcialmente_cobrada:'Parcialmente cobrada',
  pendiente_limpieza:  'Pendiente de limpieza',
  bloqueada:           'Bloqueada',
};

const LEGEND_STATUSES = [
  'free','reserved','occupied','comanda_abierta','prefactura_impresa',
  'pendiente_cobro','parcialmente_cobrada','pendiente_limpieza','bloqueada',
];

// ─── Canvas constants ──────────────────────────────────────────────────────────
const CANVAS_W = 1600;
const CANVAS_H = 900;
const ELEMENT_COLOR: Record<string, string> = {
  wall: '#64748b', door: '#854d0e', window: '#7dd3fc', bar: '#78350f', column: '#475569',
};
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.0;
const ZOOM_STORAGE_PREFIX   = "piccolo_floor_zoom_";
const SCROLL_STORAGE_PREFIX = "piccolo_floor_scroll_";
const TAP_SLOP = 8;
const GRID_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='rgba(255,255,255,0.04)' stroke-width='1'/%3E%3C/svg%3E")`;

// ─── Helper ────────────────────────────────────────────────────────────────────
function elapsed(openedAt: string | null | undefined): string {
  if (!openedAt) return '';
  const ms = Date.now() - new Date(openedAt).getTime();
  if (ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h${(mins % 60).toString().padStart(2, '0')}`;
}

function elapsedMinutes(isoDate: string | null | undefined): number {
  if (!isoDate) return 0;
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
}

// ─── Zone emoji picker ─────────────────────────────────────────────────────────
interface ZoneEmojiPickerProps { currentIcon: string | null | undefined; onSelect: (icon: string | null) => void; onClose: () => void; }
function ZoneEmojiPicker({ currentIcon, onSelect, onClose }: ZoneEmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    const id = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handleClick); };
  }, [onClose]);
  return (
    <div ref={ref} className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-2xl shadow-2xl p-3" style={{ minWidth: 230 }}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">Icono de la sala</p>
      <div className="grid grid-cols-6 gap-1 mb-2">
        {ZONE_EMOJIS.map(emoji => (
          <button key={emoji} onPointerDown={e => e.stopPropagation()} onClick={() => { onSelect(emoji); onClose(); }}
            className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all active:scale-90 hover:bg-secondary ${currentIcon === emoji ? 'bg-primary/15 ring-2 ring-primary/40' : ''}`}>
            {emoji}
          </button>
        ))}
      </div>
      <button onPointerDown={e => e.stopPropagation()} onClick={() => { onSelect(null); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-secondary transition-colors">
        <div className="w-5 h-5 rounded-md border-2 border-dashed border-muted-foreground/40" />
        Sin icono
      </button>
    </div>
  );
}

// ─── ElementShape ──────────────────────────────────────────────────────────────
function ElementShape({ el }: { el: CanvasElement }) {
  const color = el.color ?? ELEMENT_COLOR[el.type] ?? '#64748b';
  const isCol = el.type === 'column', isDoor = el.type === 'door', isBar = el.type === 'bar', isWin = el.type === 'window';
  return (
    <div style={{
      position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height,
      backgroundColor: isWin ? 'transparent' : color,
      borderRadius: isCol ? '50%' : isDoor ? '4px 4px 0 0' : isBar ? '8px' : isWin ? '2px' : '3px',
      border: isWin ? `3px solid ${color}` : `1px solid ${color}dd`,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      transformOrigin: 'center center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: 0.78, pointerEvents: 'none', userSelect: 'none', overflow: 'visible',
    }}>
      {isWin && (<>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, backgroundColor: color, transform: 'translateX(-50%)', opacity: 0.7 }} />
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, backgroundColor: color, transform: 'translateY(-50%)', opacity: 0.7 }} />
      </>)}
      {(isBar || el.label) && !isWin && (
        <span style={{ color: '#fff', fontSize: Math.max(9, Math.min(el.height / 2, 14)), fontWeight: 800, letterSpacing: 1, opacity: 0.9, textTransform: 'uppercase' }}>
          {el.label ?? el.type}
        </span>
      )}
      {isDoor && (
        <svg width={el.width * 0.7} height={el.height * 1.5} viewBox="0 0 40 40" style={{ position: 'absolute', bottom: el.height * 0.9, pointerEvents: 'none', opacity: 0.6 }}>
          <path d="M0,40 A40,40 0 0,1 40,40" fill="none" stroke="#fff" strokeWidth="2" />
        </svg>
      )}
    </div>
  );
}

// ─── StatusLegend panel ────────────────────────────────────────────────────────
function StatusLegend({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute bottom-4 right-4 z-30 bg-card/95 border border-border rounded-2xl shadow-2xl backdrop-blur-sm overflow-hidden" style={{ minWidth: 220 }}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <LayoutGrid size={13} className="text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Leyenda</span>
        </div>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
          <X size={12} />
        </button>
      </div>
      <div className="p-2">
        {LEGEND_STATUSES.map(st => {
          const style = STATUS_STYLES[st] ?? STATUS_STYLES.free;
          const Icon = STATUS_ICONS[st] ?? CheckCircle2;
          return (
            <div key={st} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-secondary/40 transition-colors">
              <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: style.bg, border: `1.5px solid ${style.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={12} style={{ color: style.dot }} />
              </div>
              <span className="text-xs font-medium" style={{ color: style.text }}>{STATUS_LABELS[st] ?? st}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── OccupationBar ─────────────────────────────────────────────────────────────
interface OccupationBarProps {
  freeCount: number;
  occupiedCount: number;
  reservedCount: number;
  currentGuests: number;
  pendingReservations: number;
  avgOccupationMinutes: number;
  pendingCleaningCount: number;
}
function OccupationBar({ freeCount, occupiedCount, reservedCount, currentGuests, pendingCleaningCount, avgOccupationMinutes }: OccupationBarProps) {
  const items = [
    { label: 'Libres',    value: freeCount,           color: '#61895f' },
    { label: 'Ocupadas',  value: occupiedCount,        color: '#c05c4a' },
    { label: 'Reservadas',value: reservedCount,        color: '#a855f7' },
    { label: 'Comensales',value: currentGuests,        color: '#f59e0b' },
    ...(pendingCleaningCount > 0 ? [{ label: 'Limpieza', value: pendingCleaningCount, color: '#8b5cf6' }] : []),
    ...(avgOccupationMinutes > 0 ? [{ label: 'T. medio', value: avgOccupationMinutes > 60 ? `${Math.floor(avgOccupationMinutes/60)}h${(avgOccupationMinutes%60).toString().padStart(2,'0')}` : `${avgOccupationMinutes}m`, color: '#64748b' }] : []),
  ];
  return (
    <div className="bg-card/80 border-b border-border/50 px-4 py-1.5 flex items-center gap-4 overflow-x-auto hide-scrollbar shrink-0">
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          {i > 0 && <div className="w-px h-3 bg-border/60 shrink-0" />}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{item.label}</span>
            <span className="text-xs font-black tabular-nums" style={{ color: item.color }}>{item.value}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── TableHistoryDrawer ────────────────────────────────────────────────────────
const ACTION_ICONS: Record<string, string> = {
  open_table: '🔓', close_table: '🔒', clean_table: '✨', block_table: '⛔', unblock_table: '🔓',
  add_item: '➕', send_kds: '👨‍🍳', bill_request: '🧾', payment: '💳', cancel_item: '✂️',
  waiter_transfer: '🔄', table_transfer: '↗️', merge_table: '🔗', separate_table: '✂️',
};

function TableHistoryDrawer({ tableId, tableName, onClose }: { tableId: string; tableName: string; onClose: () => void }) {
  const { data: events, isLoading } = useGetTableHistory(tableId, { query: { enabled: !!tableId, queryKey: [`/api/tables/${tableId}/history`] } });
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 max-w-full bg-card border-l border-border shadow-2xl flex flex-col" style={{ top: 0 }}>
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-card shrink-0">
        <div>
          <h3 className="font-black text-sm">{tableName}</h3>
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider mt-0.5">Historial</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors"><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : !events?.length ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <History size={28} className="mb-2 opacity-30" />
            <p className="text-xs font-semibold">Sin eventos registrados</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-8 top-0 bottom-0 w-px bg-border/60" />
            {events.map((ev: TableEvent) => (
              <div key={ev.id} className="flex gap-3 px-4 py-2.5 hover:bg-secondary/20 transition-colors relative">
                <div className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-card border border-border text-sm z-10">
                  {ACTION_ICONS[ev.action] ?? '📋'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold capitalize leading-snug">{ev.action.replace(/_/g, ' ')}</p>
                  {ev.details && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{ev.details}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    {ev.employeeName && <span className="text-[10px] text-muted-foreground font-medium">{ev.employeeName}</span>}
                    <span className="text-[10px] text-muted-foreground/60">
                      {new Date(ev.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── OpenTableModal ────────────────────────────────────────────────────────────
interface OpenTableModalProps {
  table: Table;
  onConfirm: (params: { guestCount: number; clientName: string; notes: string; employeeId: string | null; terminalName: string }) => void;
  onCancel: () => void;
  isPending: boolean;
  currentEmployeeId?: string;
}
function OpenTableModal({ table, onConfirm, onCancel, isPending, currentEmployeeId }: OpenTableModalProps) {
  const [guestCount, setGuestCount]   = useState(2);
  const [clientName, setClientName]   = useState('');
  const [notes, setNotes]             = useState('');
  const [employeeId, setEmployeeId]   = useState<string | null>(currentEmployeeId ?? null);
  const { data: employees } = useGetEmployeeLoginList();

  const handleSubmit = () => {
    onConfirm({ guestCount, clientName, notes, employeeId, terminalName: '' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between">
          <div>
            <h2 className="font-black text-xl leading-tight">{table.name}</h2>
            <p className="text-muted-foreground text-sm mt-0.5 font-medium">Abrir mesa</p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Comensales */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Comensales</label>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {[1,2,3,4,5,6,7,8].map(n => (
                <button key={n} onClick={() => setGuestCount(n)}
                  className={`h-10 rounded-xl font-black text-lg transition-all active:scale-95 border-2 ${guestCount === n ? 'bg-primary text-primary-foreground border-primary shadow-md' : 'bg-secondary/50 border-border text-foreground hover:border-primary/40'}`}>
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setGuestCount(Math.max(1, guestCount - 1))} className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary border border-border hover:border-primary/40 transition-colors active:scale-90 font-black text-lg">−</button>
              <span className="text-2xl font-black w-10 text-center tabular-nums">{guestCount}</span>
              <button onClick={() => setGuestCount(guestCount + 1)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary border border-border hover:border-primary/40 transition-colors active:scale-90 font-black text-lg">+</button>
            </div>
          </div>

          {/* Camarero */}
          {employees && employees.length > 1 && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Camarero responsable</label>
              <div className="grid grid-cols-2 gap-1.5">
                {employees.map(emp => (
                  <button key={emp.id} onClick={() => setEmployeeId(emp.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold text-left transition-all border-2 active:scale-95 ${employeeId === emp.id ? 'bg-primary/15 border-primary text-primary' : 'bg-secondary/50 border-border text-foreground hover:border-primary/40'}`}>
                    {emp.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nombre del cliente */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Nombre del cliente <span className="font-normal text-muted-foreground/60 normal-case">(opcional)</span></label>
            <input
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Nombre o referencia..."
              className="w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
            />
          </div>

          {/* Observaciones */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Observaciones <span className="font-normal text-muted-foreground/60 normal-case">(opcional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Alergias, preferencias..."
              className="w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-border flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors font-bold text-sm">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={isPending}
            className="flex-1 py-3 bg-primary text-primary-foreground font-black text-sm uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Abrir mesa
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TableContextMenu ──────────────────────────────────────────────────────────
interface TableContextMenuProps {
  table: Table;
  freeTables: Table[];
  employees: { id: string; name: string }[];
  isManagerOrAdmin: boolean;
  onClose: () => void;
  onTransfer: (targetTableId: string) => void;
  onMerge: (targetTableId: string) => void;
  onSeparate: () => void;
  onWaiterTransfer: (newEmployeeId: string) => void;
  isPending: boolean;
}

function TableContextMenu({
  table, freeTables, employees, isManagerOrAdmin, onClose,
  onTransfer, onMerge, onSeparate, onWaiterTransfer, isPending,
}: TableContextMenuProps) {
  const [mode, setMode] = useState<'menu' | 'transfer' | 'merge' | 'waiter'>('menu');
  const isOccupied = !['free','reserved','bloqueada','out_of_service','pendiente_limpieza'].includes(table.status);
  const isMerged = !!table.mergeGroup;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-black text-base">{table.name}</h3>
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">{STATUS_LABELS[table.status] ?? table.status}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground"><X size={15} /></button>
        </div>

        {mode === 'menu' && (
          <div className="p-2 space-y-1">
            {isOccupied && freeTables.length > 0 && (
              <button onClick={() => setMode('transfer')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary text-sm font-bold text-left transition-colors active:scale-[0.98]">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center"><ArrowRight size={15} className="text-blue-400" /></div>
                <div><div className="font-black">Trasladar mesa</div><div className="text-xs text-muted-foreground font-normal">Mover la comanda a otra mesa libre</div></div>
              </button>
            )}
            {isManagerOrAdmin && isOccupied && freeTables.length > 0 && !isMerged && (
              <button onClick={() => setMode('merge')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary text-sm font-bold text-left transition-colors active:scale-[0.98]">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center"><Layers size={15} className="text-purple-400" /></div>
                <div><div className="font-black">Unir con otra mesa</div><div className="text-xs text-muted-foreground font-normal">Combinar comandas en un grupo</div></div>
              </button>
            )}
            {isManagerOrAdmin && isMerged && (
              <button onClick={() => { onClose(); onSeparate(); }} disabled={isPending} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary text-sm font-bold text-left transition-colors active:scale-[0.98] disabled:opacity-50">
                <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center"><Scissors size={15} className="text-orange-400" /></div>
                <div><div className="font-black">Separar mesas</div><div className="text-xs text-muted-foreground font-normal">Deshacer la unión del grupo</div></div>
              </button>
            )}
            {isManagerOrAdmin && isOccupied && employees.length > 1 && (
              <button onClick={() => setMode('waiter')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary text-sm font-bold text-left transition-colors active:scale-[0.98]">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center"><UserCog size={15} className="text-emerald-400" /></div>
                <div><div className="font-black">Cambiar camarero</div><div className="text-xs text-muted-foreground font-normal">Reasignar responsable de la mesa</div></div>
              </button>
            )}
            {!isOccupied && !isMerged && (
              <div className="px-4 py-4 text-center text-muted-foreground text-sm">
                No hay operaciones disponibles para esta mesa
              </div>
            )}
          </div>
        )}

        {mode === 'transfer' && (
          <div className="p-3">
            <p className="text-xs text-muted-foreground font-semibold mb-3 px-1">Selecciona la mesa destino:</p>
            <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              {freeTables.filter(t => t.id !== table.id).map(t => (
                <button key={t.id} onClick={() => onTransfer(t.id)} disabled={isPending}
                  className="py-3 px-2 rounded-xl border-2 border-[#3f573c] bg-[#253324] text-[#dcecdb] font-black text-sm hover:brightness-110 active:scale-[0.96] transition-all text-center disabled:opacity-50">
                  {t.name}
                </button>
              ))}
            </div>
            <button onClick={() => setMode('menu')} className="w-full mt-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">← Atrás</button>
          </div>
        )}

        {mode === 'merge' && (
          <div className="p-3">
            <p className="text-xs text-muted-foreground font-semibold mb-3 px-1">Unir con:</p>
            <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              {freeTables.filter(t => t.id !== table.id).map(t => (
                <button key={t.id} onClick={() => onMerge(t.id)} disabled={isPending}
                  className="py-3 px-2 rounded-xl border-2 border-[#3f573c] bg-[#253324] text-[#dcecdb] font-black text-sm hover:brightness-110 active:scale-[0.96] transition-all text-center disabled:opacity-50">
                  {t.name}
                </button>
              ))}
            </div>
            <button onClick={() => setMode('menu')} className="w-full mt-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">← Atrás</button>
          </div>
        )}

        {mode === 'waiter' && (
          <div className="p-3">
            <p className="text-xs text-muted-foreground font-semibold mb-3 px-1">Asignar camarero:</p>
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {employees.map(emp => (
                <button key={emp.id} onClick={() => onWaiterTransfer(emp.id)} disabled={isPending}
                  className="py-3 px-3 rounded-xl border-2 border-border bg-secondary/50 font-bold text-sm hover:border-primary/40 hover:bg-secondary active:scale-[0.96] transition-all text-left disabled:opacity-50">
                  {emp.name}
                </button>
              ))}
            </div>
            <button onClick={() => setMode('menu')} className="w-full mt-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">← Atrás</button>
          </div>
        )}

        <div className="px-4 py-2 border-t border-border">
          <button onClick={onClose} className="w-full py-2 rounded-xl text-xs text-muted-foreground hover:bg-secondary transition-colors font-bold">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── TableCard ─────────────────────────────────────────────────────────────────
type AlertLevel = 'none' | 'warn' | 'danger';

interface TableCardProps {
  table: Table;
  onClick: () => void;
  onHistory?: () => void;
  onClean?: () => void;
  onLongPress?: () => void;
  isBusy: boolean;
  alertLevel: AlertLevel;
  isManagerOrAdmin: boolean;
}

function TableCard({ table, onClick, onHistory, onClean, onLongPress, isBusy, alertLevel, isManagerOrAdmin }: TableCardProps) {
  const isMerged   = !!table.mergeGroup;
  const st         = STATUS_STYLES[table.status] ?? STATUS_STYLES.free;
  const rotation   = (table as any).rotation ?? 0;
  const radius     = table.shape === "round" ? "50%" : "10px";
  const elapsedStr = elapsed((table as any).openedAt);
  const hasAmount  = (table as any).currentTotal != null && (table as any).currentTotal > 0;
  const amountStr  = hasAmount ? `${Number((table as any).currentTotal).toFixed(2)}€` : '';
  const guestCount = (table as any).guestCount;
  const clientName = (table as any).clientName;
  const Icon       = STATUS_ICONS[table.status] ?? CheckCircle2;
  const isBlocked  = table.status === 'bloqueada' || table.status === 'out_of_service';
  const isPendingClean = table.status === 'pendiente_limpieza';

  const longPressTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress    = useRef(false);
  const startPos        = useRef<{ x: number; y: number } | null>(null);

  const { onPointerDown: handlePointerDown, guard } = useScrollGuard();

  const handleCardPointerDown = (e: React.PointerEvent) => {
    handlePointerDown(e);
    if (!onLongPress) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      didLongPress.current = true;
      onLongPress();
    }, 600);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };
  const handleCardPointerMove = (e: React.PointerEvent) => {
    if (startPos.current) {
      const dx = Math.abs(e.clientX - startPos.current.x), dy = Math.abs(e.clientY - startPos.current.y);
      if (dx > 8 || dy > 8) cancelLongPress();
    }
  };
  const handleClick = guard(() => { if (!isBusy && !didLongPress.current) onClick(); });

  const alertRingColor = alertLevel === 'danger' ? '#ef4444' : alertLevel === 'warn' ? '#f59e0b' : 'transparent';

  return (
    <div
      onPointerDown={handleCardPointerDown}
      onPointerMove={handleCardPointerMove}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onContextMenu={e => { if (onLongPress) { e.preventDefault(); cancelLongPress(); didLongPress.current = true; onLongPress(); } }}
      onClick={handleClick}
      style={{
        position: "absolute", left: table.x, top: table.y, width: table.width, height: table.height,
        borderRadius: radius,
        backgroundColor: st.bg,
        border: `2.5px solid ${isMerged ? (table.status === 'free' ? '#7c3aed' : '#6b3a8a') : st.border}`,
        boxShadow: alertLevel !== 'none'
          ? `0 2px 10px rgba(0,0,0,0.45), 0 0 0 3px ${alertRingColor}44, 0 0 12px ${alertRingColor}66`
          : '0 2px 10px rgba(0,0,0,0.45)',
        cursor: isBusy ? "wait" : isBlocked ? 'not-allowed' : 'pointer',
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: 'center center',
        opacity: isBlocked ? 0.6 : 1,
        transition: "border-color 0.15s, box-shadow 0.15s",
        userSelect: "none",
      }}
      className={`hover:brightness-110 active:scale-[0.97] transition-transform ${alertLevel !== 'none' ? 'animate-pulse-ring' : ''}`}
    >
      {isBusy ? (
        <Loader2 style={{ width: 20, height: 20, color: st.text, opacity: 0.6 }} className="animate-spin" />
      ) : (
        <>
          <span style={{ color: st.text, fontWeight: 900, fontSize: Math.max(10, Math.min(table.width, table.height) / 5), lineHeight: 1, pointerEvents: "none" }}>
            {table.name}
          </span>
          {/* Guest count or capacity */}
          <span style={{ color: st.text, opacity: 0.6, fontSize: 9, pointerEvents: "none" }}>
            {guestCount ? `${guestCount}p` : `${table.capacity}p`}
          </span>
          {/* Employee initial — top-left */}
          {(table as any).employeeName && (
            <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 8, color: st.text, opacity: 0.55, fontWeight: 700, pointerEvents: 'none' }}>
              {(table as any).employeeName.charAt(0).toUpperCase()}
            </span>
          )}
          {/* Status icon — top-right (replaced by clean button for pending_limpieza) */}
          {isPendingClean && isManagerOrAdmin && onClean ? (
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onClean(); }}
              style={{ position: 'absolute', top: 3, right: 4, width: 18, height: 18, borderRadius: 5, backgroundColor: st.dot + '33', border: `1px solid ${st.dot}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}
              title="Marcar como limpia"
            >
              <Sparkles size={10} style={{ color: st.dot }} />
            </button>
          ) : (
            <Icon size={10} style={{ position: 'absolute', top: 4, right: 5, color: st.dot, pointerEvents: 'none', opacity: 0.9 }} />
          )}
          {/* History button — bottom-left (manager/admin only) */}
          {isManagerOrAdmin && onHistory && !isPendingClean && (
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onHistory(); }}
              style={{ position: 'absolute', bottom: 3, left: 4, width: 16, height: 16, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}
              title="Ver historial"
            >
              <History size={9} style={{ color: st.text, opacity: 0.6 }} />
            </button>
          )}
          {/* Elapsed time — bottom (center or bottom-right depending on space) */}
          {elapsedStr && (
            <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 8, color: st.text, opacity: 0.7, fontWeight: 700, pointerEvents: 'none' }}>
              {elapsedStr}
            </span>
          )}
          {/* Amount — if no elapsed (free/reserved) show amount alone */}
          {amountStr && !elapsedStr && (
            <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 8, color: st.text, opacity: 0.7, fontWeight: 700, pointerEvents: 'none' }}>
              {amountStr}
            </span>
          )}
          {/* Alert badge */}
          {alertLevel !== 'none' && (
            <div style={{ position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', zIndex: 1 }}>
              <AlertTriangle size={10} style={{ color: alertRingColor }} />
            </div>
          )}
          {/* Client name chip — only shown on larger tables */}
          {clientName && table.width >= 100 && (
            <span style={{ position: 'absolute', bottom: 14, left: 6, right: 6, fontSize: 7, color: st.text, opacity: 0.5, fontWeight: 600, pointerEvents: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
              {clientName}
            </span>
          )}
        </>
      )}
      {/* Status dot */}
      {!isBlocked && (
        <div style={{ position: "absolute", top: 6, right: isManagerOrAdmin ? 22 : 6, width: 7, height: 7, borderRadius: "50%", backgroundColor: st.dot, boxShadow: `0 0 5px ${st.glow}` }} />
      )}
    </div>
  );
}

// ─── Main Tables page ─────────────────────────────────────────────────────────
export default function Tables() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const [employeeName, setEmployeeName] = useState<string>("");
  const [employeeRole, setEmployeeRole] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string>("");

  // Zoom state
  const [zoom, setZoom] = useState<number>(1);
  const currentZoneIdRef = useRef<string | null>(null);

  const persistZoom = useCallback((z: number) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, parseFloat(z.toFixed(2))));
    setZoom(clamped);
    const zoneId = currentZoneIdRef.current;
    if (zoneId) { try { localStorage.setItem(ZOOM_STORAGE_PREFIX + zoneId, String(clamped)); } catch { /* */ } }
    return clamped;
  }, []);

  const zoomAroundCenter = useCallback((delta: number) => {
    const el = canvasContainerRef.current;
    const newZoom = persistZoom(zoom + delta);
    if (!el) return;
    const { width: cw, height: ch } = el.getBoundingClientRect();
    const oldOffsetX = Math.max(0, (cw - CANVAS_W * zoom) / 2);
    const oldOffsetY = Math.max(0, (ch - CANVAS_H * zoom) / 2);
    const cx = (el.scrollLeft + cw / 2 - oldOffsetX) / zoom;
    const cy = (el.scrollTop  + ch / 2 - oldOffsetY) / zoom;
    const newOffsetX = Math.max(0, (cw - CANVAS_W * newZoom) / 2);
    const newOffsetY = Math.max(0, (ch - CANVAS_H * newZoom) / 2);
    el.scrollLeft = cx * newZoom - cw / 2 + newOffsetX;
    el.scrollTop  = cy * newZoom - ch / 2 + newOffsetY;
  }, [zoom, persistZoom]);

  const handleZoomIn  = () => zoomAroundCenter(+ZOOM_STEP);
  const handleZoomOut = () => zoomAroundCenter(-ZOOM_STEP);

  const handleFit = useCallback(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const { width: cw, height: ch } = el.getBoundingClientRect();
    const fitZoom = Math.min(cw / CANVAS_W, ch / CANVAS_H) * 0.95;
    persistZoom(fitZoom);
    requestAnimationFrame(() => {
      if (!canvasContainerRef.current) return;
      canvasContainerRef.current.scrollLeft = 0;
      canvasContainerRef.current.scrollTop  = 0;
    });
  }, [persistZoom]);

  // Pinch / pan refs
  const pinchRef = useRef<{
    startDist: number; startZoom: number;
    canvasPoint: { x: number; y: number };
    midScreen: { x: number; y: number };
    containerSize: { w: number; h: number };
  } | null>(null);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const panRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number; active: boolean } | null>(null);

  useEffect(() => {
    const elOrNull = canvasContainerRef.current;
    if (!elOrNull) return;
    const el: HTMLDivElement = elOrNull;

    function dist(t: TouchList) { const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx*dx+dy*dy); }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        panRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, active: false };
      } else if (e.touches.length === 2) {
        panRef.current = null;
        const rect = el.getBoundingClientRect();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const relX = midX - rect.left, relY = midY - rect.top;
        const z = zoomRef.current;
        const offsetX = Math.max(0, (rect.width  - CANVAS_W * z) / 2);
        const offsetY = Math.max(0, (rect.height - CANVAS_H * z) / 2);
        pinchRef.current = { startDist: dist(e.touches), startZoom: z, canvasPoint: { x: (el.scrollLeft + relX - offsetX) / z, y: (el.scrollTop + relY - offsetY) / z }, midScreen: { x: relX, y: relY }, containerSize: { w: rect.width, h: rect.height } };
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 1 && panRef.current) {
        const dx = e.touches[0].clientX - panRef.current.startX, dy = e.touches[0].clientY - panRef.current.startY;
        if (!panRef.current.active) { if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) panRef.current.active = true; else return; }
        e.preventDefault();
        el.scrollLeft = panRef.current.scrollLeft - dx;
        el.scrollTop  = panRef.current.scrollTop  - dy;
      } else if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const scale = dist(e.touches) / pinchRef.current.startDist;
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, parseFloat((pinchRef.current.startZoom * scale).toFixed(2))));
        const { canvasPoint, midScreen, containerSize } = pinchRef.current;
        el.scrollLeft = canvasPoint.x * newZoom - midScreen.x + Math.max(0, (containerSize.w - CANVAS_W * newZoom) / 2);
        el.scrollTop  = canvasPoint.y * newZoom - midScreen.y + Math.max(0, (containerSize.h - CANVAS_H * newZoom) / 2);
        persistZoom(newZoom);
      }
    }

    function onTouchEnd() { panRef.current = null; pinchRef.current = null; }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove",  onTouchMove,  { passive: false });
    el.addEventListener("touchend",   onTouchEnd,   { passive: true });
    el.addEventListener("touchcancel",onTouchEnd,   { passive: true });
    return () => { el.removeEventListener("touchstart", onTouchStart); el.removeEventListener("touchmove", onTouchMove); el.removeEventListener("touchend", onTouchEnd); el.removeEventListener("touchcancel", onTouchEnd); };
  }, [persistZoom]);

  useEffect(() => {
    function handleVisibilityChange() { if (document.visibilityState === "hidden") { pinchRef.current = null; panRef.current = null; } }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const empStr = localStorage.getItem("employee");
    if (!token) { setLocation("/"); } else if (empStr) {
      try { const emp = JSON.parse(empStr); setEmployeeName(emp.name); setEmployeeRole(emp.role ?? ""); setEmployeeId(emp.id ?? ""); } catch { /* */ }
    }
  }, [setLocation]);

  const isAdmin = employeeRole === "admin";
  const isManagerOrAdmin = isAdmin || employeeRole === "manager" || employeeRole === "encargado";

  const { data: summary } = useGetDashboardSummary();
  const { data: zones, isLoading: loadingZones } = useGetZones();
  const [activeZone, setActiveZone] = useState<string | null>(null);

  useEffect(() => { if (zones?.length && !activeZone) setActiveZone(zones[0].id); }, [zones, activeZone]);

  const saveScrollForZone = useCallback((zoneId: string) => {
    const el = canvasContainerRef.current;
    if (!el || !zoneId) return;
    try { localStorage.setItem(SCROLL_STORAGE_PREFIX + zoneId, JSON.stringify({ left: el.scrollLeft, top: el.scrollTop })); } catch { /* */ }
  }, []);

  useEffect(() => {
    function handlePageHide() { const zoneId = currentZoneIdRef.current; if (zoneId) saveScrollForZone(zoneId); }
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [saveScrollForZone]);

  const restoreScrollForZone = useCallback((zoneId: string) => {
    const el = canvasContainerRef.current;
    if (!el || !zoneId) return;
    try {
      const raw = localStorage.getItem(SCROLL_STORAGE_PREFIX + zoneId);
      if (raw) { const { left, top } = JSON.parse(raw) as { left: number; top: number }; el.scrollLeft = left; el.scrollTop = top; }
      else { el.scrollLeft = 0; el.scrollTop = 0; }
    } catch { /* */ }
  }, []);

  const [accentPulseKey, setAccentPulseKey] = useState(0);
  const accentInitRef = useRef(false);
  useEffect(() => {
    if (!activeZone) return;
    if (!accentInitRef.current) { accentInitRef.current = true; return; }
    setAccentPulseKey(k => k + 1);
  }, [activeZone]);

  const switchZone = useCallback((zoneId: string) => {
    if (activeZone) saveScrollForZone(activeZone);
    setActiveZone(zoneId);
  }, [activeZone, saveScrollForZone]);

  useEffect(() => {
    if (!activeZone) return;
    currentZoneIdRef.current = activeZone;
    let rafId: number;
    try {
      const raw = localStorage.getItem(ZOOM_STORAGE_PREFIX + activeZone);
      const parsed = raw ? parseFloat(raw) : NaN;
      if (!isNaN(parsed) && parsed >= ZOOM_MIN && parsed <= ZOOM_MAX) {
        setZoom(parsed);
        rafId = requestAnimationFrame(() => restoreScrollForZone(activeZone));
      } else { rafId = requestAnimationFrame(() => handleFit()); }
    } catch { rafId = requestAnimationFrame(() => handleFit()); }
    return () => cancelAnimationFrame(rafId);
  }, [activeZone, restoreScrollForZone, handleFit]);

  const { data: tables, isLoading: loadingTables } = useGetZoneTables(
    activeZone!, undefined,
    { query: { enabled: !!activeZone, queryKey: getGetZoneTablesQueryKey(activeZone!) } }
  );
  const { data: elements } = useGetCanvasElements(
    activeZone!, { layout: 'normal' },
    { query: { enabled: !!activeZone, queryKey: getGetCanvasElementsQueryKey(activeZone!, { layout: 'normal' }) } }
  );

  const handleCanvasScroll = useCallback(() => { const zone = currentZoneIdRef.current; if (zone) saveScrollForZone(zone); }, [saveScrollForZone]);

  const prevLoadingTablesRef = useRef(loadingTables);
  useEffect(() => {
    const wasLoading = prevLoadingTablesRef.current;
    prevLoadingTablesRef.current = loadingTables;
    if (wasLoading && !loadingTables && activeZone) {
      const id = requestAnimationFrame(() => restoreScrollForZone(activeZone));
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [loadingTables, activeZone, restoreScrollForZone]);

  const activeZoneRef = useRef<string | null>(null);
  activeZoneRef.current = activeZone;

  useEffect(() => { pinchRef.current = null; panRef.current = null; }, [activeZone]);

  useEffect(() => {
    const socket = io({ path: "/api/socket.io" });
    socket.on("tables:refresh", () => {
      const zone = activeZoneRef.current;
      if (zone) queryClient.invalidateQueries({ queryKey: getGetZoneTablesQueryKey(zone) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAllTablesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetOccupationSummaryQueryKey() });
    });
    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  const openTable       = useOpenTable();
  const updateZone      = useUpdateZone();
  const cleanTable      = useCleanTable();
  const blockTable      = useBlockTable();
  const transferTable   = useTransferTable();
  const mergeTables     = useMergeTables();
  const separateTable   = useSeparateTable();
  const transferWaiter  = useTransferWaiter();

  // Context menu state
  const [contextMenuTable, setContextMenuTable] = useState<Table | null>(null);
  const { data: allEmployees } = useGetEmployeeLoginList();

  const invalidateZoneTables = () => {
    queryClient.invalidateQueries({ queryKey: getGetZoneTablesQueryKey(activeZone!) });
    queryClient.invalidateQueries({ queryKey: getGetOccupationSummaryQueryKey() });
  };

  const handleTransfer = (targetTableId: string) => {
    const table = contextMenuTable;
    if (!table) return;
    setContextMenuTable(null);
    transferTable.mutate({ tableId: table.id, data: { targetTableId } }, {
      onSuccess: () => { toast.success("Mesa trasladada"); invalidateZoneTables(); },
      onError: (e: any) => toast.error(e?.response?.data?.error ?? "No se pudo trasladar"),
    });
  };

  const handleMerge = (targetTableId: string) => {
    const table = contextMenuTable;
    if (!table) return;
    setContextMenuTable(null);
    mergeTables.mutate({ data: { tableIds: [table.id, targetTableId] } }, {
      onSuccess: () => { toast.success("Mesas unidas"); invalidateZoneTables(); },
      onError: (e: any) => toast.error(e?.response?.data?.error ?? "No se pudo unir"),
    });
  };

  const handleSeparate = () => {
    const table = contextMenuTable;
    if (!table) return;
    setContextMenuTable(null);
    separateTable.mutate({ tableId: table.id }, {
      onSuccess: () => { toast.success("Grupo separado"); invalidateZoneTables(); },
      onError: (e: any) => toast.error(e?.response?.data?.error ?? "No se pudo separar"),
    });
  };

  const handleWaiterTransfer = (newEmployeeId: string) => {
    const table = contextMenuTable;
    if (!table) return;
    setContextMenuTable(null);
    transferWaiter.mutate({ tableId: table.id, data: { newEmployeeId } }, {
      onSuccess: () => { toast.success("Camarero reasignado"); invalidateZoneTables(); },
      onError: (e: any) => toast.error(e?.response?.data?.error ?? "No se pudo reasignar"),
    });
  };

  // Occupation summary (auto-refreshes every 30s)
  const { data: occupation } = useGetOccupationSummary();

  // Alert config (admin/manager only)
  const { data: alertConfig } = useGetAlertConfig({ query: { enabled: isManagerOrAdmin, queryKey: getGetAlertConfigQueryKey() } });
  const thresholds: AlertConfig = alertConfig ?? {
    id: '', reservaProximaMin: 30, sinComandaMin: 15, prefacturaPendienteMin: 10, mesaSuciaMin: 5,
    updatedAt: '',
  };

  // Compute alert level for a table
  const getAlertLevel = useCallback((table: Table): AlertLevel => {
    if (!isManagerOrAdmin) return 'none';
    const mins = elapsedMinutes((table as any).openedAt);
    if (table.status === 'pendiente_limpieza' && mins >= thresholds.mesaSuciaMin) return mins >= thresholds.mesaSuciaMin * 2 ? 'danger' : 'warn';
    if ((table.status === 'prefactura_impresa' || table.status === 'bill_requested') && mins >= thresholds.prefacturaPendienteMin) return 'warn';
    if (table.status === 'occupied' && !(table as any).currentOrderId && mins >= thresholds.sinComandaMin) return 'warn';
    return 'none';
  }, [isManagerOrAdmin, thresholds]);

  // Zone emoji picker
  const [emojiPickerZoneId, setEmojiPickerZoneId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);

  const handleZoneEmojiSelect = (zoneId: string, icon: string | null) => {
    updateZone.mutate(
      { zoneId, data: { icon: icon === null ? null : icon } },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetZonesQueryKey() }); toast.success(icon ? `Icono actualizado` : "Icono eliminado"); },
        onError: () => toast.error("No se pudo actualizar el icono"),
      }
    );
  };

  // Open modal state
  const [openModalTable, setOpenModalTable] = useState<Table | null>(null);

  const doOpenTable = (table: Table, params: { guestCount: number; clientName: string; notes: string; employeeId: string | null; terminalName: string }) => {
    openTable.mutate(
      { tableId: table.id, data: { guestCount: params.guestCount, clientName: params.clientName, notes: params.notes, employeeId: params.employeeId ?? undefined, terminalName: params.terminalName } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getGetZoneTablesQueryKey(activeZone!) });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAllTablesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetOccupationSummaryQueryKey() });
          setLocation(`/pedido/${table.id}/${data.order.id}`);
        },
        onError: () => toast.error("No se pudo abrir la mesa"),
      }
    );
    setOpenModalTable(null);
  };

  const handleTableClick = (table: Table) => {
    if (table.status === "free" || table.status === "reserved") {
      setOpenModalTable(table);
    } else if (table.status === 'bloqueada' || table.status === 'out_of_service') {
      if (isManagerOrAdmin) toast.info("Mesa bloqueada — usa el botón de desbloqueo");
      return;
    } else if (table.status === 'pendiente_limpieza') {
      // Let staff decide what to do — show order for cleanup confirmation or nothing
      return;
    } else {
      setLocation(`/pedido/${table.id}/current`);
    }
  };

  const handleCleanTable = (tableId: string) => {
    cleanTable.mutate({ tableId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetZoneTablesQueryKey(activeZone!) });
        queryClient.invalidateQueries({ queryKey: getGetOccupationSummaryQueryKey() });
        toast.success("Mesa marcada como libre");
      },
      onError: () => toast.error("No se pudo limpiar la mesa"),
    });
  };

  // History drawer state
  const [historyTable, setHistoryTable] = useState<{ id: string; name: string } | null>(null);

  // Legend panel state
  const [showLegend, setShowLegend] = useState(false);

  const handleLogout = () => { localStorage.removeItem("token"); localStorage.removeItem("employee"); setLocation("/"); };

  // Merge group bounding boxes
  const mergeGroups: Record<string, Table[]> = {};
  if (tables) { for (const t of tables) { if (t.mergeGroup) (mergeGroups[t.mergeGroup] = mergeGroups[t.mergeGroup] ?? []).push(t); } }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <style>{`
        @keyframes zone-accent-pulse { 0% { transform: scaleY(1); filter: brightness(1); opacity: 1; } 30% { transform: scaleY(2.6); filter: brightness(1.9); opacity: 1; } 100% { transform: scaleY(1); filter: brightness(1); opacity: 1; } }
        .zone-accent-pulse { animation: zone-accent-pulse 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards; transform-origin: center; }
        @keyframes alert-ring-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        .animate-pulse-ring { animation: alert-ring-pulse 1.8s ease-in-out infinite; }
      `}</style>

      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-card border-b border-border shadow-sm shrink-0 relative z-20">
        <button onClick={() => isAdmin && setLocation("/admin")} className={`flex items-center gap-3 ${isAdmin ? "hover:opacity-80 active:scale-95 transition-all cursor-pointer" : "cursor-default"}`} title={isAdmin ? "Dashboard" : undefined}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">P</div>
          <span className="font-semibold text-lg tracking-tight hidden sm:inline-block">Piccolo</span>
        </button>

        {summary && (
          <div className="flex items-center gap-5 text-sm font-medium bg-background px-4 py-2 rounded-full border border-border">
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Total</span><span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">{summary.totalTables}</span></div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-2"><span className="text-[#c05c4a]">Ocupadas</span><span className="px-2 py-0.5 rounded bg-[#c05c4a]/10 text-[#c05c4a] font-mono">{summary.occupiedTables}</span></div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-2"><span className="text-[#61895f]">Libres</span><span className="px-2 py-0.5 rounded bg-[#61895f]/10 text-[#61895f] font-mono">{summary.freeTables}</span></div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/recogida")} className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 text-sm font-bold uppercase tracking-wider" title="Recogida">
            <Package size={14} /><span className="hidden sm:inline">Recogida</span>
          </button>
          <button onClick={() => setLocation("/reservas")} className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 text-sm font-bold uppercase tracking-wider" title="Reservas">
            <Calendar size={14} /><span className="hidden sm:inline">Reservas</span>
            {occupation && occupation.pendingReservations > 0 && (
              <span className="ml-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-black flex items-center justify-center">{occupation.pendingReservations > 9 ? "9+" : occupation.pendingReservations}</span>
            )}
          </button>
          {isAdmin && (<>
            <button onClick={() => setLocation("/configuracion")} className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 text-sm font-bold uppercase tracking-wider">
              <Settings size={14} /><span className="hidden sm:inline">Config</span>
            </button>
            <button onClick={() => setLocation("/kds/cocina")} className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 text-sm font-bold uppercase tracking-wider">
              <Monitor size={14} /><span className="hidden sm:inline">KDS</span>
            </button>
            <button onClick={() => setLocation("/caja")} className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 transition-colors active:scale-95 text-sm font-bold uppercase tracking-wider">
              <span className="text-base leading-none">🗃</span><span className="hidden sm:inline">Caja</span>
            </button>
          </>)}
          <div className="flex items-center gap-2 text-sm font-medium pl-1">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-secondary-foreground">{employeeName.charAt(0) || "U"}</div>
              {isAdmin && <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-card flex items-center justify-center text-[8px] font-black text-white leading-none">A</span>}
            </div>
            <div className="hidden md:flex flex-col leading-none">
              <span className="font-semibold">{employeeName}</span>
              <span className={`text-[10px] uppercase tracking-widest font-bold mt-0.5 ${isAdmin ? "text-amber-500" : "text-muted-foreground"}`}>{employeeRole || "staff"}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors active:scale-90"><LogOut size={18} strokeWidth={2.5} /></button>
        </div>
      </header>

      {/* Zone tabs + zoom controls */}
      <div className="bg-card border-b border-border shrink-0 px-4 pt-4 pb-0 flex items-end justify-between overflow-x-auto hide-scrollbar">
        <div className="overflow-x-auto hide-scrollbar">
          {loadingZones ? (
            <div className="flex gap-2 pb-4">{[1,2,3].map(i => <div key={i} className="w-24 h-10 rounded-t-xl bg-secondary animate-pulse" />)}</div>
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
                        if (didLongPressRef.current) { didLongPressRef.current = false; return; }
                        if (emojiPickerZoneId) { setEmojiPickerZoneId(null); return; }
                        switchZone(zone.id);
                      }}
                      onPointerDown={() => {
                        if (!isAdmin) return;
                        longPressTimerRef.current = setTimeout(() => { longPressTimerRef.current = null; didLongPressRef.current = true; setEmojiPickerZoneId(zone.id); }, 500);
                      }}
                      onPointerUp={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                      onPointerLeave={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                      onPointerCancel={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                      onContextMenu={e => { if (!isAdmin) return; e.preventDefault(); didLongPressRef.current = false; setEmojiPickerZoneId(prev => prev === zone.id ? null : zone.id); }}
                      style={isActive && zoneColor ? { borderTopColor: zoneColor, color: zoneColor } : undefined}
                      className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-semibold text-sm transition-all whitespace-nowrap ${isActive ? "bg-background border-t-2 border-primary shadow-[0_-4px_10px_rgba(0,0,0,0.05)]" : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"} ${isAdmin ? "select-none" : ""}`}
                    >
                      {zone.icon ? <span className="shrink-0 text-base leading-none">{zone.icon}</span> : zoneColor ? <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zoneColor, boxShadow: isActive ? `0 0 6px ${zoneColor}88` : undefined }} /> : null}
                      {zone.name}
                    </button>
                    {isEmojiOpen && <ZoneEmojiPicker currentIcon={zone.icon} onSelect={icon => handleZoneEmojiSelect(zone.id, icon)} onClose={() => setEmojiPickerZoneId(null)} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Zoom controls + legend toggle */}
        <div className="flex items-center gap-1 mb-2 ml-4 shrink-0">
          <button onClick={() => setShowLegend(v => !v)} className={`h-8 px-2 flex items-center gap-1.5 rounded-lg border transition-colors active:scale-95 text-xs font-bold uppercase tracking-wider mr-1 ${showLegend ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'}`} title="Leyenda de estados">
            <Info size={12} />
          </button>
          <button onClick={handleZoomOut} disabled={zoom <= ZOOM_MIN} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-90 disabled:opacity-30"><ZoomOut size={15} /></button>
          <span className="text-xs font-mono font-bold text-muted-foreground w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} disabled={zoom >= ZOOM_MAX} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-90 disabled:opacity-30"><ZoomIn size={15} /></button>
          <button onClick={handleFit} className="h-8 px-2.5 flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 text-xs font-bold uppercase tracking-wider ml-1">
            <Maximize2 size={12} /><span>Encajar</span>
          </button>
        </div>
      </div>

      {/* Zone color accent */}
      {(() => {
        const activeZoneColor = zones?.find(z => z.id === activeZone)?.color ?? null;
        return (
          <div key={accentPulseKey} className={accentPulseKey > 0 ? "zone-accent-pulse" : undefined}
            style={{ height: 3, minHeight: 3, flexShrink: 0, background: activeZoneColor ?? undefined, borderBottom: activeZoneColor ? undefined : "1px solid var(--border)", transition: "background 0.35s ease, border-color 0.35s ease" }} />
        );
      })()}

      {/* Occupation summary bar */}
      {occupation && (
        <OccupationBar
          freeCount={occupation.freeCount}
          occupiedCount={occupation.occupiedCount}
          reservedCount={occupation.reservedCount}
          currentGuests={occupation.currentGuests}
          pendingReservations={occupation.pendingReservations}
          avgOccupationMinutes={occupation.avgOccupationMinutes}
          pendingCleaningCount={occupation.pendingCleaningCount}
        />
      )}

      {/* Floor plan canvas */}
      <main ref={canvasContainerRef} onScroll={handleCanvasScroll} className="flex-1 overflow-auto bg-[#0c0c0c] relative">
        {loadingTables ? (
          <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : !tables?.length ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4"><span className="font-bold text-2xl">!</span></div>
            <p className="text-lg font-semibold">Sin mesas configuradas</p>
            {isAdmin && <button onClick={() => setLocation("/configuracion")} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:opacity-90 active:scale-95 transition-all">Ir a Configuración →</button>}
          </div>
        ) : (
          <div style={{ minWidth: '100%', minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom, position: "relative", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 0, left: 0, width: CANVAS_W, height: CANVAS_H, transform: `scale(${zoom})`, transformOrigin: "top left", backgroundImage: GRID_BG, backgroundSize: "40px 40px" }}>
                {/* Merge group overlays */}
                <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                  {Object.values(mergeGroups).filter(g => g.length >= 2).map((grp, gi) => {
                    const minX = Math.min(...grp.map(t => t.x)) - 6, minY = Math.min(...grp.map(t => t.y)) - 6;
                    const maxX = Math.max(...grp.map(t => t.x + t.width)) + 6, maxY = Math.max(...grp.map(t => t.y + t.height)) + 6;
                    return <rect key={gi} x={minX} y={minY} width={maxX - minX} height={maxY - minY} rx="12" ry="12" fill="rgba(192,132,252,0.06)" stroke="rgba(192,132,252,0.3)" strokeWidth="1.5" strokeDasharray="6 4" />;
                  })}
                </svg>
                {elements?.map(el => <ElementShape key={el.id} el={el} />)}
                {tables.map(table => (
                  <TableCard
                    key={table.id}
                    table={table}
                    onClick={() => handleTableClick(table)}
                    onHistory={isManagerOrAdmin ? () => setHistoryTable({ id: table.id, name: table.name }) : undefined}
                    onClean={isManagerOrAdmin && table.status === 'pendiente_limpieza' ? () => handleCleanTable(table.id) : undefined}
                    onLongPress={() => setContextMenuTable(table)}
                    isBusy={openTable.isPending && openTable.variables?.tableId === table.id}
                    alertLevel={getAlertLevel(table)}
                    isManagerOrAdmin={isManagerOrAdmin}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Legend panel (inside canvas area, bottom-right) */}
        {showLegend && <StatusLegend onClose={() => setShowLegend(false)} />}
      </main>

      {/* Open table modal */}
      {openModalTable && (
        <OpenTableModal
          table={openModalTable}
          onConfirm={params => doOpenTable(openModalTable, params)}
          onCancel={() => setOpenModalTable(null)}
          isPending={openTable.isPending}
          currentEmployeeId={employeeId}
        />
      )}

      {/* History drawer */}
      {historyTable && <TableHistoryDrawer tableId={historyTable.id} tableName={historyTable.name} onClose={() => setHistoryTable(null)} />}

      {/* Table context menu (long-press on any table) */}
      {contextMenuTable && (
        <TableContextMenu
          table={contextMenuTable}
          freeTables={(tables ?? []).filter(t => t.status === 'free')}
          employees={(allEmployees ?? []).map(e => ({ id: e.id, name: e.name }))}
          isManagerOrAdmin={isManagerOrAdmin}
          onClose={() => setContextMenuTable(null)}
          onTransfer={handleTransfer}
          onMerge={handleMerge}
          onSeparate={handleSeparate}
          onWaiterTransfer={handleWaiterTransfer}
          isPending={transferTable.isPending || mergeTables.isPending || separateTable.isPending || transferWaiter.isPending}
        />
      )}
    </div>
  );
}
