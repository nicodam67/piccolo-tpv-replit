import React, { useEffect, useState, useRef } from 'react';
import { api } from '../lib/api-client';
import { useParams, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { connectAuthenticatedSocket } from '../lib/socket-client';
import { toast } from 'sonner';
import { History, RefreshCw, AlertTriangle, X, Clock, CheckCircle, ShieldCheck, Search, Flame } from 'lucide-react';
import {
  useGetKdsTasks,
  useMarkOrderPase,
  getGetKdsTasksQueryKey,
  type KitchenTask,
} from '@workspace/api-client-react';
import {
  useUpdateKitchenTaskStatus,
  useResendKitchenTask,
  useGetKdsHistory,
  getGetKdsHistoryQueryKey,
} from '@workspace/api-client-react/phase1';

// ─── Constants ────────────────────────────────────────────────────────────────

const ZONES = ['cocina', 'pizza', 'ensalada', 'barra', 'pase'] as const;
type KdsZone = typeof ZONES[number];
type TaskStatus = 'new' | 'preparing' | 'in_oven' | 'ready' | 'collected' | 'served' | 'cancelled';
type PaseAction = 'collected' | 'served';

const ZONE_LABELS: Record<string, string> = {
  cocina: 'Cocina', pizza: 'Pizza', ensalada: 'Ensaladas', barra: 'Barra', pase: 'Expedición',
};

const CANCELLED_VISIBLE_MS = 5 * 60 * 1000;
/** Amber warning: elapsed > 10 min */
const DELAY_WARNING_MS  = 10 * 60 * 1000;
/** Red critical: elapsed > 20 min */
const DELAY_CRITICAL_MS = 20 * 60 * 1000;
/** Pase overdue highlight: > 25 min */
const PASE_OVERDUE_MS   = 25 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getElapsedMs(isoDate: string) {
  return Date.now() - new Date(isoDate).getTime();
}

type DelayLevel = 'normal' | 'warning' | 'critical';
function delayLevel(isoDate: string): DelayLevel {
  const ms = getElapsedMs(isoDate);
  if (ms >= DELAY_CRITICAL_MS) return 'critical';
  if (ms >= DELAY_WARNING_MS)  return 'warning';
  return 'normal';
}

function LiveTime({ startTime, showDelay = false }: { startTime: string; showDelay?: boolean }) {
  const [elapsed, setElapsed] = useState('');
  const [level, setLevel] = useState<DelayLevel>('normal');

  useEffect(() => {
    const update = () => {
      const ms = getElapsedMs(startTime);
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      setElapsed(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      if (showDelay) setLevel(delayLevel(startTime));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime, showDelay]);

  const color = showDelay
    ? level === 'critical' ? 'text-red-400' : level === 'warning' ? 'text-amber-400' : 'text-foreground/70'
    : undefined;

  return (
    <span className={`font-mono tabular-nums flex items-center gap-1 ${color ?? ''}`}>
      {showDelay && level === 'critical' && <AlertTriangle size={12} className="shrink-0 animate-pulse" />}
      {showDelay && level === 'warning'  && <AlertTriangle size={12} className="shrink-0" />}
      {elapsed}
    </span>
  );
}

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{time.toLocaleTimeString('es-ES', { hour12: false })}</>;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ─── Per-zone action buttons ──────────────────────────────────────────────────

function ZoneActions({
  task,
  onUpdateStatus,
  onResend,
}: {
  task: KitchenTask;
  onUpdateStatus: (id: string, status: string) => void;
  onResend: (id: string) => void;
}) {
  const zone = task.prepZone;
  const status = task.status as TaskStatus;
  const isCancelled = status === 'cancelled';

  const btn = (label: string, toStatus: string, color: string) => (
    <button
      key={toStatus}
      onClick={() => onUpdateStatus(task.id, toStatus)}
      className={`w-full py-4 font-black text-lg uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md ${color}`}
    >
      {label}
    </button>
  );

  if (isCancelled) return null;

  // ── PIZZA ──────────────────────────────────────────────────────────────────
  if (zone === 'pizza') {
    if (status === 'new')       return <>{btn('Preparar', 'preparing', 'bg-[#f59e0b] hover:bg-[#d97706] text-[#451a03]')}</>;
    if (status === 'preparing') return <>{btn('Poner en horno', 'in_oven', 'bg-[#ef4444] hover:bg-[#dc2626] text-white')}</>;
    if (status === 'in_oven')   return <>{btn('Sacar del horno', 'ready', 'bg-[#f97316] hover:bg-[#ea580c] text-white')}</>;
    if (status === 'ready')     return (
      <div className="w-full py-4 bg-[#22c55e]/10 text-[#22c55e] border-2 border-[#22c55e]/30 font-black text-lg uppercase tracking-wider rounded-xl flex items-center justify-center">
        Esperando Pase
      </div>
    );
    return null;
  }

  // ── BARRA ──────────────────────────────────────────────────────────────────
  if (zone === 'barra') {
    if (status === 'new')       return <>{btn('Preparando', 'preparing', 'bg-[#f59e0b] hover:bg-[#d97706] text-[#451a03]')}</>;
    if (status === 'preparing') return <>{btn('Listo', 'ready', 'bg-[#3b82f6] hover:bg-[#2563eb] text-[#1e3a8a]')}</>;
    if (status === 'ready')     return <>{btn('Entregado', 'collected', 'bg-[#22c55e] hover:bg-[#16a34a] text-[#14532d]')}</>;
    return null;
  }

  // ── COCINA / ENSALADA / SIN_PARTIDA ────────────────────────────────────────
  if (status === 'new')       return <>{btn('Preparar', 'preparing', 'bg-[#f59e0b] hover:bg-[#d97706] text-[#451a03]')}</>;
  if (status === 'preparing') return <>{btn('Listo', 'ready', 'bg-[#3b82f6] hover:bg-[#2563eb] text-[#1e3a8a]')}</>;
  if (status === 'ready')     return (
    <div className="w-full py-4 bg-[#22c55e]/10 text-[#22c55e] border-2 border-[#22c55e]/30 font-black text-lg uppercase tracking-wider rounded-xl flex items-center justify-center">
      Esperando Pase
    </div>
  );
  return null;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function KdsPage() {
  const params = useParams();
  const rawZone = params.zone || 'cocina';
  const zone: KdsZone = (ZONES as readonly string[]).includes(rawZone) ? (rawZone as KdsZone) : 'cocina';
  const queryClient = useQueryClient();
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reconnectBanner, setReconnectBanner] = useState<string | null>(null);
  const reconnectBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConnectedRef = useRef(false);
  const prevTaskIdsRef = useRef<Set<string>>(new Set());
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  const { data: rawTasks, isLoading } = useGetKdsTasks(zone as any, {
    query: {
      refetchInterval: 10000,
      queryKey: getGetKdsTasksQueryKey(zone as any),
    },
  });

  const now = Date.now();
  const tasks = rawTasks?.filter((t: KitchenTask) => {
    if (t.status === 'collected' || t.status === 'served') return false;
    if (t.status === 'cancelled') {
      const age = t.cancelledAt ? now - new Date(t.cancelledAt).getTime() : 0;
      return age < CANCELLED_VISIBLE_MS;
    }
    return true;
  });

  useEffect(() => {
    if (!tasks) return;
    const currentIds = new Set(tasks.map((t: KitchenTask) => t.id));
    const prev = prevTaskIdsRef.current;
    prevTaskIdsRef.current = currentIds;
    if (prev.size === 0) return;
    const newIds: string[] = [];
    currentIds.forEach(id => { if (!prev.has(id)) newIds.push(id); });
    if (newIds.length === 0) return;
    setFlashingIds(curr => { const next = new Set(curr); newIds.forEach(id => next.add(id)); return next; });
    const timer = setTimeout(() => {
      setFlashingIds(curr => { const next = new Set(curr); newIds.forEach(id => next.delete(id)); return next; });
    }, 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  useEffect(() => {
    const socket = connectAuthenticatedSocket();
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey(zone as any) });
      queryClient.invalidateQueries({ queryKey: getGetKdsHistoryQueryKey() });
    };
    const handleKdsRefresh = (payload?: { employeeName?: string | null }) => {
      invalidate();
      const name = payload?.employeeName;
      if (name) {
        setUpdatedBy(name);
        if (clearTimerRef.current !== null) clearTimeout(clearTimerRef.current);
        clearTimerRef.current = setTimeout(() => setUpdatedBy(null), 4000);
      }
    };
    socket.on('connect', () => {
      invalidate();
      if (hasConnectedRef.current) {
        if (reconnectBannerTimerRef.current) clearTimeout(reconnectBannerTimerRef.current);
        const cachedCount = queryClient.getQueryData<{ length?: number }>(getGetKdsTasksQueryKey(zone as any));
        const count = Array.isArray(cachedCount) ? cachedCount.length : 0;
        setReconnectBanner(`Reconectado — mostrando ${count} tarea${count !== 1 ? 's' : ''} pendiente${count !== 1 ? 's' : ''}`);
        reconnectBannerTimerRef.current = setTimeout(() => setReconnectBanner(null), 5000);
      } else { hasConnectedRef.current = true; }
    });
    socket.on('kds:refresh', handleKdsRefresh);

    const HEARTBEAT_INTERVAL = 60_000;
    const HEARTBEAT_TIMEOUT  =  5_000;
    let pongTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const sendHeartbeat = () => {
      if (!socket.connected) return;
      pongTimeoutId = setTimeout(() => { socket.disconnect(); socket.connect(); invalidate(); }, HEARTBEAT_TIMEOUT);
      socket.emit('ping');
    };
    const handlePong = () => { if (pongTimeoutId !== null) { clearTimeout(pongTimeoutId); pongTimeoutId = null; } };
    socket.on('pong', handlePong);
    const heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    const handleVisibilityResume = () => {
      if (!document.hidden) { if (socket.connected) { invalidate(); } else { socket.connect(); } }
    };
    document.addEventListener('visibilitychange', handleVisibilityResume);

    return () => {
      if (clearTimerRef.current !== null) clearTimeout(clearTimerRef.current);
      if (reconnectBannerTimerRef.current !== null) clearTimeout(reconnectBannerTimerRef.current);
      clearInterval(heartbeatInterval);
      if (pongTimeoutId !== null) clearTimeout(pongTimeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityResume);
      socket.disconnect();
    };
  }, [zone, queryClient]);

  const updateStatus = useUpdateKitchenTaskStatus();
  const markPase    = useMarkOrderPase();
  const resend      = useResendKitchenTask();

  const handleUpdateStatus = (taskId: string, status: TaskStatus) => {
    updateStatus.mutate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { taskId, data: { status: status as any } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey(zone as any) }),
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? 'Error al cambiar estado';
          toast.error(msg);
        },
      },
    );
  };

  const handlePaseAction = (orderId: string, action: PaseAction) => {
    markPase.mutate(
      { orderId, data: { action } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey(zone as any) }) },
    );
  };

  const handleResend = (taskId: string) => {
    resend.mutate(
      { taskId },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey(zone as any) }) },
    );
  };

  const isPase = zone === 'pase';

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col text-foreground overflow-hidden">
      <header className="border-b-2 border-border bg-card shrink-0 shadow-sm z-10">
        <div className="h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <h1 className="text-3xl font-black uppercase tracking-widest text-primary drop-shadow-sm">
              {ZONE_LABELS[zone] ?? zone}
            </h1>
            <div className="w-1 h-8 bg-border rounded-full hidden sm:block" />
            <nav className="hidden sm:flex gap-2">
              {ZONES.map(z => (
                <Link key={z} href={`/kds/${z}`}
                  className={`px-4 py-2 rounded-lg text-sm font-black uppercase tracking-wider transition-all ${
                    zone === z
                      ? 'bg-primary text-primary-foreground shadow-md scale-105'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                  }`}>
                  {ZONE_LABELS[z]}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {updatedBy && (
              <div className="flex items-center gap-2 bg-primary/15 border border-primary/30 text-primary px-3 py-1.5 rounded-lg animate-pulse">
                <span className="text-xs font-black uppercase tracking-widest">Actualizado por</span>
                <span className="text-sm font-black">{updatedBy}</span>
              </div>
            )}
            <button onClick={() => setShowHistory(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-bold text-sm transition-all ${
                showHistory ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:text-foreground'
              }`}>
              <History size={16} /><span className="hidden sm:inline">Historial</span>
            </button>
            <div className="text-2xl font-mono font-black text-muted-foreground flex items-center gap-2 tracking-wider bg-background px-4 py-1.5 rounded-xl border border-border shadow-inner">
              <LiveClock />
            </div>
          </div>
        </div>
      </header>

      {reconnectBanner && (
        <div className="bg-emerald-700/90 text-white text-sm font-bold text-center py-2 px-4 shrink-0 flex items-center justify-center gap-2 animate-pulse">
          <CheckCircle size={16} className="shrink-0" />{reconnectBanner}
        </div>
      )}

      <nav className="sm:hidden flex gap-1 p-2 bg-card border-b border-border overflow-x-auto hide-scrollbar shrink-0">
        {ZONES.map(z => (
          <Link key={z} href={`/kds/${z}`}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${
              zone === z ? 'bg-primary text-primary-foreground shadow-md' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
            }`}>
            {ZONE_LABELS[z]}
          </Link>
        ))}
      </nav>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#1a0e0c]">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground opacity-60">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-xl uppercase tracking-widest font-bold">Cargando comandas...</span>
              </div>
            </div>
          ) : !tasks || tasks.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-3xl md:text-5xl font-black text-muted-foreground opacity-20 uppercase tracking-[0.2em] border-4 border-dashed border-muted-foreground p-12 rounded-3xl">
                Zona Libre
              </div>
            </div>
          ) : isPase ? (
            <PaseView tasks={tasks} onAction={handlePaseAction} />
          ) : (
            <ZoneTasksView tasks={tasks} onUpdateStatus={handleUpdateStatus} onResend={handleResend} flashingIds={flashingIds} />
          )}
        </main>

        {showHistory && (
          <aside className="w-80 xl:w-96 shrink-0 border-l-2 border-border bg-card flex flex-col overflow-hidden">
            <HistoryPanel onClose={() => setShowHistory(false)} />
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── Zone tasks view ──────────────────────────────────────────────────────────

function ZoneTasksView({
  tasks, onUpdateStatus, onResend, flashingIds,
}: {
  tasks: KitchenTask[];
  onUpdateStatus: (id: string, status: string) => void;
  onResend: (id: string) => void;
  flashingIds: Set<string>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 items-start">
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} onUpdateStatus={onUpdateStatus} onResend={onResend} isFlashing={flashingIds.has(task.id)} />
      ))}
    </div>
  );
}


