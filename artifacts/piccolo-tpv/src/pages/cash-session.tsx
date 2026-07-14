import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Loader2, Euro, ArrowUpRight, ArrowDownRight, Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetCurrentCashSession,
  useOpenCashSession,
  useAddCashMovement,
  useCloseCashSession,
  useGetCashSessionSummary,
  getGetCurrentCashSessionQueryKey,
  getGetCashSessionSummaryQueryKey,
} from '@workspace/api-client-react';

export default function CashSession() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [employeeName, setEmployeeName] = useState<string>('');
  useEffect(() => {
    const empStr = localStorage.getItem("employee");
    if (empStr) {
      try { setEmployeeName(JSON.parse(empStr).name); } catch (_) {}
    }
  }, []);

  const { data: session, isLoading: loadingSession } = useGetCurrentCashSession({
    query: { queryKey: getGetCurrentCashSessionQueryKey() }
  });

  const { data: summary, isLoading: loadingSummary } = useGetCashSessionSummary(
    session?.id || '',
    {
      query: {
        enabled: !!session?.id,
        queryKey: getGetCashSessionSummaryQueryKey(session?.id || ''),
      }
    }
  );

  const openSession  = useOpenCashSession();
  const addMovement  = useAddCashMovement();
  const closeSession = useCloseCashSession();

  const [openingFloat,    setOpeningFloat]    = useState<string>('100');
  const [movType,         setMovType]         = useState<'in' | 'out'>('in');
  const [movAmount,       setMovAmount]       = useState<string>('');
  const [movReason,       setMovReason]       = useState<string>('');
  const [countedCash,     setCountedCash]     = useState<string>('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closedDiff,      setClosedDiff]      = useState<string | null>(null);

  if (loadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // --- CLOSED STATE ---
  if (closedDiff !== null) {
    const diffNum = parseFloat(closedDiff);
    const isOk = diffNum >= 0;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${isOk ? 'bg-green-500/20 text-green-500' : 'bg-destructive/20 text-destructive'}`}>
          {isOk ? <CheckCircle2 size={48} /> : <AlertCircle size={48} />}
        </div>
        <h2 className="text-3xl font-black mb-4">Caja Cerrada</h2>
        <div className="text-xl text-muted-foreground mb-8">
          Diferencia:{' '}
          <span className={`font-mono font-black ${isOk ? 'text-green-500' : 'text-destructive'}`}>
            {diffNum > 0 ? '+' : ''}{diffNum.toFixed(2)}€
          </span>
        </div>
        <button onClick={() => setLocation('/tables')}
          className="px-8 py-4 bg-primary text-primary-foreground font-black text-xl rounded-xl shadow-lg hover:shadow-primary/30 active:scale-[0.98] transition-all">
          Volver a mesas
        </button>
      </div>
    );
  }

  // --- NO SESSION (Open Form) ---
  if (!session) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-background">
        <header className="h-16 flex items-center px-4 border-b border-border bg-card shrink-0">
          <button onClick={() => setLocation('/tables')}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold ml-4">Gestión de Caja</h1>
        </header>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-card border-2 border-border rounded-2xl p-6 lg:p-8 max-w-md w-full shadow-2xl text-center">
            <div className="w-20 h-20 bg-primary/20 text-primary mx-auto rounded-full flex items-center justify-center mb-6">
              <Wallet size={40} />
            </div>
            <h2 className="text-3xl font-black mb-6">Apertura de Caja</h2>

            <div className="mb-8 text-left">
              <label className="block text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">Fondo inicial (€)</label>
              <input
                type="number" step="0.01" min="0"
                value={openingFloat}
                onChange={e => setOpeningFloat(e.target.value)}
                className="w-full bg-background border-2 border-border rounded-xl px-4 py-4 text-3xl font-black font-mono text-center focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <button
              disabled={openSession.isPending || parseFloat(openingFloat) < 0}
              onClick={() => {
                openSession.mutate(
                  { data: { openingFloat } },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: getGetCurrentCashSessionQueryKey() });
                      toast.success('Caja abierta correctamente');
                    },
                    onError: () => toast.error('Error al abrir la caja'),
                  }
                );
              }}
              className="w-full py-4 lg:py-5 bg-primary text-primary-foreground text-xl lg:text-2xl font-black uppercase tracking-wider rounded-xl disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] transition-all shadow-[0_8px_20px_rgba(0,0,0,0.3)] flex justify-center items-center gap-2"
            >
              {openSession.isPending ? <Loader2 className="animate-spin w-8 h-8" /> : 'Abrir Caja'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- OPEN SESSION ---

  const handleAddMovement = () => {
    const amountNum = parseFloat(movAmount);
    if (!amountNum || amountNum <= 0) { toast.error("Importe inválido"); return; }
    if (movReason.length < 3) { toast.error("Indica un motivo válido"); return; }

    addMovement.mutate(
      { id: session.id, data: { movementType: movType, amount: movAmount, reason: movReason } },
      {
        onSuccess: () => {
          setMovAmount('');
          setMovReason('');
          queryClient.invalidateQueries({ queryKey: getGetCashSessionSummaryQueryKey(session.id) });
          toast.success("Movimiento registrado");
        },
        onError: () => toast.error("Error al registrar movimiento"),
      }
    );
  };

  // Compute expected cash from summary data (opening + cash sales + movIn - movOut)
  const cashTotal = parseFloat(
    summary?.salesByMethod.find(m => m.methodCode === 'cash')?.total ?? '0'
  );
  const movIn  = summary?.movements.filter(m => m.movementType === 'in').reduce((a, m) => a + parseFloat(m.amount), 0) ?? 0;
  const movOut = summary?.movements.filter(m => m.movementType === 'out').reduce((a, m) => a + parseFloat(m.amount), 0) ?? 0;
  const expectedCash = parseFloat(session.openingFloat) + cashTotal + movIn - movOut;

  const countedNum = parseFloat(countedCash) || 0;
  const difference = countedNum - expectedCash;

  const handleCloseSession = () => {
    if (!countedCash) { toast.error("Introduce el efectivo contado"); return; }
    setShowCloseConfirm(true);
  };

  const confirmCloseSession = () => {
    closeSession.mutate(
      { id: session.id, data: { countedCash } },
      {
        onSuccess: (res) => {
          setShowCloseConfirm(false);
          setClosedDiff(res.difference ?? '0');
          queryClient.invalidateQueries({ queryKey: getGetCurrentCashSessionQueryKey() });
        },
        onError: () => toast.error("Error al cerrar caja"),
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background overflow-hidden relative">
      {/* HEADER */}
      <header className="h-16 flex items-center px-4 lg:px-6 border-b border-border bg-card shrink-0 justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => setLocation('/tables')}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 border border-transparent hover:border-border">
            <ChevronLeft size={24} />
          </button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold leading-none">Caja</h1>
              <span className="bg-green-500/20 text-green-500 border border-green-500/30 px-2 py-0.5 rounded text-xs font-black uppercase tracking-widest">Abierta</span>
            </div>
            <span className="text-xs text-muted-foreground font-semibold mt-1">
              Abierta por {(session as any).employeeName || employeeName} · Fondo: {parseFloat(session.openingFloat).toFixed(2)}€
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto w-full">

        {/* LEFT: Movements */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <h2 className="text-lg font-black uppercase tracking-wider mb-5 flex items-center gap-2">
              <Euro className="text-primary" /> Registrar Movimiento
            </h2>

            <div className="flex gap-2 mb-4 p-1 bg-secondary rounded-xl">
              <button onClick={() => setMovType('in')}
                className={`flex-1 py-3 rounded-lg font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${movType === 'in' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                <ArrowUpRight size={18} className={movType === 'in' ? 'text-green-500' : ''} /> Entrada
              </button>
              <button onClick={() => setMovType('out')}
                className={`flex-1 py-3 rounded-lg font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${movType === 'out' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                <ArrowDownRight size={18} className={movType === 'out' ? 'text-destructive' : ''} /> Salida
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">Importe (€)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={movAmount} onChange={e => setMovAmount(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-4 text-xl font-mono focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">Motivo</label>
                <textarea rows={2} placeholder="Ej. Cambio, Pago a proveedor..."
                  value={movReason} onChange={e => setMovReason(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-base focus:outline-none focus:border-primary transition-colors resize-none"
                />
              </div>
              <button onClick={handleAddMovement}
                disabled={addMovement.isPending || !movAmount || movReason.length < 3}
                className="w-full py-4 bg-secondary text-secondary-foreground text-lg font-black uppercase tracking-wider rounded-xl disabled:opacity-50 hover:bg-primary hover:text-primary-foreground active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                {addMovement.isPending ? <Loader2 className="animate-spin w-5 h-5" /> : 'Registrar'}
              </button>
            </div>
          </div>

          {/* Movement history */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex-1 flex flex-col min-h-[200px]">
            <h2 className="text-lg font-black uppercase tracking-wider mb-4 text-muted-foreground">Historial</h2>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {loadingSummary ? (
                <div className="flex justify-center p-4"><Loader2 className="animate-spin text-muted-foreground" /></div>
              ) : summary?.movements && summary.movements.length > 0 ? (
                summary.movements.map((m, i) => (
                  <div key={i} className="bg-background border border-border rounded-xl p-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.movementType === 'in' ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}`}>
                        {m.movementType === 'in' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                      </div>
                      <span className="font-semibold text-sm line-clamp-1">{m.reason}</span>
                    </div>
                    <span className={`font-mono font-bold ${m.movementType === 'in' ? 'text-green-500' : 'text-destructive'}`}>
                      {m.movementType === 'in' ? '+' : '-'}{parseFloat(m.amount).toFixed(2)}€
                    </span>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground opacity-60 text-sm font-semibold uppercase">Sin movimientos</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Summary & Close */}
        <div className="flex-1 flex flex-col gap-6 lg:max-w-md">
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <h2 className="text-lg font-black uppercase tracking-wider mb-4">Resumen de Ventas</h2>
            {loadingSummary ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
            ) : (
              <div className="space-y-3">
                {['cash', 'card', 'bizum'].map(code => {
                  const found = summary?.salesByMethod.find(m => m.methodCode === code);
                  const labels: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', bizum: 'Bizum' };
                  return (
                    <div key={code} className="flex justify-between items-center bg-background border border-border p-3 rounded-xl">
                      <span className="font-bold text-muted-foreground">{labels[code]}</span>
                      <span className="font-mono text-lg font-black">{parseFloat(found?.total ?? '0').toFixed(2)}€</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-card border border-border border-t-4 border-t-primary rounded-2xl p-5 shadow-sm flex-1 flex flex-col justify-end">
            <h2 className="text-xl font-black uppercase tracking-wider mb-6">Cierre de Caja</h2>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-muted-foreground uppercase">Efectivo esperado</span>
                <span className="font-mono text-xl font-black">{expectedCash.toFixed(2)}€</span>
              </div>

              <div>
                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">Efectivo contado (€)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={countedCash} onChange={e => setCountedCash(e.target.value)}
                  className="w-full bg-background border-2 border-border rounded-xl px-4 py-4 text-2xl font-mono text-right focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              {countedCash !== '' && (
                <div className="flex justify-between items-center pt-2">
                  <span className="text-sm font-bold text-muted-foreground uppercase">Diferencia</span>
                  <span className={`font-mono text-xl font-black ${difference >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                    {difference > 0 ? '+' : ''}{difference.toFixed(2)}€
                  </span>
                </div>
              )}
            </div>

            <button onClick={handleCloseSession}
              disabled={countedCash === '' || closeSession.isPending}
              className="w-full py-5 bg-destructive text-destructive-foreground text-xl font-black uppercase tracking-wider rounded-xl disabled:opacity-50 hover:bg-destructive/90 active:scale-[0.98] transition-all shadow-[0_4px_14px_rgba(0,0,0,0.2)] flex justify-center items-center gap-2">
              Cerrar Caja
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-black mb-2 text-center">Confirmar Cierre</h3>
            <p className="text-lg text-center text-muted-foreground mb-6">
              ¿Estás seguro de que quieres cerrar la caja?<br/>
              <span className="text-sm">Esta acción no se puede deshacer.</span>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowCloseConfirm(false)} disabled={closeSession.isPending}
                className="flex-1 py-4 bg-secondary text-foreground font-bold rounded-xl active:scale-95 transition-all text-lg">
                Cancelar
              </button>
              <button onClick={confirmCloseSession} disabled={closeSession.isPending}
                className="flex-1 py-4 bg-destructive text-destructive-foreground font-bold rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 text-lg">
                {closeSession.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sí, Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
