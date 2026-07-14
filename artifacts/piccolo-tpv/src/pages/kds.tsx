import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import {
  useGetKdsTasks,
  useUpdateKitchenTaskStatus,
  useMarkOrderPase,
  getGetKdsTasksQueryKey
} from '@workspace/api-client-react';

const ZONES = ['cocina', 'pizza', 'ensalada', 'barra', 'pase'];

function LiveTime({ startTime }: { startTime: string }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const update = () => {
      const ms = Date.now() - new Date(startTime).getTime();
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      setElapsed(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span className="font-mono tabular-nums">{elapsed}</span>;
}

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{time.toLocaleTimeString('es-ES', { hour12: false })}</>;
}

type KdsZone = 'cocina' | 'pizza' | 'ensalada' | 'barra' | 'pase';
type TaskStatus = 'new' | 'preparing' | 'ready' | 'collected' | 'served' | 'cancelled';
type PaseAction = 'collected' | 'served';

const VALID_ZONES: KdsZone[] = ['cocina', 'pizza', 'ensalada', 'barra', 'pase'];

export default function KdsPage() {
  const params = useParams();
  const rawZone = params.zone || 'cocina';
  const zone: KdsZone = VALID_ZONES.includes(rawZone as KdsZone) ? (rawZone as KdsZone) : 'cocina';
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useGetKdsTasks(zone, {
    query: {
      refetchInterval: 10000,
      queryKey: getGetKdsTasksQueryKey(zone),
    }
  });

  useEffect(() => {
    const socket = io({ path: '/api/socket.io' });
    socket.on('kds:refresh', () => {
      queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey(zone) });
    });
    return () => { socket.disconnect(); };
  }, [zone, queryClient]);

  const updateStatus = useUpdateKitchenTaskStatus();
  const markPase = useMarkOrderPase();

  const handleUpdateStatus = (taskId: string, status: TaskStatus) => {
    updateStatus.mutate(
      { taskId, data: { status } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey(zone) }) }
    );
  };

  const handlePaseAction = (orderId: string, action: PaseAction) => {
    markPase.mutate(
      { orderId, data: { action } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey(zone) }) }
    );
  };

  const isPase = zone === 'pase';

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col text-foreground overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b-2 border-border bg-card flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-6">
          <h1 className="text-3xl font-black uppercase tracking-widest text-primary drop-shadow-sm">{zone}</h1>
          <div className="w-1 h-8 bg-border rounded-full hidden sm:block"></div>
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
        <div className="text-2xl font-mono font-black text-muted-foreground flex items-center gap-2 tracking-wider bg-background px-4 py-1.5 rounded-xl border border-border shadow-inner">
           <LiveClock />
        </div>
      </header>
      
      {/* Mobile nav fallback */}
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#1a0e0c]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground opacity-60">
             <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span className="font-mono text-xl uppercase tracking-widest font-bold">Cargando comandas...</span>
             </div>
          </div>
        ) : !tasks || tasks.length === 0 ? (
          <div className="h-full flex items-center justify-center">
             <div className="text-3xl md:text-5xl font-black text-muted-foreground opacity-20 uppercase tracking-[0.2em] border-4 border-dashed border-muted-foreground p-12 rounded-3xl">
                Zona Libre
             </div>
          </div>
        ) : (
          isPase ? (
            <PaseView tasks={tasks} onAction={handlePaseAction} />
          ) : (
            <ZoneTasksView tasks={tasks} onUpdateStatus={handleUpdateStatus} />
          )
        )}
      </main>
    </div>
  );
}

