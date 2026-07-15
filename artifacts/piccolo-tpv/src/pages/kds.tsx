import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { History, RefreshCw, AlertTriangle, X, Clock, CheckCircle, ShieldCheck } from 'lucide-react';
import {
  useGetKdsTasks,
  useUpdateKitchenTaskStatus,
  useMarkOrderPase,
  useResendKitchenTask,
  useGetKdsHistory,
  getGetKdsTasksQueryKey,
  getGetKdsHistoryQueryKey,
  type KitchenTask,
} from '@workspace/api-client-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const ZONES = ['cocina', 'pizza', 'ensalada', 'barra', 'pase'] as const;
type KdsZone = typeof ZONES[number];
type TaskStatus = 'new' | 'preparing' | 'ready' | 'collected' | 'served' | 'cancelled';
type PaseAction = 'collected' | 'served';

/** How long a cancelled card remains visible on the KDS before auto-hiding (5 min). */
const CANCELLED_VISIBLE_MS = 5 * 60 * 1000;
/** Yellow border warning threshold. */
const DELAY_WARNING_MS = 8 * 60 * 1000;
/** Red pulsing border critical threshold. */
const DELAY_CRITICAL_MS = 12 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getElapsedMs(isoDate: string) {
  return Date.now() - new Date(isoDate).getTime();
}

