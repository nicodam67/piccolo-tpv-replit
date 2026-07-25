import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { connectAuthenticatedSocket } from '../lib/socket-client';
import { toast } from 'sonner';
import {
  ChevronLeft, Trash2, Send, Clock, CheckCircle2, CircleDashed, Loader2, PenLine,
  Bell, Check, Plus, Minus, Receipt, Users, AlertTriangle, ChevronDown, Copy,
  FileText, RefreshCw, History, ChevronUp, Search, X as XIcon,
} from 'lucide-react';
import {
  useGetCategories,
  useGetCategoryProducts,
  useGetAdminProducts,
  useGetProductModifiers,
  useGetProductFormats,
  getGetCategoryProductsQueryKey,
  getGetAdminProductsQueryKey,
} from '@workspace/api-client-react/catalog-admin';
import type { Product, ProductFormat, ModifierGroup } from '@workspace/api-client-react/catalog-admin';
import {
  useGetTableOrder,
  useAddOrderItem,
  useDeleteOrderItem,
  useSendOrder,
  useGetUnreadNotifications,
  useMarkNotificationRead,
  useGetProductAvailability,
  getGetTableOrderQueryKey,
  getGetAllTablesQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetUnreadNotificationsQueryKey,
} from '@workspace/api-client-react';
import {
  useUpdateOrder,
  useUpdateOrderItem,
  useDuplicateOrderItem,
  useGetPrefacturaStatus,
  useGetOrderAudit,
  getGetPrefacturaStatusQueryKey,
  getGetOrderAuditQueryKey,
  type AuditLogEntry,
} from '@workspace/api-client-react/phase1';
import { EditItemModal } from '../components/EditItemModal';
import { EU_ALLERGENS, parseAllergens } from '../lib/allergens';
import { useScrollGuard } from '../hooks/use-scroll-guard';

// ── Allergen chips — small colored pills per allergen code ────────────────────
function AllergenChips({ allergens }: { allergens: string }) {
  const codes = parseAllergens(allergens);
  if (!codes.length) return null;
  return (
    <>
      {codes.map((code) => {
        const a = EU_ALLERGENS.find(x => x.code === code)!;
        return (
          <span
            key={code}
            title={a.label}
            className="font-black px-1 py-0.5 rounded text-[9px] leading-none"
            style={{ color: a.color, background: a.bg, border: `1px solid ${a.color}40` }}
          >
            {a.short}
          </span>
        );
      })}
    </>
  );
}

// ── Format Picker Modal ───────────────────────────────────────────────────────
interface FormatPickerProps {
  product: Product;
  formats: ProductFormat[];
  onSelect: (format: ProductFormat | null) => void;
  onCancel: () => void;
}

