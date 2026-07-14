import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { ChevronLeft, Trash2, Send, Clock, CheckCircle2, CircleDashed, Loader2, PenLine, Bell, Check } from 'lucide-react';
import {
  useGetTableOrder,
  useGetCategories,
  useGetCategoryProducts,
  useAddOrderItem,
  useDeleteOrderItem,
  useSendOrder,
  useGetUnreadNotifications,
  useMarkNotificationRead,
  getGetTableOrderQueryKey,
  getGetCategoryProductsQueryKey,
  getGetAllTablesQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetUnreadNotificationsQueryKey
} from '@workspace/api-client-react';
import { EditItemModal } from '../components/EditItemModal';

const TAP_SLOP = 8;

export default function OrderPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const tableId = params.tableId!;

  // Shared tap-slop guard: prevents accidental taps while scrolling.
  // Store pointer-down origin; if the finger/cursor travels more than TAP_SLOP
  // pixels before releasing, treat it as a scroll gesture and suppress the click.
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);
  const handlePointerDown = (e: React.PointerEvent) => {
    pointerOriginRef.current = { x: e.clientX, y: e.clientY };
  };
  const guardedClick = (handler: () => void) => (e: React.MouseEvent) => {
    if (pointerOriginRef.current) {
      const dx = e.clientX - pointerOriginRef.current.x;
      const dy = e.clientY - pointerOriginRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > TAP_SLOP) {
        pointerOriginRef.current = null;
        return;
      }
    }
    pointerOriginRef.current = null;
    handler();
  };
  
  const [employeeId, setEmployeeId] = useState<string>("");
  const [employeeName, setEmployeeName] = useState<string>("");
  
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeAlert, setActiveAlert] = useState<any | null>(null);
  const [remotelyUpdated, setRemotelyUpdated] = useState(false);
  const [remoteUpdatedBy, setRemoteUpdatedBy] = useState<string | null>(null);
  const suppressNextRefresh = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remotelyUpdatedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Suppress the remote-update indicator for a short grace window when returning
  // from the background. Mobile browsers reconnect the socket on visibility restore,
  // which triggers orders:refresh — but no *other* device made a change, so we
  // must not flash the "Actualizado" banner at the current user.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        suppressNextRefresh.current = true;
        if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
        suppressTimeoutRef.current = setTimeout(() => {
          suppressNextRefresh.current = false;
          suppressTimeoutRef.current = null;
        }, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    const empStr = localStorage.getItem("employee");
    if (!empStr) {
      setLocation("/");
      return;
    }
    try {
      const emp = JSON.parse(empStr);
      setEmployeeId(emp.id);
      setEmployeeName(emp.name);
    } catch (e) {}
  }, [setLocation]);

  const { data: tableData, isLoading: loadingTable } = useGetTableOrder(tableId, {
    query: { queryKey: getGetTableOrderQueryKey(tableId), refetchInterval: 30000 }
  });
  const table = tableData?.table;
  const order = tableData?.order;

  // Real orderId to use for mutations
  const actualOrderId = order?.id || (params.orderId !== "current" ? params.orderId : undefined);

  const { data: notificationsData } = useGetUnreadNotifications({
    query: {
      enabled: !!employeeId,
      refetchInterval: 30000,
      queryKey: getGetUnreadNotificationsQueryKey(),
    }
  });

  const markRead = useMarkNotificationRead();

  const handleMarkRead = (id: string) => {
    markRead.mutate({ notificationId: id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationsQueryKey() })
    });
  };

  const { data: categories, isLoading: loadingCategories } = useGetCategories();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (categories?.length && !activeCategoryId) {
      setActiveCategoryId(categories[0].id);
    }
  }, [categories, activeCategoryId]);

  const { data: products, isLoading: loadingProducts } = useGetCategoryProducts(activeCategoryId!, {
    query: {
      enabled: !!activeCategoryId,
      queryKey: activeCategoryId ? getGetCategoryProductsQueryKey(activeCategoryId) : [],
    }
  });

  // Socket for waiter notifications and live order updates
  useEffect(() => {
    if (!order?.id && !employeeId) return;
    const socket = io({ path: '/api/socket.io' });
    
    // On reconnect, suppress the indicator for a short grace window so that the
    // automatic re-fetch (which catches up missed events) does not flash the
    // "Actualizado" banner when no other device actually made a change.
    socket.on('reconnect', () => {
      suppressNextRefresh.current = true;
      if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
      suppressTimeoutRef.current = setTimeout(() => {
        suppressNextRefresh.current = false;
        suppressTimeoutRef.current = null;
      }, 500);
      queryClient.invalidateQueries({ queryKey: getGetTableOrderQueryKey(tableId) });
    });

    if (order?.id) {
      socket.on('waiter:order-ready', (data: any) => {
        if (data.orderId === order.id) {
          toast.success(`¡Mesa ${data.tableName} lista para recoger!`, { duration: Infinity });
          try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContext) {
              const ctx = new AudioContext();
              const osc = ctx.createOscillator();
              osc.connect(ctx.destination);
              osc.frequency.value = 880;
              osc.start();
              osc.stop(ctx.currentTime + 0.5);
            }
          } catch (e) {}
        }
      });

      socket.on('orders:refresh', (data: any) => {
        if (data?.orderId === order.id) {
          queryClient.invalidateQueries({ queryKey: getGetTableOrderQueryKey(tableId) });
          if (suppressNextRefresh.current) {
            suppressNextRefresh.current = false;
          } else {
            if (remotelyUpdatedTimer.current) clearTimeout(remotelyUpdatedTimer.current);
            setRemotelyUpdated(true);
            setRemoteUpdatedBy(data?.employeeName ?? null);
            remotelyUpdatedTimer.current = setTimeout(() => {
              setRemotelyUpdated(false);
              setRemoteUpdatedBy(null);
            }, 2000);
          }
        }
      });
    }

    if (employeeId) {
      socket.on(`waiter:${employeeId}:notification`, (data: any) => {
        setActiveAlert(data);
        queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationsQueryKey() });
        if (navigator.vibrate) {
          navigator.vibrate([300, 100, 300]);
        }
        setTimeout(() => {
          setActiveAlert((current: any) => current?.id === data.id ? null : current);
        }, 8000);
      });
    }

    return () => { socket.disconnect(); };
  }, [order?.id, employeeId, queryClient, tableId]);

  const dismissAlert = () => {
    if (activeAlert?.id) {
      handleMarkRead(activeAlert.id);
    }
    setActiveAlert(null);
  };

  // Mutations
  const addOrderItem = useAddOrderItem();
  const deleteOrderItem = useDeleteOrderItem();
  const sendOrder = useSendOrder();

  const handleAddProduct = (productId: string) => {
    if (!actualOrderId) return;
    suppressNextRefresh.current = true;
    addOrderItem.mutate(
      { orderId: actualOrderId, data: { productId, quantity: 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTableOrderQueryKey(tableId) });
        },
        onError: () => {
          suppressNextRefresh.current = false;
          toast.error("No se pudo añadir el producto");
        }
      }
    );
  };

  const handleDeleteItem = (itemId: string) => {
    suppressNextRefresh.current = true;
    deleteOrderItem.mutate(
      { itemId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTableOrderQueryKey(tableId) });
        },
        onError: () => {
          suppressNextRefresh.current = false;
          toast.error("No se pudo eliminar el producto");
        }
      }
    );
  };

  const handleSendOrder = () => {
    if (!actualOrderId) return;
    suppressNextRefresh.current = true;
    sendOrder.mutate(
      { orderId: actualOrderId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTableOrderQueryKey(tableId) });
          queryClient.invalidateQueries({ queryKey: getGetAllTablesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast.success("Comanda enviada a preparación");
        },
        onError: () => {
          suppressNextRefresh.current = false;
          toast.error("Error al enviar la comanda");
        }
      }
    );
  };

  const allItems = order?.items || [];
  const draftItems = allItems.filter((i: any) => i.status === 'draft');
  const hasDrafts = draftItems.length > 0;
  const hasNonDraftItems = allItems.some((i: any) => i.status !== 'draft');
  const showCobrar = hasNonDraftItems && order?.status !== 'paid';

  const total = useMemo(() => {
    return allItems.reduce((acc: number, item: any) => acc + (parseFloat(item.unitPrice) * item.quantity), 0);
  }, [allItems]);

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden flex-col md:flex-row text-foreground relative">
      {/* Alert Banner */}
      {activeAlert && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-3 flex items-center justify-between shadow-lg cursor-pointer" onClick={dismissAlert}>
          <div className="flex items-center gap-3">
             <Bell className="w-5 h-5 animate-bounce" />
             <div>
               <div className="font-black uppercase tracking-wide">{activeAlert.title}</div>
               <div className="text-sm font-semibold opacity-90">{activeAlert.message}</div>
             </div>
          </div>
          <button className="p-2 hover:bg-amber-600/50 rounded-lg transition-colors"><Check className="w-5 h-5" /></button>
        </div>
      )}

      {/* LEFT PANEL - CATEGORIES & PRODUCTS */}
      <div className="flex-1 flex flex-col h-full bg-background relative md:w-[60%]">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 border-b border-border bg-card shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-4">
            <Link href="/tables" className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 border border-transparent hover:border-border">
              <ChevronLeft size={24} />
            </Link>
            <div>
              <h1 className="text-xl font-bold leading-none text-primary">
                {loadingTable ? "Cargando..." : table?.name || 'Mesa...'}
              </h1>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{employeeName}</span>
            </div>
          </div>
          
          <div className="flex items-center">
            <div className="relative inline-block mr-4">
               <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                 <Bell size={24} />
                 {notificationsData && notificationsData.length > 0 && (
                   <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-card"></span>
                 )}
               </button>
               {showNotifications && (
                 <div className="absolute top-full right-0 mt-2 w-72 bg-card border-2 border-border rounded-xl shadow-xl z-50 overflow-hidden">
                   <div className="p-3 border-b border-border bg-secondary/50 font-bold flex justify-between items-center">
                     <span>Notificaciones</span>
                     <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">{notificationsData?.length || 0}</span>
                   </div>
                   <div className="max-h-64 overflow-y-auto">
                     {(!notificationsData || notificationsData.length === 0) ? (
                       <div className="p-4 text-center text-muted-foreground text-sm">Sin notificaciones nuevas</div>
                     ) : (
                       notificationsData.map(n => (
                         <div key={n.id} className="p-3 border-b border-border last:border-0 hover:bg-secondary/30">
                           <div className="font-bold text-sm mb-1">{n.title}</div>
                           <div className="text-xs text-muted-foreground mb-2">{n.message}</div>
                           <button onClick={() => handleMarkRead(n.id)} className="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
                             <Check size={14} /> Marcar leída
                           </button>
                         </div>
                       ))
                     )}
                   </div>
                 </div>
               )}
            </div>
            <span className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider shadow-inner ${
              order?.status === 'active' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 
              order?.status === 'completed' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 
              'bg-secondary text-muted-foreground'
            }`}>
              {order?.status === 'active' ? 'Abierta' : order?.status === 'completed' ? 'Completada' : '...'}
            </span>
          </div>
        </header>

        {/* Categories Tabs */}
        <div className="bg-card border-b border-border px-2 pt-3 pb-0 flex overflow-x-auto hide-scrollbar shrink-0 gap-1 shadow-sm">
          {loadingCategories ? (
            <div className="flex gap-2 p-2 w-full">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-24 h-10 bg-secondary rounded-t-lg animate-pulse shrink-0" />)}
            </div>
          ) : (
            categories?.map(cat => (
              <button 
                key={cat.id}
                onPointerDown={handlePointerDown}
                onClick={guardedClick(() => setActiveCategoryId(cat.id))}
                className={`px-6 py-3 rounded-t-xl font-bold text-sm whitespace-nowrap transition-all ${
                  activeCategoryId === cat.id 
                    ? "bg-background text-primary border-t-2 border-x border-primary/50 border-b-0 shadow-[0_-4px_10px_rgba(0,0,0,0.1)] relative z-10" 
                    : "text-muted-foreground hover:bg-secondary border-t-2 border-transparent border-b-0"
                }`}
              >
                {cat.name}
              </button>
            ))
          )}
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-background relative z-0">
          {loadingProducts ? (
             <div className="w-full h-full flex items-center justify-center">
               <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
             </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {products?.map(p => {
                const isAdding = addOrderItem.isPending && addOrderItem.variables?.data.productId === p.id;
                return (
                  <button
                    key={p.id}
                    onPointerDown={handlePointerDown}
                    onClick={guardedClick(() => handleAddProduct(p.id))}
                    disabled={!actualOrderId || isAdding}
                    className={`bg-card border-2 border-border hover:border-primary/50 hover:bg-secondary/30 rounded-2xl p-4 flex flex-col items-start text-left transition-all active:scale-[0.96] aspect-[4/3] justify-between group shadow-sm relative overflow-hidden ${isAdding ? 'opacity-70' : ''}`}
                  >
                    <span className="font-bold text-foreground text-lg leading-tight group-hover:text-primary transition-colors line-clamp-3">{p.name}</span>
                    <div className="flex w-full justify-between items-end mt-2">
                       <span className="font-mono text-muted-foreground font-semibold bg-secondary/50 px-2 py-1 rounded-md">{p.price}€</span>
                       {isAdding && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL - TICKET (COMANDA) */}
      <div className="w-full md:w-[40%] md:min-w-[350px] lg:max-w-[450px] border-l border-border bg-card flex flex-col h-[50vh] md:h-full z-20 shadow-[-8px_0_20px_rgba(0,0,0,0.15)] relative">
        <div className="p-5 border-b border-border bg-secondary/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black tracking-tight">Comanda</h2>
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 ${
              remotelyUpdated
                ? 'bg-blue-500/15 text-blue-500 border border-blue-500/30 opacity-100 scale-100'
                : 'opacity-0 scale-95 pointer-events-none'
            }`}>
              <CheckCircle2 size={13} />
              {remoteUpdatedBy ? `Actualizado por ${remoteUpdatedBy}` : 'Actualizado'}
            </span>
          </div>
          <span className="bg-primary text-primary-foreground px-3 py-1 rounded-lg text-sm font-black shadow-sm">
            {allItems.length} items
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-card/50">
          {allItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60">
               <CircleDashed size={48} className="mb-4" strokeWidth={1} />
               <span className="font-semibold text-lg uppercase tracking-widest">Comanda vacía</span>
            </div>
          ) : (
            allItems.map((item: any) => {
              const isDeleting = deleteOrderItem.isPending && deleteOrderItem.variables?.itemId === item.id;
              return (
                <div key={item.id} className={`flex flex-col bg-background p-4 rounded-xl border-2 transition-all ${
                  item.status === 'draft' ? 'border-border shadow-sm' :
                  item.status === 'sent' ? 'border-amber-500/30 shadow-[0_2px_8px_rgba(245,158,11,0.1)]' :
                  'border-green-500/30 shadow-[0_2px_8px_rgba(34,197,94,0.1)]'
                } ${item.hasAllergy ? '!border-red-500/60' : ''} ${isDeleting ? 'opacity-50 scale-95' : ''}`}>
                   <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                       <div className="bg-secondary text-secondary-foreground font-black w-8 h-8 rounded flex items-center justify-center shrink-0">
                         {item.quantity}
                       </div>
                       <div className="flex flex-col">
                         <span className="font-bold text-lg leading-tight">{item.productName}</span>
                         {item.modifiers && item.modifiers.length > 0 && (
                           <div className="flex flex-wrap gap-1 mt-1">
                             {item.modifiers.map((m: any, i: number) => (
                               <span key={i} className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{m.modifierName}</span>
                             ))}
                           </div>
                         )}
                         {item.hasAllergy && (
                           <div className="mt-2 bg-red-500/10 text-red-500 border border-red-500/30 px-2 py-0.5 rounded font-black text-xs uppercase tracking-widest inline-block w-fit">
                             ALERGIA
                             {item.allergyNote && <div className="text-[10px] opacity-90 mt-0.5 lowercase normal-case">{item.allergyNote}</div>}
                           </div>
                         )}
                       </div>
                     </div>
                     <span className="font-mono font-semibold text-muted-foreground">
                       {(parseFloat(item.unitPrice) * item.quantity).toFixed(2)}€
                     </span>
                   </div>
                   <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
                     {item.status === 'draft' ? (
                       <span className="text-muted-foreground text-sm font-semibold flex items-center gap-1.5"><CircleDashed size={16} /> Sin enviar</span>
                     ) : item.status === 'sent' ? (
                       <span className="text-amber-500 text-sm font-semibold flex items-center gap-1.5"><Clock size={16} /> Preparando</span>
                     ) : (
                       <span className="text-green-500 text-sm font-semibold flex items-center gap-1.5"><CheckCircle2 size={16} /> Listo</span>
                     )}
                     
                     <div className="flex gap-1">
                       <button
                         onPointerDown={handlePointerDown}
                         onClick={guardedClick(() => setEditingItem(item))}
                         className="text-muted-foreground hover:bg-secondary hover:text-foreground p-1.5 rounded-lg transition-colors active:scale-90"
                       >
                         <PenLine size={18} />
                       </button>
                       {item.status === 'draft' && (
                         <button 
                           onPointerDown={handlePointerDown}
                           onClick={guardedClick(() => handleDeleteItem(item.id))}
                           disabled={isDeleting}
                           className="text-destructive hover:bg-destructive hover:text-destructive-foreground p-1.5 rounded-lg transition-colors active:scale-90"
                         >
                           {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                         </button>
                       )}
                     </div>
                   </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-5 border-t-2 border-border bg-secondary/10 shrink-0">
          <div className="flex justify-between items-center mb-5">
            <span className="text-xl text-muted-foreground font-semibold">Total</span>
            <span className="text-4xl font-black tracking-tight">{total.toFixed(2)}€</span>
          </div>
          <button 
            onClick={handleSendOrder}
            disabled={!hasDrafts || sendOrder.isPending}
            className="w-full py-4 bg-primary text-primary-foreground text-xl font-black uppercase tracking-wider rounded-xl disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-[0_8px_20px_rgba(0,0,0,0.3)] hover:shadow-primary/30 hover:-translate-y-0.5"
          >
            {sendOrder.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send size={24} />}
            Enviar Comanda
          </button>

          {showCobrar && (
            <button
              onClick={() => setLocation(`/cobro/${actualOrderId}`)}
              className="w-full py-4 mt-3 bg-green-600 text-white text-xl font-black uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-[0_8px_20px_rgba(0,0,0,0.3)] hover:shadow-green-600/30 hover:-translate-y-0.5"
            >
              Cobrar
            </button>
          )}
          
          <div className="mt-4 text-center pb-2">
            <Link href="/tables" className="inline-block text-muted-foreground hover:text-foreground text-sm font-bold uppercase tracking-wider transition-colors border-b border-transparent hover:border-foreground pb-0.5">
              Volver al plano
            </Link>
          </div>
        </div>
      </div>

      <EditItemModal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        item={editingItem}
        tableId={tableId}
      />
    </div>
  );
}