type DelayLevel = 'normal' | 'warning' | 'critical';
function delayLevel(isoDate: string): DelayLevel {
  const ms = getElapsedMs(isoDate);
  if (ms >= DELAY_CRITICAL_MS) return 'critical';
  if (ms >= DELAY_WARNING_MS) return 'warning';
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
    ? level === 'critical' ? 'text-red-400' : level === 'warning' ? 'text-orange-400' : undefined
    : undefined;

  return (
    <span className={`font-mono tabular-nums flex items-center gap-1 ${color ?? ''}`}>
      {showDelay && level !== 'normal' && <AlertTriangle size={12} className="shrink-0" />}
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function KdsPage() {
  const params = useParams();
  const rawZone = params.zone || 'cocina';
  const zone: KdsZone = (ZONES as readonly string[]).includes(rawZone) ? (rawZone as KdsZone) : 'cocina';
  const queryClient = useQueryClient();
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: rawTasks, isLoading } = useGetKdsTasks(zone, {
    query: {
      refetchInterval: 10000,
      queryKey: getGetKdsTasksQueryKey(zone),
    },
  });

  // Client-side guard: filter out collected/served; show cancelled briefly (5 min)
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
    const socket = io({ path: '/api/socket.io' });

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey(zone) });
      queryClient.invalidateQueries({ queryKey: getGetKdsHistoryQueryKey() });
    };

    const handleKdsRefresh = (payload?: { employeeName?: string | null }) => {
      invalidate();
      const name = payload?.employeeName;
      if (name) {
        setUpdatedBy(name);
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = setTimeout(() => setUpdatedBy(null), 4000);
      }
    };

    socket.on('connect', invalidate);
    socket.on('kds:refresh', handleKdsRefresh);

    return () => {
      clearTimeout(clearTimerRef.current);
      socket.disconnect();
    };
  }, [zone, queryClient]);

  const updateStatus = useUpdateKitchenTaskStatus();
  const markPase    = useMarkOrderPase();
  const resend      = useResendKitchenTask();

  const handleUpdateStatus = (taskId: string, status: TaskStatus) => {
    updateStatus.mutate(
      { taskId, data: { status } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey(zone) }) },
    );
  };

  const handlePaseAction = (orderId: string, action: PaseAction) => {
    markPase.mutate(
      { orderId, data: { action } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey(zone) }) },
    );
  };

  const handleResend = (taskId: string) => {
    resend.mutate(
      { taskId },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey(zone) }) },
    );
  };

  const isPase = zone === 'pase';

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col text-foreground overflow-hidden">
      {/* Header */}
      <header className="border-b-2 border-border bg-card shrink-0 shadow-sm z-10">
        <div className="h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <h1 className="text-3xl font-black uppercase tracking-widest text-primary drop-shadow-sm">{zone}</h1>
            <div className="w-1 h-8 bg-border rounded-full hidden sm:block" />
            <nav className="hidden sm:flex gap-2">
              {ZONES.map(z => (
                <Link
                  key={z}
                  href={`/kds/${z}`}
                  className={`px-4 py-2 rounded-lg text-sm font-black uppercase tracking-wider transition-all ${
                    zone === z
                      ? 'bg-primary text-primary-foreground shadow-md scale-105'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                  }`}
                >
                  {z}
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
            <button
              onClick={() => setShowHistory(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-bold text-sm transition-all ${
                showHistory
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <History size={16} />
              <span className="hidden sm:inline">Historial</span>
            </button>
            <div className="text-2xl font-mono font-black text-muted-foreground flex items-center gap-2 tracking-wider bg-background px-4 py-1.5 rounded-xl border border-border shadow-inner">
              <LiveClock />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <nav className="sm:hidden flex gap-1 p-2 bg-card border-b border-border overflow-x-auto hide-scrollbar shrink-0">
        {ZONES.map(z => (
          <Link
            key={z}
            href={`/kds/${z}`}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${
              zone === z
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
            }`}
          >
            {z}
          </Link>
        ))}
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
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
            <ZoneTasksView tasks={tasks} onUpdateStatus={handleUpdateStatus} onResend={handleResend} />
          )}
        </main>

        {/* History side panel */}
        {showHistory && (
          <aside className="w-80 xl:w-96 shrink-0 border-l-2 border-border bg-card flex flex-col overflow-hidden">
            <HistoryPanel onClose={() => setShowHistory(false)} />
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── Zone tasks view (Cocina / Pizza / Ensalada / Barra) ──────────────────────

function ZoneTasksView({
  tasks,
  onUpdateStatus,
  onResend,
}: {
  tasks: KitchenTask[];
  onUpdateStatus: (id: string, status: string) => void;
  onResend: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 items-start">
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} onUpdateStatus={onUpdateStatus} onResend={onResend} />
      ))}
    </div>
  );
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');

function TaskCard({
  task,
  onUpdateStatus,
  onResend,
}: {
  task: KitchenTask;
  onUpdateStatus: (id: string, status: string) => void;
  onResend: (id: string) => void;
}) {
  const isNew       = task.status === 'new';
  const isPrep      = task.status === 'preparing';
  const isReady     = task.status === 'ready';
  const isCancelled = task.status === 'cancelled';

  // Allergy confirmation local state
  const [allergyConfirmed, setAllergyConfirmed] = useState(false);
  const [showAllergyConfirm, setShowAllergyConfirm] = useState(false);
  const [confirmNote, setConfirmNote] = useState('');
  const [crossRisk, setCrossRisk] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleAllergyConfirm = async () => {
    setConfirming(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/kitchen-tasks/${task.id}/allergy-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: confirmNote, hasCrossContaminationRisk: crossRisk }),
      });
      if (!res.ok) throw new Error();
      setAllergyConfirmed(true);
      setShowAllergyConfirm(false);
      toast.success('Preparación especial confirmada');
    } catch {
      toast.error('Error al confirmar');
    } finally {
      setConfirming(false);
    }
  };

  // Dynamic delay border for active tasks
  const [currentDelay, setCurrentDelay] = useState<DelayLevel>('normal');
  useEffect(() => {
    if (isCancelled) return;
    const check = () => setCurrentDelay(delayLevel(task.createdAt));
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, [task.createdAt, isCancelled]);

  const delayBorder =
    !isCancelled && currentDelay === 'critical'
      ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-background animate-pulse'
      : !isCancelled && currentDelay === 'warning'
      ? 'ring-2 ring-orange-400 ring-offset-1 ring-offset-background'
      : '';

  let borderClass = 'border-border';
  if (isCancelled) borderClass = 'border-red-600 opacity-75';
  else if (isNew)  borderClass = 'border-[#f59e0b] shadow-[0_4px_20px_rgba(245,158,11,0.15)]';
  else if (isPrep) borderClass = 'border-[#3b82f6] shadow-[0_4px_20px_rgba(59,130,246,0.15)]';
  else if (isReady) borderClass = 'border-[#22c55e] shadow-[0_4px_20px_rgba(34,197,94,0.2)] scale-[0.98] opacity-90';

  const headerBg = isCancelled
    ? 'bg-red-950/50 border-red-700/40'
    : isNew   ? 'bg-[#f59e0b]/10 border-[#f59e0b]/30'
    : isPrep  ? 'bg-[#3b82f6]/10 border-[#3b82f6]/30'
    : 'bg-[#22c55e]/10 border-[#22c55e]/30';

  const timerColor = isCancelled
    ? 'text-red-400'
    : isNew   ? 'text-[#f59e0b]'
    : isPrep  ? 'text-[#3b82f6]'
    : 'text-[#22c55e]';

  const qtyBg = isCancelled
    ? 'bg-red-900/30 text-red-400'
    : isNew   ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
    : isPrep  ? 'bg-[#3b82f6]/20 text-[#3b82f6]'
    : 'bg-[#22c55e]/20 text-[#22c55e]';

  return (
    <div className={`relative flex flex-col bg-card border-2 rounded-2xl overflow-hidden shadow-xl transition-all ${borderClass} ${delayBorder}`}>
      {/* Header */}
      <div className={`flex flex-col border-b-2 ${headerBg}`}>
        <div className="p-4 flex justify-between items-start">
          <div>
            <div className="text-3xl font-black leading-none text-foreground">{task.tableName}</div>
            <div className="text-xs font-bold text-muted-foreground mt-2 uppercase tracking-widest">{task.employeeName}</div>
            <div className="text-xs text-muted-foreground/60 mt-0.5">{formatTime(task.createdAt)}</div>
          </div>
          <div className={`text-xl font-mono font-black bg-background/80 px-2 py-1 rounded-lg border border-border/50 shadow-inner ${timerColor}`}>
            <LiveTime startTime={task.createdAt} showDelay={!isCancelled} />
          </div>
        </div>

        {/* Allergy banner */}
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
                  <button
                    onClick={() => setShowAllergyConfirm(true)}
                    className="w-full py-2 bg-red-900/60 text-red-200 font-bold text-xs uppercase tracking-wider hover:bg-red-900/80 transition-colors flex items-center justify-center gap-1"
                  >
                    <CheckCircle size={12} /> Confirmar preparación especial
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Allergy confirmation overlay */}
        {showAllergyConfirm && (
          <div className="absolute inset-0 z-20 bg-card/95 backdrop-blur-sm flex flex-col p-4 gap-3">
            <div className="flex items-center justify-between">
              <span className="font-black text-sm text-red-400 flex items-center gap-1"><AlertTriangle size={14} /> Confirmar alergia</span>
              <button onClick={() => setShowAllergyConfirm(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary"><X size={13} /></button>
            </div>
            <p className="text-xs text-muted-foreground">{task.allergyNote ?? 'Preparación especial requerida'}</p>
            <textarea
              className="w-full px-2 py-1.5 rounded-lg bg-secondary border border-border text-xs focus:outline-none resize-none"
              rows={2} placeholder="Nota (ej: utensilios limpios, zona aislada…)"
              value={confirmNote} onChange={e => setConfirmNote(e.target.value)}
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

        {/* Cancelled banner */}
        {isCancelled && (
          <div className="bg-red-700 text-white font-black uppercase tracking-[0.2em] text-center py-2.5 text-sm">
            ✕ ANULADO
          </div>
        )}
      </div>

      {/* Body */}
      <div className={`p-5 flex-1 flex flex-col gap-3 ${isReady && !isCancelled ? 'bg-[#22c55e]/5' : ''}`}>
        <div className="flex items-start gap-4">
          <div className={`font-black text-3xl h-14 w-14 flex items-center justify-center rounded-xl shrink-0 shadow-inner ${qtyBg} ${isCancelled ? 'line-through' : ''}`}>
            {task.quantity}
          </div>
          <div className={`text-xl font-bold leading-snug flex-1 ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>
            {task.productName}
          </div>
        </div>

        {/* Notes / modifiers */}
        {task.notes && (
          <div className="bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm font-semibold text-foreground/90 leading-snug">
            {task.notes}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 bg-background border-t-2 border-border/50 flex flex-col gap-2">
        {!isCancelled && (
          <>
            {isNew && (
              <button
                onClick={() => onUpdateStatus(task.id, 'preparing')}
                className="w-full py-4 bg-[#f59e0b] hover:bg-[#d97706] text-[#451a03] font-black text-lg uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md"
              >
                Preparar
              </button>
            )}
            {isPrep && (
              <button
                onClick={() => onUpdateStatus(task.id, 'ready')}
                className="w-full py-4 bg-[#3b82f6] hover:bg-[#2563eb] text-[#1e3a8a] font-black text-lg uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md"
              >
                Listo
              </button>
            )}
            {isReady && (
              <div className="w-full py-4 bg-[#22c55e]/10 text-[#22c55e] border-2 border-[#22c55e]/30 font-black text-lg uppercase tracking-wider rounded-xl flex items-center justify-center">
                Esperando Pase
              </div>
            )}
          </>
        )}

        {/* Resend button — available for any state */}
        <button
          onClick={() => onResend(task.id)}
          className="w-full py-2.5 flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground font-bold text-sm uppercase tracking-wider rounded-xl transition-all active:scale-95 border border-border"
          title="Reenviar a cocina"
        >
          <RefreshCw size={14} />
          Reenviar
        </button>
      </div>
    </div>
  );
}

// ─── Pase view ────────────────────────────────────────────────────────────────

function PaseView({ tasks, onAction }: { tasks: KitchenTask[]; onAction: (orderId: string, action: string) => void }) {
  const ordersMap = new Map<string, KitchenTask[]>();
  tasks.forEach(t => {
    if (!ordersMap.has(t.orderId)) ordersMap.set(t.orderId, []);
    ordersMap.get(t.orderId)!.push(t);
  });

  const orders = Array.from(ordersMap.entries()).map(([orderId, items]) => {
    const readyItems = items.filter(i => i.status === 'ready');
    const isAllReady = readyItems.length === items.length && items.length > 0;
    const earliest = items.reduce((a, b) => new Date(a.createdAt) < new Date(b.createdAt) ? a : b);
    return { orderId, items, readyCount: readyItems.length, totalCount: items.length, isAllReady, tableName: items[0].tableName, employeeName: items[0].employeeName, createdAt: earliest.createdAt };
  });

  orders.sort((a, b) => {
    if (a.isAllReady !== b.isAllReady) return a.isAllReady ? -1 : 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
      {orders.map(order => (
        <div
          key={order.orderId}
          className={`flex flex-col bg-card border-2 rounded-2xl shadow-xl overflow-hidden transition-all ${
            order.isAllReady ? 'border-[#22c55e] shadow-[0_0_30px_rgba(34,197,94,0.15)] scale-[1.02] z-10' : 'border-border'
          }`}
        >
          {/* Header */}
          <div className={`p-5 border-b-2 flex justify-between items-start ${order.isAllReady ? 'bg-[#22c55e]/20 border-[#22c55e]/40' : 'bg-secondary/40 border-border/50'}`}>
            <div>
              <div className="text-4xl font-black text-foreground leading-none">{order.tableName}</div>
              <div className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-2">{order.employeeName}</div>
              <div className="text-xs text-muted-foreground/60 mt-1">{formatTime(order.createdAt)}</div>
            </div>
            <div className="text-right flex flex-col items-end gap-2">
              <div className={`text-2xl font-mono font-black px-3 py-1 rounded-lg bg-background/80 shadow-inner border border-border/50 ${order.isAllReady ? 'text-[#22c55e]' : 'text-primary'}`}>
                <LiveTime startTime={order.createdAt} showDelay />
              </div>
              <div className={`text-sm font-black uppercase tracking-wider px-2 py-0.5 rounded ${order.isAllReady ? 'bg-[#22c55e] text-[#14532d]' : 'bg-secondary text-muted-foreground'}`}>
                {order.readyCount} / {order.totalCount}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-3 bg-background border-y border-border/30 relative">
            <div
              className={`h-full transition-all duration-500 ease-out ${order.isAllReady ? 'bg-[#22c55e]' : 'bg-primary'}`}
              style={{ width: `${(order.readyCount / order.totalCount) * 100}%` }}
            />
          </div>

          {/* Items */}
          <div className="p-4 flex-1 space-y-2 bg-card/50">
            {order.items.map(item => (
              <div key={item.id} className={`flex flex-col bg-background p-3 rounded-xl border transition-colors gap-1 ${
                item.status === 'ready' ? 'border-[#22c55e]/30 shadow-sm' : 'border-border'
              }`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="font-black text-muted-foreground w-6 text-center shrink-0">{item.quantity}</span>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${item.status === 'ready' ? 'text-foreground' : 'text-muted-foreground'}`}>{item.productName}</span>
                        {item.hasAllergy && (
                          <span className="bg-red-500/20 text-red-500 border border-red-500/30 px-1.5 py-0.5 rounded font-black text-[10px] uppercase tracking-widest">ALERGIA</span>
                        )}
                      </div>
                      {item.hasAllergy && item.allergyNote && (
                        <span className="text-red-500 text-xs font-semibold mt-0.5">{item.allergyNote}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    {item.status === 'ready' ? (
                      <span className="w-8 h-8 rounded-lg bg-[#22c55e]/20 text-[#22c55e] flex items-center justify-center font-black text-lg">✓</span>
                    ) : item.status === 'preparing' ? (
                      <span className="w-8 h-8 rounded-lg bg-[#3b82f6]/20 text-[#3b82f6] flex items-center justify-center text-lg font-black animate-pulse">↻</span>
                    ) : (
                      <span className="w-8 h-8 rounded-lg bg-[#f59e0b]/20 text-[#f59e0b] flex items-center justify-center text-lg font-black">!</span>
                    )}
                  </div>
                </div>
                {item.notes && (
                  <div className="ml-9 text-xs font-semibold text-muted-foreground bg-secondary/40 rounded px-2 py-1">
                    {item.notes}
                  </div>
                )}
              </div>
            ))}
          </div>

          {order.isAllReady && (
            <div className="bg-[#22c55e] text-[#14532d] text-center font-black py-2.5 uppercase tracking-[0.3em] text-sm shadow-inner">
              Mesa Completa
            </div>
          )}

          {/* Actions */}
          <div className="p-4 bg-background border-t-2 border-border/50 grid grid-cols-2 gap-3">
            <button
              onClick={() => onAction(order.orderId, 'served')}
              className="py-4 bg-secondary hover:bg-secondary-foreground hover:text-background text-foreground font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 border-2 border-border"
            >
              Entregar
            </button>
            {order.isAllReady ? (
              <button
                onClick={() => onAction(order.orderId, 'collected')}
                className="py-4 bg-[#22c55e] hover:bg-[#16a34a] text-[#14532d] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-[0_4px_15px_rgba(34,197,94,0.3)]"
              >
                Recoger
              </button>
            ) : (
              <div className="py-4 bg-card border-2 border-dashed border-border text-muted-foreground font-bold uppercase tracking-widest rounded-xl flex items-center justify-center text-sm">
                Incompleto
              </div>
            )}
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

  const statusLabel: Record<string, string> = {
    collected: 'Recogido',
    served:    'Entregado',
    cancelled: 'Anulado',
  };

  const statusColor: Record<string, string> = {
    collected: 'text-green-400 bg-green-500/10 border-green-500/20',
    served:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
    cancelled: 'text-red-400 bg-red-500/10 border-red-500/20',
  };

  return (
    <>
      <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 font-black uppercase tracking-widest text-sm text-foreground">
          <Clock size={16} />
          Historial (8h)
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && (
          <div className="text-center text-muted-foreground text-sm py-8">Cargando...</div>
        )}
        {!isLoading && (!history || history.length === 0) && (
          <div className="text-center text-muted-foreground text-sm py-8 opacity-50">Sin actividad reciente</div>
        )}
        {history?.map(task => (
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
            {task.notes && (
              <div className="text-xs text-muted-foreground/70 bg-secondary/30 rounded px-2 py-1">{task.notes}</div>
            )}
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
