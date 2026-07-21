import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { connectAuthenticatedSocket } from '../lib/socket-client';
import { toast } from 'sonner';
import { ChevronLeft, CheckCircle2, Package, Loader2 } from 'lucide-react';
import {
  useGetKdsTasks,
  useUpdateKitchenTaskStatus,
  getGetKdsTasksQueryKey,
  getGetAllTablesQueryKey,
  type KitchenTask,
} from '@workspace/api-client-react';

export default function RecogidaPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [employeeName, setEmployeeName] = useState('');
  const [collectingOrder, setCollectingOrder] = useState<string | null>(null);

  useEffect(() => {
    const empStr = localStorage.getItem('employee');
    if (!empStr) { setLocation('/'); return; }
    try { const emp = JSON.parse(empStr); setEmployeeName(emp.name); } catch {}
  }, [setLocation]);

  const { data: tasks, isLoading } = useGetKdsTasks('pase', {
    query: { queryKey: getGetKdsTasksQueryKey('pase'), refetchInterval: 15000 }
  });

  const updateTaskStatus = useUpdateKitchenTaskStatus();

  const handleCollectOrder = async (orderTasks: KitchenTask[]) => {
    const orderId = orderTasks[0].orderId;
    setCollectingOrder(orderId);
    try {
      await Promise.all(
        orderTasks.map(t =>
          updateTaskStatus.mutateAsync({ taskId: t.id, data: { status: 'collected' } })
        )
      );
      queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey('pase') });
      queryClient.invalidateQueries({ queryKey: getGetAllTablesQueryKey() });
      toast.success(`Pedido de ${orderTasks[0].tableName} recogido`);
    } catch {
      toast.error('Error al registrar la recogida');
    } finally {
      setCollectingOrder(null);
    }
  };

  // Real-time socket
  useEffect(() => {
    const socket = connectAuthenticatedSocket();

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: getGetKdsTasksQueryKey('pase') });
    };

    // Re-fetch on every reconnect so missed events during a dropped connection are caught up
    socket.on('connect', invalidate);
    socket.on('kds:refresh', invalidate);

    // Also re-fetch when returning to foreground
    const onVisibility = () => { if (!document.hidden) invalidate(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => { socket.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [queryClient]);

  // Group tasks by orderId for cleaner display
  const grouped = React.useMemo(() => {
    if (!tasks) return [];
    const map = new Map<string, KitchenTask[]>();
    for (const t of tasks) {
      if (!map.has(t.orderId)) map.set(t.orderId, []);
      map.get(t.orderId)!.push(t);
    }
    return Array.from(map.entries()).map(([orderId, items]) => ({
      orderId,
      tableName: items[0].tableName,
      employeeName: items[0].employeeName,
      items,
    }));
  }, [tasks]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="h-16 flex items-center justify-between px-6 bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/tables" className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95">
            <ChevronLeft size={24} />
          </Link>
          <div>
            <h1 className="text-xl font-bold leading-none">Recogida</h1>
            <span className="text-xs text-muted-foreground font-semibold">{employeeName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          {tasks && tasks.length > 0 && (
            <span className="bg-green-500/15 text-green-400 border border-green-500/30 px-3 py-1 rounded-full">
              {grouped.length} mesa{grouped.length !== 1 ? 's' : ''} lista{grouped.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground opacity-60 mt-8">
            <CheckCircle2 size={56} className="mb-4" strokeWidth={1} />
            <span className="text-lg font-semibold uppercase tracking-widest">Todo recogido</span>
            <span className="text-sm mt-2 opacity-70">Los pedidos listos para servir aparecerán aquí</span>
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            {grouped.map(group => {
              const isCollecting = collectingOrder === group.orderId;
              return (
                <div key={group.orderId} className="bg-card border-2 border-green-500/40 rounded-2xl overflow-hidden shadow-[0_2px_16px_rgba(34,197,94,0.12)]">
                  {/* Order header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-green-500/5">
                    <div>
                      <span className="font-black text-2xl text-green-400">{group.tableName}</span>
                      <span className="text-muted-foreground text-sm ml-3 font-semibold">{group.employeeName}</span>
                    </div>
                    <span className="text-xs bg-green-500/15 text-green-400 border border-green-500/30 px-2.5 py-1 rounded-lg font-black uppercase">
                      {group.items.length} plato{group.items.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="px-5 py-3 space-y-2">
                    {group.items.map(task => (
                      <div key={task.id} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                        <div className="w-9 h-9 bg-green-500/10 text-green-400 rounded-xl flex items-center justify-center font-black text-base border border-green-500/20 shrink-0">
                          {task.quantity}
                        </div>
                        <div className="flex-1">
                          <span className="font-bold text-base leading-tight">{task.productName}</span>
                          {task.hasAllergy && (
                            <div className="text-[10px] text-red-400 font-black uppercase mt-0.5">
                              ⚠ ALERGIA{task.allergyNote ? ` · ${task.allergyNote}` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Collect button */}
                  <div className="px-4 pb-4 pt-2">
                    <button
                      onClick={() => handleCollectOrder(group.items)}
                      disabled={isCollecting}
                      className="w-full py-4 bg-green-600 hover:bg-green-500 text-white font-black text-lg uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 shadow-[0_4px_16px_rgba(34,197,94,0.3)] hover:-translate-y-0.5 disabled:opacity-60 disabled:pointer-events-none"
                    >
                      {isCollecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Package size={22} />}
                      Recoger pedido
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