function FormatPickerModal({ product, formats, onSelect, onCancel }: FormatPickerProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border">
          <h2 className="font-black text-xl leading-tight">{product.name}</h2>
          <p className="text-muted-foreground text-sm mt-1 font-semibold">Elige un formato</p>
        </div>
        <div className="p-4 space-y-2">
          {/* Base option (no format) */}
          <button
            onClick={() => onSelect(null)}
            className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-secondary/30 transition-all active:scale-[0.98] text-left"
          >
            <span className="font-bold">Normal</span>
            <span className="font-mono text-muted-foreground font-semibold">{product.price}€</span>
          </button>
          {formats.map(f => (
            <button
              key={f.id}
              onClick={() => onSelect(f)}
              className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-secondary/30 transition-all active:scale-[0.98] text-left"
            >
              <span className="font-bold">{f.name}</span>
              <span className="font-mono text-muted-foreground font-semibold">{f.price}€</span>
            </button>
          ))}
        </div>
        <div className="px-4 pb-4">
          <button onClick={onCancel} className="w-full py-3 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors font-bold">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modifier Picker Modal ─────────────────────────────────────────────────────
interface ModifierPickerProps {
  product: Product;
  groups: ModifierGroup[];
  selectedFormat: ProductFormat | null;
  onConfirm: (modifiers: { modifierId: string; modifierName: string; priceDelta: string }[]) => void;
  onCancel: () => void;
}

function ModifierPickerModal({ product, groups, selectedFormat, onConfirm, onCancel }: ModifierPickerProps) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const toggle = (groupId: string, modId: string, maxSelect: number) => {
    setSelected(prev => {
      const curr = prev[groupId] ?? [];
      if (curr.includes(modId)) return { ...prev, [groupId]: curr.filter(x => x !== modId) };
      if (curr.length >= maxSelect) return { ...prev, [groupId]: [...curr.slice(1), modId] };
      return { ...prev, [groupId]: [...curr, modId] };
    });
  };

  const canConfirm = groups.every(g => !g.required || (selected[g.id]?.length ?? 0) > 0);

  const handleConfirm = () => {
    const mods: { modifierId: string; modifierName: string; priceDelta: string }[] = [];
    for (const g of groups) {
      for (const modId of (selected[g.id] ?? [])) {
        const opt = g.modifiers.find(m => m.id === modId);
        if (opt) mods.push({ modifierId: opt.id, modifierName: opt.name, priceDelta: opt.priceDelta });
      }
    }
    onConfirm(mods);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border">
          <h2 className="font-black text-xl leading-tight">{product.name}</h2>
          {selectedFormat && <p className="text-muted-foreground text-sm mt-0.5 font-semibold">{selectedFormat.name} · {selectedFormat.price}€</p>}
          <p className="text-muted-foreground text-sm mt-1 font-semibold">Modificadores</p>
        </div>
        <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
          {groups.map(g => (
            <div key={g.id}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-sm">{g.name}</span>
                {g.required && <span className="text-[10px] bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0.5 rounded font-black uppercase">Obligatorio</span>}
                {g.maxSelect > 1 && <span className="text-[10px] text-muted-foreground font-semibold">máx {g.maxSelect}</span>}
              </div>
              <div className="space-y-1">
                {g.modifiers.map(m => {
                  const isSelected = (selected[g.id] ?? []).includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggle(g.id, m.id, g.maxSelect)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all active:scale-[0.98] text-left ${isSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}
                    >
                      <span className="font-semibold text-sm">{m.name}</span>
                      <div className="flex items-center gap-2">
                        {parseFloat(m.priceDelta) !== 0 && (
                          <span className="text-xs text-muted-foreground font-mono">{parseFloat(m.priceDelta) > 0 ? '+' : ''}{m.priceDelta}€</span>
                        )}
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'border-primary bg-primary' : 'border-border'}`}>
                          {isSelected && <Check size={12} className="text-primary-foreground" strokeWidth={3} />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4 space-y-2">
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-black uppercase tracking-wider disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] transition-all"
          >
            Añadir
          </button>
          <button onClick={onCancel} className="w-full py-3 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors font-bold">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Order Page ───────────────────────────────────────────────────────────
export default function OrderPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const tableId = params.tableId!;

  const { onPointerDown: handlePointerDown, guard: guardedClick } = useScrollGuard();
  const itemsListRef = useRef<HTMLDivElement>(null);
  const savedItemsScrollRef = useRef(0);

  const [employeeId, setEmployeeId] = useState<string>('');
  const [employeeName, setEmployeeName] = useState<string>('');
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeAlert, setActiveAlert] = useState<any | null>(null);
  const [remotelyUpdated, setRemotelyUpdated] = useState(false);
  const [remoteUpdatedBy, setRemoteUpdatedBy] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(true);
  const suppressNextRefresh = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remotelyUpdatedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Format / modifier picker state
  const [formatPickerProduct, setFormatPickerProduct] = useState<Product | null>(null);
  const [modifierPickerState, setModifierPickerState] = useState<{ product: Product; format: ProductFormat | null } | null>(null);

  // Suppress stale banner when returning from background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        suppressNextRefresh.current = true;
        if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
        suppressTimeoutRef.current = setTimeout(() => { suppressNextRefresh.current = false; suppressTimeoutRef.current = null; }, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    const empStr = localStorage.getItem('employee');
    if (!empStr) { setLocation('/'); return; }
    try { const emp = JSON.parse(empStr); setEmployeeId(emp.id); setEmployeeName(emp.name); } catch {}
  }, [setLocation]);

  // When a different employee logs in on another tab (or the current tab after
  // a logout/login cycle that updates localStorage), keep the displayed name in
  // sync and discard any "remotely updated by <old-name>" banner that would now
  // be misleading.
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== 'employee') return;
      if (!e.newValue) {
        // Employee was cleared — treat as logged out and redirect.
        setLocation('/');
        return;
      }
      try {
        const emp = JSON.parse(e.newValue);
        setEmployeeId(emp.id);
        setEmployeeName(emp.name);
        // Discard any stale "updated by <previous-employee>" banner so the new
        // employee never sees a name that belongs to the previous session.
        setRemotelyUpdated(false);
        setRemoteUpdatedBy(null);
        if (remotelyUpdatedTimer.current) {
          clearTimeout(remotelyUpdatedTimer.current);
          remotelyUpdatedTimer.current = null;
        }
      } catch {}
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [setLocation]);

  const { data: tableData, isLoading: loadingTable } = useGetTableOrder(tableId, {
    query: { queryKey: getGetTableOrderQueryKey(tableId), refetchInterval: 15000 }
  });
  const table = tableData?.table;
  const order = tableData?.order;
  const actualOrderId = order?.id || (params.orderId !== 'current' ? params.orderId : undefined);

  const { data: notificationsData } = useGetUnreadNotifications({
    query: { enabled: !!employeeId, refetchInterval: 15000, queryKey: getGetUnreadNotificationsQueryKey() }
  });

  // Prefactura status — persistent, server-backed, updates on window focus
  const { data: prefacturaStatus, refetch: refetchPrefacturaStatus } = useGetPrefacturaStatus(actualOrderId ?? '', {
    query: {
      enabled: !!actualOrderId,
      queryKey: actualOrderId ? getGetPrefacturaStatusQueryKey(actualOrderId) : [],
      refetchOnWindowFocus: true,
    },
  });

  // Audit log — fetched lazily when the history panel is opened
  const { data: auditEntries = [] } = useGetOrderAudit(actualOrderId ?? '', {
    query: {
      enabled: showHistory && !!actualOrderId,
      queryKey: actualOrderId ? getGetOrderAuditQueryKey(actualOrderId) : [],
    },
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
    if (categories?.length && !activeCategoryId) setActiveCategoryId(categories[0].id);
  }, [categories, activeCategoryId]);

  const { data: products, isLoading: loadingProducts } = useGetCategoryProducts(activeCategoryId!, {
    query: { enabled: !!activeCategoryId, queryKey: activeCategoryId ? getGetCategoryProductsQueryKey(activeCategoryId) : [] }
  });

  // Global product search — loads all active products so we can search across categories
  const [productSearch, setProductSearch] = useState('');
  const searchQuery = productSearch.trim().toLowerCase();
  const { data: allProductsRaw = [] } = useGetAdminProducts({});
  const searchResults = useMemo(() => {
    if (!searchQuery) return null;
    return (allProductsRaw as any[]).filter(p =>
      p.active &&
      (p.name.toLowerCase().includes(searchQuery) || (p.internalCode ?? '').toLowerCase().includes(searchQuery))
    );
  }, [allProductsRaw, searchQuery]);

  // Stock availability: fetch once on mount so we can show a low-stock warning
  // on product buttons without blocking the sale.
  const { data: stockAvailability } = useGetProductAvailability();
  const lowStockProductIds = useMemo(() => {
    const s = new Set<string>();
    (stockAvailability ?? []).forEach(e => { if (e.lowStock) s.add(e.productId); });
    return s;
  }, [stockAvailability]);

  // Prefetch formats/modifiers for the picker when a product is selected
  const pickerProductId = (formatPickerProduct ?? modifierPickerState?.product)?.id ?? '';
  const { data: pickerFormats } = useGetProductFormats(
    pickerProductId,
    { query: { enabled: !!pickerProductId, queryKey: pickerProductId ? [`/api/products/${pickerProductId}/formats`] as const : [] } }
  );
  const modifierProductId = modifierPickerState?.product?.id ?? '';
  const { data: pickerModifiers } = useGetProductModifiers(
    modifierProductId,
    { query: { enabled: !!modifierProductId, queryKey: modifierProductId ? [`/api/products/${modifierProductId}/modifiers`] as const : [] } }
  );

  // Socket
  useEffect(() => {
    if (!order?.id && !employeeId) return;
    const socket = connectAuthenticatedSocket();

    // Track connection state for the reconnecting indicator.
    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    // After any reconnect, suppress the "remotely updated" banner (it's our own
    // reconnect) and re-fetch fresh data.
    const handleReconnect = () => {
      suppressNextRefresh.current = true;
      if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
      suppressTimeoutRef.current = setTimeout(() => { suppressNextRefresh.current = false; suppressTimeoutRef.current = null; }, 500);
      queryClient.invalidateQueries({ queryKey: getGetTableOrderQueryKey(tableId) });
      queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationsQueryKey() });
    };
    socket.on('reconnect', handleReconnect);

    if (order?.id) {
      socket.on('waiter:order-ready', (data: any) => {
        if (data.orderId === order.id) {
          toast.success(`¡Mesa ${data.tableName} lista para recoger!`, { duration: Infinity });
          try {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            if (Ctx) { const ctx = new Ctx(); const osc = ctx.createOscillator(); osc.connect(ctx.destination); osc.frequency.value = 880; osc.start(); osc.stop(ctx.currentTime + 0.5); }
          } catch {}
        }
      });
      socket.on('orders:refresh', (data: any) => {
        if (data?.orderId === order.id) {
          queryClient.invalidateQueries({ queryKey: getGetTableOrderQueryKey(tableId) });
          if (suppressNextRefresh.current) { suppressNextRefresh.current = false; }
          else {
            if (remotelyUpdatedTimer.current) clearTimeout(remotelyUpdatedTimer.current);
            setRemotelyUpdated(true); setRemoteUpdatedBy(data?.employeeName ?? null);
            remotelyUpdatedTimer.current = setTimeout(() => { setRemotelyUpdated(false); setRemoteUpdatedBy(null); }, 2000);
          }
        }
      });
    }
    if (employeeId) {
      socket.on(`waiter:${employeeId}:notification`, (data: any) => {
        setActiveAlert(data);
        queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationsQueryKey() });
        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
        setTimeout(() => setActiveAlert((curr: any) => curr?.id === data.id ? null : curr), 8000);
      });
    }

    // ── Application-level heartbeat ──────────────────────────────────────────
    // Send a custom ping every 60 s. If no pong arrives within 5 s we assume
    // the connection is silently dead and force a reconnect. This catches cases
    // where Socket.IO's transport-level ping/pong has stopped (e.g. after a
    // long idle overnight, a server restart, or token expiry).
    const HEARTBEAT_INTERVAL = 60_000;
    const HEARTBEAT_TIMEOUT  =  5_000;
    let pongTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const sendHeartbeat = () => {
      // Don't bother if the socket already knows it's disconnected.
      if (!socket.connected) return;

      // Arm a timeout; cancel it when pong arrives.
      pongTimeoutId = setTimeout(() => {
        // No pong — the connection is silently dead. Force a full reconnect and
        // re-fetch data so the page is fresh when the connection comes back.
        socket.disconnect();
        socket.connect();
        queryClient.invalidateQueries({ queryKey: getGetTableOrderQueryKey(tableId) });
      }, HEARTBEAT_TIMEOUT);

      socket.emit('ping');
    };

    const handlePong = () => {
      if (pongTimeoutId !== null) { clearTimeout(pongTimeoutId); pongTimeoutId = null; }
    };

    socket.on('pong', handlePong);
    const heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Also re-fetch whenever the tab becomes visible again after being hidden
    // (the socket may have been idle for a long time).
    const handleVisibilityResume = () => {
      if (!document.hidden) {
        // Always refresh unread notifications on foreground restore, regardless
        // of socket state — the badge must be up-to-date within a second.
        queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationsQueryKey() });
        if (socket.connected) {
          queryClient.invalidateQueries({ queryKey: getGetTableOrderQueryKey(tableId) });
        } else {
          socket.connect();
        }
        // Restore items list scroll position after data re-fetches
        const saved = savedItemsScrollRef.current;
        if (saved > 0) {
          requestAnimationFrame(() => {
            if (itemsListRef.current) itemsListRef.current.scrollTop = saved;
          });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityResume);

    return () => {
      clearInterval(heartbeatInterval);
      if (pongTimeoutId !== null) clearTimeout(pongTimeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityResume);
      socket.disconnect();
    };
  }, [order?.id, employeeId, queryClient, tableId]);

  const dismissAlert = () => { if (activeAlert?.id) handleMarkRead(activeAlert.id); setActiveAlert(null); };

  // Mutations
  const [sendIdempotencyKey, setSendIdempotencyKey] = useState(() => crypto.randomUUID());
  const addOrderItem = useAddOrderItem();
  const deleteOrderItem = useDeleteOrderItem();
  const sendOrder = useSendOrder({
    request: { headers: { 'Idempotency-Key': sendIdempotencyKey } },
  });
  const updateOrder = useUpdateOrder();
  const updateOrderItem = useUpdateOrderItem();
  const duplicateOrderItem = useDuplicateOrderItem();

  const invalidateOrder = () => {
    queryClient.invalidateQueries({ queryKey: getGetTableOrderQueryKey(tableId) });
  };

  // Warn once per order when staff modify after a prefactura was printed
  const prefacturaWarnedRef = useRef(false);
  const warnIfPrefacturaWasPrinted = () => {
    if (prefacturaStatus?.hasPrinted && !prefacturaWarnedRef.current) {
      prefacturaWarnedRef.current = true;
      toast.warning('La prefactura ya fue impresa — avisa al cliente del cambio', { duration: 5000 });
      // Reset flag after a while so next modification shows the warning again
      setTimeout(() => { prefacturaWarnedRef.current = false; }, 30_000);
    }
  };

  // Flow: tap product → check formats → check modifiers → addOrderItem
  const handleAddProduct = (product: Product) => {
    if (!actualOrderId) return;
    if (order?.status === 'bill_requested') {
      toast.error('Cuenta solicitada — cancela la solicitud antes de añadir más productos');
      return;
    }
    warnIfPrefacturaWasPrinted();
    // If product has formats, show format picker
    if (product.formats?.length) {
      setFormatPickerProduct(product);
      return;
    }
    // If product has modifiers, show modifier picker directly
    if (product.hasModifiers) {
      setModifierPickerState({ product, format: null });
      return;
    }
    // Plain add
    doAddItem(product.id, null, null, []);
  };

  const handleFormatSelected = (format: ProductFormat | null) => {
    if (!formatPickerProduct) return;
    const product = formatPickerProduct;
    setFormatPickerProduct(null);
    if (product.hasModifiers) {
      setModifierPickerState({ product, format });
    } else {
      doAddItem(product.id, format?.id ?? null, format?.name ?? null, []);
    }
  };

  const handleModifiersConfirmed = (modifiers: { modifierId: string; modifierName: string; priceDelta: string }[]) => {
    if (!modifierPickerState) return;
    const { product, format } = modifierPickerState;
    setModifierPickerState(null);
    doAddItem(product.id, format?.id ?? null, format?.name ?? null, modifiers);
  };

  const doAddItem = (
    productId: string,
    formatId: string | null,
    formatName: string | null,
    modifiers: { modifierId?: string; modifierName: string; priceDelta: string }[]
  ) => {
    if (!actualOrderId) return;
    suppressNextRefresh.current = true;
    addOrderItem.mutate(
      { orderId: actualOrderId, data: { productId, quantity: 1, formatId: formatId ?? undefined, modifiers } },
      {
        onSuccess: invalidateOrder,
        onError: () => { suppressNextRefresh.current = false; toast.error('No se pudo añadir el producto'); }
      }
    );
  };

  const handleDeleteItem = (itemId: string) => {
    warnIfPrefacturaWasPrinted();
    suppressNextRefresh.current = true;
    deleteOrderItem.mutate({ itemId }, {
      onSuccess: invalidateOrder,
      onError: () => { suppressNextRefresh.current = false; toast.error('No se pudo eliminar'); }
    });
  };

  const handleQtyChange = (itemId: string, delta: number, currentQty: number) => {
    const newQty = currentQty + delta;
    if (newQty <= 0) { handleDeleteItem(itemId); return; }
    warnIfPrefacturaWasPrinted();
    suppressNextRefresh.current = true;
    updateOrderItem.mutate({ itemId, data: { quantity: newQty } }, {
      onSuccess: invalidateOrder,
      onError: () => { suppressNextRefresh.current = false; }
    });
  };

  const handleDuplicate = (itemId: string) => {
    suppressNextRefresh.current = true;
    duplicateOrderItem.mutate({ itemId }, {
      onSuccess: invalidateOrder,
      onError: () => { suppressNextRefresh.current = false; }
    });
  };

  const handleSendOrder = () => {
    if (!actualOrderId) return;
    suppressNextRefresh.current = true;
    sendOrder.mutate({ orderId: actualOrderId }, {
      onSuccess: () => {
        setSendIdempotencyKey(crypto.randomUUID());
        invalidateOrder();
        queryClient.invalidateQueries({ queryKey: getGetAllTablesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast.success('Comanda enviada a preparación');
      },
      onError: () => { suppressNextRefresh.current = false; toast.error('Error al enviar la comanda'); }
    });
  };

  const handleRequestBill = () => {
    if (!actualOrderId) return;
    suppressNextRefresh.current = true;
    updateOrder.mutate({ orderId: actualOrderId, data: { status: 'bill_requested' } }, {
      onSuccess: () => {
        invalidateOrder();
        queryClient.invalidateQueries({ queryKey: getGetAllTablesQueryKey() });
        // Navigate to prefactura so staff can print the pre-bill before charging
        setLocation(`/prefactura/${actualOrderId}`);
      },
      onError: () => { suppressNextRefresh.current = false; toast.error('Error al solicitar la cuenta'); }
    });
  };

  const handleCancelBill = () => {
    if (!actualOrderId) return;
    suppressNextRefresh.current = true;
    updateOrder.mutate({ orderId: actualOrderId, data: { status: 'open' } }, {
      onSuccess: () => {
        invalidateOrder();
        queryClient.invalidateQueries({ queryKey: getGetAllTablesQueryKey() });
        toast.success('Solicitud de cuenta cancelada');
      },
      onError: () => { suppressNextRefresh.current = false; toast.error('Error al cancelar la cuenta'); }
    });
  };

  const handlePrintPrefactura = () => {
    if (!actualOrderId) return;
    // Navigate to prefactura WITHOUT changing the order status.
    // The comanda remains fully open and editable on return.
    setLocation(`/prefactura/${actualOrderId}`);
  };

  const allItems = order?.items || [];
  const draftItems = allItems.filter((i: any) => i.status === 'draft');
  const hasDrafts = draftItems.length > 0;
  const hasNonDraftItems = allItems.some((i: any) => i.status !== 'draft');
  const showCobrar = hasNonDraftItems && order?.status !== 'paid' && order?.status !== 'bill_requested';
  const showBillBadge = order?.status === 'bill_requested';

  const total = useMemo(() =>
    allItems.reduce((acc: number, item: any) => acc + (parseFloat(item.unitPrice) * item.quantity), 0),
    [allItems]
  );

  // Elapsed time for the table
  const elapsedStr = useMemo(() => {
    const openedAt = (table as any)?.openedAt;
    if (!openedAt) return '';
    const ms = Date.now() - new Date(openedAt).getTime();
    if (ms < 0) return '';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h${(mins % 60).toString().padStart(2, '0')}`;
  }, [table]);

  const guestCount = (order as any)?.guestCount ?? 1;

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

      {/* LEFT PANEL — CATEGORIES & PRODUCTS */}
      <div className="flex-1 flex flex-col h-full bg-background relative md:w-[60%]">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 border-b border-border bg-card shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <Link href="/tables" className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 border border-transparent hover:border-border">
              <ChevronLeft size={24} />
            </Link>
            <div>
              <h1 className="text-xl font-bold leading-none text-primary">
                {loadingTable ? 'Cargando...' : table?.name || 'Mesa...'}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{employeeName}</span>
                {elapsedStr && (
                  <span className="text-xs font-mono text-muted-foreground opacity-70 flex items-center gap-0.5">
                    <Clock size={10} /> {elapsedStr}
                  </span>
                )}
                {guestCount > 1 && (
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-0.5">
                    <Users size={10} /> {guestCount}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!socketConnected && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                Reconectando…
              </span>
            )}
            {showBillBadge && (
              <button
                onClick={handleCancelBill}
                disabled={updateOrder.isPending}
                className="px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-colors"
                title="Cancelar solicitud de cuenta"
              >
                <Receipt size={12} /> Cuenta ×
              </button>
            )}
            <div className="relative inline-block">
              <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                <Bell size={22} />
                {notificationsData && notificationsData.length > 0 && (
                  <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-card" />
                )}
              </button>
              {showNotifications && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-card border-2 border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-border bg-secondary/50 font-bold flex justify-between items-center">
                    <span>Notificaciones</span>
                    <div className="flex items-center gap-2">
                      {notificationsData && notificationsData.length > 1 && (
                        <button
                          onClick={() => notificationsData.forEach(n => handleMarkRead(n.id))}
                          className="text-xs text-muted-foreground hover:text-foreground font-normal"
                        >
                          Limpiar todo
                        </button>
                      )}
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">{notificationsData?.length || 0}</span>
                    </div>
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
          </div>
        </header>

        {/* Product search bar */}
        <div className="bg-card border-b border-border px-3 py-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar producto…"
              value={productSearch}
              autoFocus
              onChange={e => setProductSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {productSearch && (
              <button onClick={() => setProductSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <XIcon size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Categories Tabs — hidden while searching */}
        {!searchQuery && (
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
                      ? 'bg-background text-primary border-t-2 border-x border-primary/50 border-b-0 shadow-[0_-4px_10px_rgba(0,0,0,0.1)] relative z-10'
                      : 'text-muted-foreground hover:bg-secondary border-t-2 border-transparent border-b-0'
                  }`}
                >
                  {cat.name}
                </button>
              ))
            )}
          </div>
        )}

        {/* Bill-requested overlay — blocks product grid */}
        {order?.status === 'bill_requested' && (
          <div className="flex-1 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm z-10 relative gap-4 py-12">
            <Receipt size={48} className="text-blue-400 opacity-70" strokeWidth={1.5} />
            <div className="text-center">
              <p className="font-black text-xl text-foreground">Cuenta solicitada</p>
              <p className="text-muted-foreground text-sm mt-1 font-semibold">El cliente está esperando el cobro</p>
            </div>
            <button
              onClick={handleCancelBill}
              disabled={updateOrder.isPending}
              className="mt-2 px-5 py-2.5 rounded-xl border-2 border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive hover:bg-destructive/5 transition-colors font-bold text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {updateOrder.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Cancelar solicitud
            </button>
          </div>
        )}

        {/* Products Grid */}
        {order?.status !== 'bill_requested' && <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-background relative z-0">
          {searchQuery && searchResults !== null && (
            <>
              {searchResults.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-16">
                  <p>Sin resultados para "{productSearch}"</p>
                  <button onClick={() => setProductSearch('')} className="mt-2 text-primary font-semibold hover:underline">Borrar búsqueda</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                  {searchResults.map(p => {
                    const isAdding = addOrderItem.isPending && addOrderItem.variables?.data?.productId === p.id;
                    const isOutOfStock = p.outOfStock === true;
                    const hasLowStock = !isOutOfStock && lowStockProductIds.has(p.id);
                    const hasFormats = p.formats?.length > 0;
                    const hasModifiers = p.hasModifiers;
                    const allergens = p.allergens;
                    return (
                      <button
                        key={p.id}
                        onPointerDown={handlePointerDown}
                        onClick={guardedClick(() => {
                          if (isOutOfStock) return;
                          if (hasLowStock) {
                            const missing = stockAvailability?.find((e: any) => e.productId === p.id)?.zeroIngredients ?? [];
                            toast.warning(`⚠️ Stock bajo en: ${missing.join(', ') || 'ingredientes'}`, { duration: 3000 });
                          }
                          handleAddProduct(p as any);
                        })}
                        disabled={!actualOrderId || isAdding || isOutOfStock}
                        className={`bg-card border-2 rounded-2xl p-4 flex flex-col items-start text-left transition-all active:scale-[0.96] aspect-[4/3] justify-between group shadow-sm relative overflow-hidden
                          ${isAdding ? 'opacity-70' : ''}
                          ${isOutOfStock ? 'border-border opacity-50 cursor-not-allowed' : hasLowStock ? 'border-orange-500/40 hover:border-orange-500/60 hover:bg-orange-500/5' : 'border-border hover:border-primary/50 hover:bg-secondary/30'}
                        `}
                      >
                        {isOutOfStock && (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/40 rounded-2xl">
                            <span className="text-[10px] font-black uppercase tracking-widest bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg">Agotado</span>
                          </div>
                        )}
                        {hasLowStock && (
                          <div className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full bg-orange-500/20 border border-orange-500/40">
                            <AlertTriangle size={10} className="text-orange-400" />
                          </div>
                        )}
                        <span className="font-bold text-foreground text-lg leading-tight group-hover:text-primary transition-colors line-clamp-3">{p.name}</span>
                        <div className="flex w-full flex-col gap-1.5 mt-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            {hasFormats && <span className="text-[9px] font-black uppercase tracking-wider bg-secondary text-muted-foreground px-1.5 py-0.5 rounded flex items-center gap-0.5"><ChevronDown size={9} />Formato</span>}
                            {hasModifiers && <span className="text-[9px] font-black uppercase tracking-wider bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">+Mod</span>}
                            {allergens && <AllergenChips allergens={allergens} />}
                          </div>
                          <div className="flex w-full justify-between items-center">
                            <span className="font-mono text-muted-foreground font-semibold bg-secondary/50 px-2 py-1 rounded-md">{p.price}€</span>
                            {isAdding && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {!searchQuery && (loadingProducts ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {products?.map(p => {
                const isAdding = addOrderItem.isPending && addOrderItem.variables?.data?.productId === p.id;
                const isOutOfStock = (p as any).outOfStock === true;
                const hasLowStock = !isOutOfStock && lowStockProductIds.has(p.id);
                const hasFormats = (p as any).formats?.length > 0;
                const hasModifiers = p.hasModifiers;
                const allergens = (p as any).allergens;
                return (
                  <button
                    key={p.id}
                    onPointerDown={handlePointerDown}
                    onClick={guardedClick(() => {
                      if (isOutOfStock) return;
                      if (hasLowStock) {
                        const missing = stockAvailability?.find(e => e.productId === p.id)?.zeroIngredients ?? [];
                        toast.warning(`⚠️ Stock bajo en: ${missing.join(', ') || 'ingredientes'}`, { duration: 3000 });
                      }
                      handleAddProduct(p);
                    })}
                    disabled={!actualOrderId || isAdding || isOutOfStock}
                    className={`bg-card border-2 rounded-2xl p-4 flex flex-col items-start text-left transition-all active:scale-[0.96] aspect-[4/3] justify-between group shadow-sm relative overflow-hidden
                      ${isAdding ? 'opacity-70' : ''}
                      ${isOutOfStock ? 'border-border opacity-50 cursor-not-allowed' : hasLowStock ? 'border-orange-500/40 hover:border-orange-500/60 hover:bg-orange-500/5' : 'border-border hover:border-primary/50 hover:bg-secondary/30'}
                    `}
                  >
                    {/* Out of stock overlay */}
                    {isOutOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/40 rounded-2xl">
                        <span className="text-[10px] font-black uppercase tracking-widest bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg">Agotado</span>
                      </div>
                    )}
                    {/* Low stock warning badge */}
                    {hasLowStock && (
                      <div className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full bg-orange-500/20 border border-orange-500/40">
                        <AlertTriangle size={10} className="text-orange-400" />
                      </div>
                    )}
                    <span className="font-bold text-foreground text-lg leading-tight group-hover:text-primary transition-colors line-clamp-3">{p.name}</span>
                    <div className="flex w-full flex-col gap-1.5 mt-2">
                      {/* Indicators */}
                      <div className="flex items-center gap-1 flex-wrap">
                        {hasFormats && (
                          <span className="text-[9px] font-black uppercase tracking-wider bg-secondary text-muted-foreground px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <ChevronDown size={9} />Formato
                          </span>
                        )}
                        {hasModifiers && (
                          <span className="text-[9px] font-black uppercase tracking-wider bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">+Mod</span>
                        )}
                        {allergens && (
                          <AllergenChips allergens={allergens} />
                        )}
                      </div>
                      <div className="flex w-full justify-between items-center">
                        <span className="font-mono text-muted-foreground font-semibold bg-secondary/50 px-2 py-1 rounded-md">{p.price}€</span>
                        {isAdding && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>}
      </div>

      {/* RIGHT PANEL — TICKET / COMANDA */}
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

        {/* Items List */}
        <div ref={itemsListRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-card/50"
          onScroll={() => { savedItemsScrollRef.current = itemsListRef.current?.scrollTop ?? 0; }}>
          {allItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60">
              <CircleDashed size={48} className="mb-4" strokeWidth={1} />
              <span className="font-semibold text-lg uppercase tracking-widest">Comanda vacía</span>
            </div>
          ) : (
            allItems.map((item: any) => {
              const isDeleting = deleteOrderItem.isPending && deleteOrderItem.variables?.itemId === item.id;
              const isUpdating = updateOrderItem.isPending && updateOrderItem.variables?.itemId === item.id;
              const isDraft = item.status === 'draft';
              return (
                <div key={item.id} className={`flex flex-col bg-background p-4 rounded-xl border-2 transition-all
                  ${isDraft ? 'border-border shadow-sm' : item.status === 'sent' ? 'border-amber-500/30 shadow-[0_2px_8px_rgba(245,158,11,0.1)]' : 'border-green-500/30 shadow-[0_2px_8px_rgba(34,197,94,0.1)]'}
                  ${item.hasAllergy ? '!border-red-500/60' : ''}
                  ${(isDeleting || isUpdating) ? 'opacity-50 scale-95' : ''}
                  ${item.isInvitation ? 'ring-1 ring-purple-500/30' : ''}
                `}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {/* Quantity controls for draft items */}
                      {isDraft ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onPointerDown={handlePointerDown}
                            onClick={guardedClick(() => handleQtyChange(item.id, -1, item.quantity))}
                            disabled={isDeleting || isUpdating}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors active:scale-90 border border-border/60"
                          >
                            <Minus size={14} strokeWidth={2.5} />
                          </button>
                          <span className="font-black w-7 text-center tabular-nums text-base">{item.quantity}</span>
                          <button
                            onPointerDown={handlePointerDown}
                            onClick={guardedClick(() => handleQtyChange(item.id, +1, item.quantity))}
                            disabled={isDeleting || isUpdating}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors active:scale-90 border border-border/60"
                          >
                            <Plus size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      ) : (
                        <div className="bg-secondary text-secondary-foreground font-black w-8 h-8 rounded flex items-center justify-center shrink-0">
                          {item.quantity}
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-base leading-tight truncate">
                          {item.productName}
                          {item.isInvitation && <span className="ml-1.5 text-[10px] text-purple-400 font-black uppercase">Invit</span>}
                        </span>
                        {item.formatName && (
                          <span className="text-xs text-muted-foreground font-semibold">{item.formatName}</span>
                        )}
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {item.modifiers.map((m: any, i: number) => (
                              <span key={i} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{m.modifierName}</span>
                            ))}
                          </div>
                        )}
                        {item.hasAllergy && (
                          <div className="mt-1 bg-red-500/10 text-red-500 border border-red-500/30 px-2 py-0.5 rounded font-black text-[10px] uppercase tracking-widest inline-block w-fit">
                            ALERGIA {item.allergyNote && <span className="normal-case font-semibold lowercase">· {item.allergyNote}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-muted-foreground ml-2 shrink-0">
                      {(parseFloat(item.unitPrice) * item.quantity).toFixed(2)}€
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
                    {isDraft ? (
                      <span className="text-muted-foreground text-sm font-semibold flex items-center gap-1.5"><CircleDashed size={14} /> Sin enviar</span>
                    ) : item.status === 'sent' ? (
                      <span className="text-amber-500 text-sm font-semibold flex items-center gap-1.5"><Clock size={14} /> Preparando</span>
                    ) : (
                      <span className="text-green-500 text-sm font-semibold flex items-center gap-1.5"><CheckCircle2 size={14} /> Listo</span>
                    )}
                    <div className="flex gap-1">
                      {isDraft && (
                        <button
                          onPointerDown={handlePointerDown}
                          onClick={guardedClick(() => handleDuplicate(item.id))}
                          className="text-muted-foreground hover:bg-secondary hover:text-foreground p-1.5 rounded-lg transition-colors active:scale-90"
                          title="Duplicar"
                        >
                          <Copy size={16} />
                        </button>
                      )}
                      <button
                        onPointerDown={handlePointerDown}
                        onClick={guardedClick(() => setEditingItem(item))}
                        className="text-muted-foreground hover:bg-secondary hover:text-foreground p-1.5 rounded-lg transition-colors active:scale-90"
                      >
                        <PenLine size={16} />
                      </button>
                      {isDraft && (
                        <button
                          onPointerDown={handlePointerDown}
                          onClick={guardedClick(() => handleDeleteItem(item.id))}
                          disabled={isDeleting}
                          className="text-destructive hover:bg-destructive hover:text-destructive-foreground p-1.5 rounded-lg transition-colors active:scale-90"
                        >
                          {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t-2 border-border bg-secondary/10 shrink-0">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xl text-muted-foreground font-semibold">Total</span>
            <span className="text-4xl font-black tracking-tight">{total.toFixed(2)}€</span>
          </div>

          {/* Enviar comanda */}
          <button
            onClick={handleSendOrder}
            disabled={!hasDrafts || sendOrder.isPending}
            className="w-full py-4 bg-primary text-primary-foreground text-xl font-black uppercase tracking-wider rounded-xl disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-[0_8px_20px_rgba(0,0,0,0.3)] hover:shadow-primary/30 hover:-translate-y-0.5"
          >
            {sendOrder.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send size={22} />}
            Enviar Comanda
          </button>

          {/* Imprimir prefactura — does NOT change order status */}
          {hasNonDraftItems && order?.status !== 'paid' && (
            <button
              onClick={handlePrintPrefactura}
              className={`w-full py-3.5 mt-2.5 text-white text-lg font-black uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:-translate-y-0.5 ${prefacturaStatus?.hasPrinted ? 'bg-amber-600' : 'bg-blue-600'}`}
            >
              {prefacturaStatus?.hasPrinted ? <RefreshCw size={18} /> : <FileText size={18} />}
              {prefacturaStatus?.hasPrinted ? 'Reimprimir prefactura' : 'Imprimir prefactura'}
              {prefacturaStatus?.prefacturaCode && (
                <span className="ml-1 text-xs bg-white/20 px-2 py-0.5 rounded-md font-black">{prefacturaStatus.prefacturaCode}</span>
              )}
            </button>
          )}

          {/* Cobrar */}
          {showCobrar && (
            <button
              onClick={() => setLocation(`/cobro/${actualOrderId}`)}
              className="w-full py-3.5 mt-2.5 bg-green-600 text-white text-lg font-black uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:-translate-y-0.5"
            >
              Cobrar
            </button>
          )}

          {/* Bill requested state */}
          {order?.status === 'bill_requested' && (
            <button
              onClick={() => setLocation(`/cobro/${actualOrderId}`)}
              className="w-full py-3.5 mt-2.5 bg-green-600 text-white text-lg font-black uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:-translate-y-0.5"
            >
              Cobrar
            </button>
          )}

          {/* History toggle */}
          {actualOrderId && (
            <button
              onClick={() => setShowHistory(h => !h)}
              className="w-full mt-3 flex items-center justify-between px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors text-sm font-bold"
            >
              <span className="flex items-center gap-1.5"><History size={14} /> Historial</span>
              {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}

          {/* History timeline */}
          {showHistory && (
            <div className="mt-1 border border-border rounded-xl overflow-hidden">
              {auditEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4 font-semibold">Sin eventos registrados</p>
              ) : (
                <div className="divide-y divide-border max-h-64 overflow-y-auto">
                  {[...auditEntries].reverse().map((entry: AuditLogEntry) => {
                    const label: Record<string, string> = {
                      open_table: 'Mesa abierta',
                      add_item: 'Producto añadido',
                      cancel_item: 'Producto eliminado',
                      duplicate_item: 'Producto duplicado',
                      send_kds: 'Comanda enviada a cocina',
                      bill_request: 'Cuenta solicitada',
                      update_guests: 'Comensales actualizados',
                      print_prefactura: 'Prefactura impresa',
                      reprint_prefactura: 'Prefactura reimpresa',
                      modified_after_prefactura: 'Comanda modificada tras prefactura',
                      issue_ticket: 'Cuenta cobrada y cerrada',
                      bill_paid: 'Cuenta cobrada',
                    };
                    const color: Record<string, string> = {
                      print_prefactura: 'text-amber-500',
                      reprint_prefactura: 'text-amber-400',
                      modified_after_prefactura: 'text-orange-400',
                      issue_ticket: 'text-green-500',
                      bill_paid: 'text-green-500',
                      cancel_item: 'text-red-400',
                      send_kds: 'text-blue-400',
                    };
                    return (
                      <div key={entry.id} className="px-3 py-2 flex flex-col gap-0.5">
                        <span className={`text-xs font-black ${color[entry.action] ?? 'text-foreground'}`}>
                          {label[entry.action] ?? entry.action}
                        </span>
                        {entry.details && <span className="text-[10px] text-muted-foreground leading-tight">{entry.details}</span>}
                        <span className="text-[10px] text-muted-foreground/70">
                          {new Date(entry.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                          {entry.employeeName ? ` · ${entry.employeeName}` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 text-center pb-1">
            <Link href="/tables" className="inline-block text-muted-foreground hover:text-foreground text-sm font-bold uppercase tracking-wider transition-colors border-b border-transparent hover:border-foreground pb-0.5">
              Volver al plano
            </Link>
          </div>
        </div>
      </div>

      {/* Format Picker */}
      {formatPickerProduct && (
        <FormatPickerModal
          product={formatPickerProduct}
          formats={pickerFormats ?? []}
          onSelect={handleFormatSelected}
          onCancel={() => setFormatPickerProduct(null)}
        />
      )}

      {/* Modifier Picker */}
      {modifierPickerState && pickerModifiers && pickerModifiers.length > 0 && (
        <ModifierPickerModal
          product={modifierPickerState.product}
          groups={pickerModifiers}
          selectedFormat={modifierPickerState.format}
          onConfirm={handleModifiersConfirmed}
          onCancel={() => setModifierPickerState(null)}
        />
      )}

      <EditItemModal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        item={editingItem}
        tableId={tableId}
      />
    </div>
  );
}