function TaskCard({
  task, onUpdateStatus, onResend, isFlashing = false,
}: {
  task: KitchenTask;
  onUpdateStatus: (id: string, status: string) => void;
  onResend: (id: string) => void;
  isFlashing?: boolean;
}) {
  const status = task.status as TaskStatus;
  const isNew       = status === 'new';
  const isPrep      = status === 'preparing';
  const isInOven    = status === 'in_oven';
  const isReady     = status === 'ready';
  const isCancelled = status === 'cancelled';

  const [allergyConfirmed, setAllergyConfirmed] = useState(false);
  const [showAllergyConfirm, setShowAllergyConfirm] = useState(false);
  const [confirmNote, setConfirmNote] = useState('');
  const [crossRisk, setCrossRisk] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleAllergyConfirm = async () => {
    setConfirming(true);
    try {
      await api.post(`/api/kitchen-tasks/${task.id}/allergy-confirm`, { notes: confirmNote, hasCrossContaminationRisk: crossRisk });
      setAllergyConfirmed(true);
      setShowAllergyConfirm(false);
      toast.success('Preparación especial confirmada');
    } catch { toast.error('Error al confirmar'); }
    finally { setConfirming(false); }
  };

  const [currentDelay, setCurrentDelay] = useState<'normal' | 'warning' | 'critical'>('normal');
  useEffect(() => {
    if (isCancelled) return;
    const check = () => setCurrentDelay(delayLevel(task.createdAt));
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, [task.createdAt, isCancelled]);

  const delayBorder = !isCancelled && currentDelay === 'critical'
    ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-background animate-pulse'
    : !isCancelled && currentDelay === 'warning'
    ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-background'
    : '';

  let borderClass = 'border-border';
  if (isCancelled)  borderClass = 'border-red-600 opacity-75';
  else if (isNew)   borderClass = 'border-[#f59e0b] shadow-[0_4px_20px_rgba(245,158,11,0.15)]';
  else if (isPrep)  borderClass = 'border-[#3b82f6] shadow-[0_4px_20px_rgba(59,130,246,0.15)]';
  else if (isInOven) borderClass = 'border-[#ef4444] shadow-[0_4px_20px_rgba(239,68,68,0.2)]';
  else if (isReady) borderClass = 'border-[#22c55e] shadow-[0_4px_20px_rgba(34,197,94,0.2)] scale-[0.98] opacity-90';

  const headerBg = isCancelled
    ? 'bg-red-950/50 border-red-700/40'
    : isNew     ? 'bg-[#f59e0b]/10 border-[#f59e0b]/30'
    : isPrep    ? 'bg-[#3b82f6]/10 border-[#3b82f6]/30'
    : isInOven  ? 'bg-[#ef4444]/15 border-[#ef4444]/30'
    : 'bg-[#22c55e]/10 border-[#22c55e]/30';

  const timerColor = isCancelled
    ? 'text-red-400'
    : isNew     ? 'text-[#f59e0b]'
    : isPrep    ? 'text-[#3b82f6]'
    : isInOven  ? 'text-[#ef4444]'
    : 'text-[#22c55e]';

  const qtyBg = isCancelled
    ? 'bg-red-900/30 text-red-400'
    : isNew     ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
    : isPrep    ? 'bg-[#3b82f6]/20 text-[#3b82f6]'
    : isInOven  ? 'bg-[#ef4444]/20 text-[#ef4444]'
    : 'bg-[#22c55e]/20 text-[#22c55e]';

  return (
    <div className={`relative flex flex-col bg-card border-2 rounded-2xl overflow-hidden shadow-xl transition-all ${borderClass} ${delayBorder}${isFlashing ? ' kds-flash-in' : ''}`}>
      <div className={`flex flex-col border-b-2 ${headerBg}`}>
        <div className="p-4 flex justify-between items-start">
          <div>
            <div className="text-3xl font-black leading-none text-foreground">{task.tableName}</div>
            <div className="text-xs font-bold text-muted-foreground mt-2 uppercase tracking-widest">{task.employeeName}</div>
            <div className="text-xs text-muted-foreground/60 mt-0.5">{formatTime(task.createdAt)}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className={`text-xl font-mono font-black bg-background/80 px-2 py-1 rounded-lg border border-border/50 shadow-inner ${timerColor}`}>
              <LiveTime startTime={task.createdAt} showDelay={!isCancelled} />
            </div>
            {/* In-oven badge */}
            {isInOven && (
              <span className="flex items-center gap-1 text-[10px] font-black text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/30 px-2 py-0.5 rounded-full animate-pulse">
                <Flame size={9} /> EN HORNO
              </span>
            )}
          </div>
        </div>

        {task.hasAllergy && (
          <div className="border-t border-red-500/30">
            {allergyConfirmed ? (
              <div className="bg-green-800/80 text-green-300 font-black uppercase tracking-widest text-center py-2 flex items-center justify-center gap-2">
                <ShieldCheck size={14} /> Prep. especial confirmada
              </div>
            ) : (
              <>
                <div className="animate-pulse bg-red-600 text-white font-black uppercase tracking-widest text-center py-2 flex items-center justify-center gap-2">
                  <AlertTriangle size={14} /> ALERGIA
                </div>
                {task.allergyNote && (
                  <div className="bg-red-600/20 text-red-300 text-sm px-3 py-1.5 text-center font-bold">{task.allergyNote}</div>
                )}
                {!isCancelled && (
                  <button onClick={() => setShowAllergyConfirm(true)}
                    className="w-full py-2 bg-red-900/60 text-red-200 font-bold text-xs uppercase tracking-wider hover:bg-red-900/80 transition-colors flex items-center justify-center gap-1">
                    <CheckCircle size={12} /> Confirmar preparación especial
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {showAllergyConfirm && (
        <div className="absolute inset-0 z-20 bg-card/95 backdrop-blur-sm flex flex-col p-4 gap-3">
          <div className="flex items-center justify-between">
            <span className="font-black text-sm text-red-400 flex items-center gap-1"><AlertTriangle size={14} /> Confirmar alergia</span>
            <button onClick={() => setShowAllergyConfirm(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary"><X size={13} /></button>
          </div>
          <p className="text-xs text-muted-foreground">{task.allergyNote ?? 'Preparación especial requerida'}</p>
          <textarea autoFocus className="w-full px-2 py-1.5 rounded-lg bg-secondary border border-border text-xs focus:outline-none resize-none"
            rows={2} placeholder="Nota (ej: utensilios limpios, zona aislada…)"
            value={confirmNote} onChange={e => setConfirmNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAllergyConfirm(); } if (e.key === 'Escape') setShowAllergyConfirm(false); }}
          />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={crossRisk} onChange={e => setCrossRisk(e.target.checked)} className="rounded" />
            <span className="text-orange-400 font-bold">⚠ Riesgo de contaminación cruzada</span>
          </label>
          <button onClick={handleAllergyConfirm} disabled={confirming}
            className="w-full py-2 rounded-lg bg-green-600 text-white text-sm font-black disabled:opacity-60">
            {confirming ? 'Confirmando…' : '✓ Confirmar preparación'}
          </button>
        </div>
      )}

      {isCancelled && (
        <div className="bg-red-700 text-white font-black uppercase tracking-[0.2em] text-center py-2.5 text-sm">
          ✕ ANULADO
        </div>
      )}

      <div className={`p-5 flex-1 flex flex-col gap-3 ${isReady && !isCancelled ? 'bg-[#22c55e]/5' : ''}`}>
        <div className="flex items-start gap-4">
          <div className={`font-black text-3xl h-14 w-14 flex items-center justify-center rounded-xl shrink-0 shadow-inner ${qtyBg} ${isCancelled ? 'line-through' : ''}`}>
            {task.quantity}
          </div>
          <div className={`text-xl font-bold leading-snug flex-1 ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>
            {task.productName}
          </div>
        </div>
        {task.notes && (
          <div className="bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm font-semibold text-foreground/90 leading-snug">
            {task.notes}
          </div>
        )}
      </div>

      <div className="p-3 bg-background border-t-2 border-border/50 flex flex-col gap-2">
        <ZoneActions task={task} onUpdateStatus={onUpdateStatus} onResend={onResend} />
        <button onClick={() => onResend(task.id)}
          className="w-full py-2.5 flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground font-bold text-sm uppercase tracking-wider rounded-xl transition-all active:scale-95 border border-border">
          <RefreshCw size={14} /> Reenviar
        </button>
      </div>
    </div>
  );
}

// ─── Pase view ────────────────────────────────────────────────────────────────

const ZONE_DOT_COLORS: Record<string, string> = {
  new:       'bg-amber-400',
  preparing: 'bg-blue-400 animate-pulse',
  in_oven:   'bg-red-400 animate-pulse',
  ready:     'bg-green-400',
  cancelled: 'bg-red-600 opacity-40',
};

const ZONE_LABELS_PASE: Record<string, string> = {
  cocina: 'Cocina', pizza: 'Pizza', ensalada: 'Ensaladas', barra: 'Barra', sin_partida: 'Libre',
};

function PaseView({ tasks, onAction }: { tasks: KitchenTask[]; onAction: (orderId: string, action: string) => void }) {
  const [reclamacion, setReclamacion] = useState<string | null>(null);

  // Group tasks by orderId
  const ordersMap = new Map<string, KitchenTask[]>();
  tasks.forEach(t => {
    if (!ordersMap.has(t.orderId)) ordersMap.set(t.orderId, []);
    ordersMap.get(t.orderId)!.push(t);
  });

  const orders = Array.from(ordersMap.entries()).map(([orderId, items]) => {
    const activeItems = items.filter(i => i.status !== 'cancelled');
    const readyItems  = activeItems.filter(i => i.status === 'ready');
    const isAllReady  = activeItems.length > 0 && readyItems.length === activeItems.length;
    const isSomeReady = readyItems.length > 0 && !isAllReady;
    const earliest    = items.reduce((a, b) => new Date(a.createdAt) < new Date(b.createdAt) ? a : b);
    const isOverdue   = Date.now() - new Date(earliest.createdAt).getTime() > PASE_OVERDUE_MS;

    // Group by zone within this order
    const zoneGroups = new Map<string, KitchenTask[]>();
    activeItems.forEach(i => {
      const z = i.prepZone || 'sin_partida';
      if (!zoneGroups.has(z)) zoneGroups.set(z, []);
      zoneGroups.get(z)!.push(i);
    });

    return {
      orderId, items, activeItems, readyItems, isAllReady, isSomeReady, isOverdue,
      tableName: items[0].tableName ?? (items[0] as any).clientName ?? 'Takeaway',
      employeeName: items[0].employeeName,
      createdAt: earliest.createdAt,
      zoneGroups,
    };
  });

  orders.sort((a, b) => {
    if (a.isAllReady !== b.isAllReady) return a.isAllReady ? -1 : 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const RECLAMACION_OPTIONS = ['Reposición', 'Reclamación', 'Entrega parcial aprobada', 'Cliente espera'];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
      {orders.map(order => (
        <div key={order.orderId}
          className={`flex flex-col bg-card border-2 rounded-2xl shadow-xl overflow-hidden transition-all ${
            order.isOverdue   ? 'border-red-600 shadow-[0_0_25px_rgba(220,38,38,0.2)]' :
            order.isAllReady  ? 'border-[#22c55e] shadow-[0_0_30px_rgba(34,197,94,0.15)] scale-[1.02] z-10' :
            order.isSomeReady ? 'border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.1)]' :
                                'border-border'
          }`}
        >
          {/* Header */}
          <div className={`p-5 border-b-2 flex justify-between items-start ${
            order.isOverdue   ? 'bg-red-950/30 border-red-700/40' :
            order.isAllReady  ? 'bg-[#22c55e]/20 border-[#22c55e]/40' :
            order.isSomeReady ? 'bg-amber-900/20 border-amber-700/30' :
                                'bg-secondary/40 border-border/50'
          }`}>
            <div>
              <div className="text-4xl font-black text-foreground leading-none">{order.tableName}</div>
              <div className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-2">{order.employeeName}</div>
              <div className="text-xs text-muted-foreground/60 mt-1">{formatTime(order.createdAt)}</div>
            </div>
            <div className="text-right flex flex-col items-end gap-2">
              <div className={`text-2xl font-mono font-black px-3 py-1 rounded-lg bg-background/80 shadow-inner border border-border/50 ${
                order.isOverdue ? 'text-red-400' : order.isAllReady ? 'text-[#22c55e]' : 'text-primary'
              }`}>
                <LiveTime startTime={order.createdAt} showDelay />
              </div>
              <div className={`text-sm font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                order.isOverdue   ? 'bg-red-600 text-white' :
                order.isAllReady  ? 'bg-[#22c55e] text-[#14532d]' :
                                    'bg-secondary text-muted-foreground'
              }`}>
                {order.isOverdue ? '⚠ Tarde' : `${order.readyItems.length} / ${order.activeItems.length}`}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-background border-y border-border/30">
            <div className={`h-full transition-all duration-500 ${order.isAllReady ? 'bg-[#22c55e]' : order.isOverdue ? 'bg-red-500' : 'bg-primary'}`}
              style={{ width: `${order.activeItems.length > 0 ? (order.readyItems.length / order.activeItems.length) * 100 : 0}%` }} />
          </div>

          {/* Items by zone */}
          <div className="p-4 flex-1 space-y-3 bg-card/50">
            {Array.from(order.zoneGroups.entries()).map(([zone, zItems]) => {
              const zoneReady   = zItems.every(i => i.status === 'ready');
              const zonePreparing = zItems.some(i => ['preparing', 'in_oven'].includes(i.status));
              const zoneStatus  = zoneReady ? 'ready' : zonePreparing ? 'preparing' : 'new';
              return (
                <div key={zone} className="space-y-1.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ZONE_DOT_COLORS[zoneStatus]}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {ZONE_LABELS_PASE[zone] ?? zone}
                    </span>
                    {zoneReady && <span className="text-[9px] text-green-400 font-black ml-auto">LISTO</span>}
                  </div>
                  {zItems.map(item => (
                    <div key={item.id} className={`flex items-center bg-background p-2.5 rounded-xl border transition-colors gap-2 ${
                      item.status === 'ready' ? 'border-[#22c55e]/30' : item.status === 'in_oven' ? 'border-red-500/30' : 'border-border'
                    }`}>
                      <span className="font-black text-muted-foreground w-5 text-center shrink-0 text-sm">{item.quantity}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-bold truncate ${item.status === 'ready' ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {item.productName}
                          </span>
                          {item.hasAllergy && (
                            <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-1 rounded font-black shrink-0">ALG</span>
                          )}
                        </div>
                        {item.notes && <span className="text-[10px] text-muted-foreground/70">{item.notes}</span>}
                      </div>
                      <span className="shrink-0">
                        {item.status === 'ready'     && <span className="text-[#22c55e] font-black text-lg">✓</span>}
                        {item.status === 'preparing' && <span className="text-[#3b82f6] font-black text-lg animate-pulse">↻</span>}
                        {item.status === 'in_oven'   && <Flame size={14} className="text-[#ef4444] animate-pulse" />}
                        {item.status === 'new'       && <span className="text-[#f59e0b] font-black text-lg">!</span>}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {order.isAllReady && (
            <div className="bg-[#22c55e] text-[#14532d] text-center font-black py-2.5 uppercase tracking-[0.3em] text-sm shadow-inner">
              Mesa Completa
            </div>
          )}

          {/* Actions */}
          <div className="p-4 bg-background border-t-2 border-border/50 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {order.isAllReady ? (
                <button onClick={() => onAction(order.orderId, 'collected')}
                  className="col-span-2 py-4 bg-[#22c55e] hover:bg-[#16a34a] text-[#14532d] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-[0_4px_15px_rgba(34,197,94,0.3)]">
                  Recoger todo
                </button>
              ) : order.isSomeReady ? (
                <>
                  <button onClick={() => onAction(order.orderId, 'served')}
                    className="py-3 bg-amber-700/80 hover:bg-amber-700 text-amber-100 font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 text-sm">
                    Entrega parcial
                  </button>
                  <button onClick={() => onAction(order.orderId, 'collected')}
                    className="py-3 bg-secondary hover:bg-secondary/80 text-foreground font-black uppercase tracking-wider rounded-xl border border-border transition-all active:scale-95 text-sm">
                    Recoger listo
                  </button>
                </>
              ) : (
                <button onClick={() => onAction(order.orderId, 'served')}
                  className="col-span-2 py-4 bg-secondary hover:bg-secondary/80 text-foreground font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 border-2 border-border">
                  Entregar
                </button>
              )}
            </div>
            {/* Reclamación / Reposición */}
            <div className="relative">
              <button onClick={() => setReclamacion(reclamacion === order.orderId ? null : order.orderId)}
                className="w-full py-2 text-xs font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl hover:bg-secondary transition-colors flex items-center justify-center gap-1">
                ↓ Incidencia
              </button>
              {reclamacion === order.orderId && (
                <div className="absolute bottom-full mb-1 w-full bg-card border border-border rounded-xl shadow-lg z-20 overflow-hidden">
                  {RECLAMACION_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => { toast.info(`${opt}: ${order.tableName}`); setReclamacion(null); }}
                      className="w-full px-4 py-2.5 text-sm text-left hover:bg-secondary font-semibold border-b border-border/50 last:border-0 transition-colors">
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── History side panel ───────────────────────────────────────────────────────

function HistoryPanel({ onClose }: { onClose: () => void }) {
  const { data: history, isLoading } = useGetKdsHistory({
    query: { refetchInterval: 15000, queryKey: getGetKdsHistoryQueryKey() },
  });
  const [histSearch, setHistSearch] = useState('');

  const statusLabel: Record<string, string> = {
    collected: 'Recogido', served: 'Entregado', cancelled: 'Anulado',
  };
  const statusColor: Record<string, string> = {
    collected: 'text-green-400 bg-green-500/10 border-green-500/20',
    served:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
    cancelled: 'text-red-400 bg-red-500/10 border-red-500/20',
  };

  const filteredHistory = histSearch.trim()
    ? (history ?? []).filter(t =>
        t.tableName?.toLowerCase().includes(histSearch.toLowerCase()) ||
        t.productName?.toLowerCase().includes(histSearch.toLowerCase())
      )
    : (history ?? []);

  return (
    <>
      <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 font-black uppercase tracking-widest text-sm text-foreground">
          <Clock size={16} />Historial (8h)
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input value={histSearch} autoFocus onChange={e => setHistSearch(e.target.value)}
            placeholder="Filtrar por mesa o producto…"
            className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-secondary border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
          {histSearch && (
            <button onClick={() => setHistSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={11} /></button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && <div className="text-center text-muted-foreground text-sm py-8">Cargando...</div>}
        {!isLoading && filteredHistory.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8 opacity-50">
            {histSearch ? `Sin resultados para "${histSearch}"` : 'Sin actividad reciente'}
          </div>
        )}
        {filteredHistory.map(task => (
          <div key={task.id} className="bg-background rounded-xl border border-border/40 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-foreground text-sm">{task.tableName}</span>
              <span className={`text-xs font-black uppercase px-2 py-0.5 rounded border ${statusColor[task.status] ?? 'text-muted-foreground bg-secondary border-border'}`}>
                {statusLabel[task.status] ?? task.status}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold text-foreground/80">{task.quantity}×</span>
              <span className="text-muted-foreground flex-1 truncate">{task.productName}</span>
            </div>
            {task.notes && <div className="text-xs text-muted-foreground/70 bg-secondary/30 rounded px-2 py-1">{task.notes}</div>}
            <div className="text-xs text-muted-foreground/50 flex items-center gap-2">
              <span>{task.employeeName}</span>
              <span>·</span>
              <span>{formatTime(task.updatedAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