// Cards for Cocina, Pizza, Ensalada, Barra
function ZoneTasksView({ tasks, onUpdateStatus }: { tasks: any[], onUpdateStatus: (id: string, status: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 items-start">
      {tasks.map(task => {
        const isNew = task.status === 'new';
        const isPrep = task.status === 'preparing';
        const isReady = task.status === 'ready';

        return (
          <div 
            key={task.id} 
            className={`
              flex flex-col bg-card border-2 rounded-2xl overflow-hidden shadow-xl transition-all
              ${isNew ? 'border-[#f59e0b] shadow-[0_4px_20px_rgba(245,158,11,0.15)]' : ''}
              ${isPrep ? 'border-[#3b82f6] shadow-[0_4px_20px_rgba(59,130,246,0.15)]' : ''}
              ${isReady ? 'border-[#22c55e] shadow-[0_4px_20px_rgba(34,197,94,0.2)] scale-[0.98] opacity-90' : 'border-border'}
            `}
          >
            {/* Card Header */}
            <div className={`flex flex-col border-b-2 ${
              isNew ? 'bg-[#f59e0b]/10 border-[#f59e0b]/30' : 
              isPrep ? 'bg-[#3b82f6]/10 border-[#3b82f6]/30' : 
              'bg-[#22c55e]/10 border-[#22c55e]/30'
            }`}>
              <div className="p-4 flex justify-between items-start">
                <div>
                  <div className="text-3xl font-black leading-none text-foreground">{task.tableName}</div>
                  <div className="text-xs font-bold text-muted-foreground mt-2 uppercase tracking-widest">{task.employeeName}</div>
                </div>
                <div className={`text-xl font-mono font-black bg-background/80 px-2 py-1 rounded-lg border border-border/50 shadow-inner ${
                  isNew ? 'text-[#f59e0b]' : isPrep ? 'text-[#3b82f6]' : 'text-[#22c55e]'
                }`}>
                  <LiveTime startTime={task.createdAt} />
                </div>
              </div>
              {task.hasAllergy && (
                <div className="animate-pulse border-t border-red-500/30">
                  <div className="bg-red-600 text-white font-black uppercase tracking-widest text-center py-2">
                    ALERGIA
                  </div>
                  {task.allergyNote && (
                    <div className="bg-red-600/20 text-red-300 text-sm px-3 py-1.5 text-center font-bold">
                      {task.allergyNote}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Card Body */}
            <div className={`p-5 flex-1 flex items-center gap-4 ${isReady ? 'bg-[#22c55e]/5' : ''}`}>
               <div className={`font-black text-3xl h-14 w-14 flex items-center justify-center rounded-xl shrink-0 shadow-inner ${
                 isNew ? 'bg-[#f59e0b]/20 text-[#f59e0b]' : 
                 isPrep ? 'bg-[#3b82f6]/20 text-[#3b82f6]' : 
                 'bg-[#22c55e]/20 text-[#22c55e]'
               }`}>
                 {task.quantity}
               </div>
               <div className="text-xl font-bold leading-snug flex-1">
                 {task.productName}
               </div>
            </div>

            {/* Card Actions */}
            <div className="p-3 bg-background border-t-2 border-border/50">
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
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PaseView({ tasks, onAction }: { tasks: any[], onAction: (orderId: string, action: string) => void }) {
  // Group by orderId
  const ordersMap = new Map<string, any[]>();
  tasks.forEach(t => {
    if (!ordersMap.has(t.orderId)) ordersMap.set(t.orderId, []);
    ordersMap.get(t.orderId)!.push(t);
  });

  const orders = Array.from(ordersMap.entries()).map(([orderId, items]) => {
    const readyItems = items.filter(i => i.status === 'ready');
    const isAllReady = readyItems.length === items.length;
    // Earliest created task
    const earliest = items.reduce((earliest, current) => {
      return new Date(current.createdAt) < new Date(earliest.createdAt) ? current : earliest;
    }, items[0]);

    return {
      orderId,
      items,
      readyCount: readyItems.length,
      totalCount: items.length,
      isAllReady,
      tableName: items[0].tableName,
      employeeName: items[0].employeeName,
      createdAt: earliest.createdAt
    };
  });

  // Sort by mostly ready
  orders.sort((a, b) => {
    if (a.isAllReady && !b.isAllReady) return -1;
    if (!a.isAllReady && b.isAllReady) return 1;
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
            </div>
            <div className="text-right flex flex-col items-end gap-2">
               <div className={`text-2xl font-mono font-black px-3 py-1 rounded-lg bg-background/80 shadow-inner border border-border/50 ${order.isAllReady ? 'text-[#22c55e]' : 'text-primary'}`}>
                 <LiveTime startTime={order.createdAt} />
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
              <div key={item.id} className={`flex justify-between items-center bg-background p-3 rounded-xl border transition-colors ${
                item.status === 'ready' ? 'border-[#22c55e]/30 shadow-sm' : 'border-border'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="font-black text-muted-foreground w-6 text-center shrink-0">{item.quantity}</span>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${item.status === 'ready' ? 'text-foreground' : 'text-muted-foreground'}`}>{item.productName}</span>
                      {item.hasAllergy && (
                        <span className="bg-red-500/20 text-red-500 border border-red-500/30 px-1.5 py-0.5 rounded font-black text-[10px] uppercase tracking-widest">
                          ALERGIA
                        </span>
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
              Servir
            </button>
            {order.isAllReady ? (
              <button 
                onClick={() => onAction(order.orderId, 'collected')}
                className="py-4 bg-[#22c55e] hover:bg-[#16a34a] text-[#14532d] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-[0_4px_15px_rgba(34,197,94,0.3)] hover:shadow-[0_4px_25px_rgba(34,197,94,0.5)]"
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
