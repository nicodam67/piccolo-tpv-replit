import React, { useState, useEffect } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Check, Loader2, Euro, CreditCard, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetOrderPaymentSummary,
  useAddPayment,
  getGetOrderPaymentSummaryQueryKey,
  type AddPaymentInputMethodCode,
} from '@workspace/api-client-react';

export default function Payment() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: summary, isLoading } = useGetOrderPaymentSummary(orderId!, {
    query: {
      enabled: !!orderId,
      queryKey: getGetOrderPaymentSummaryQueryKey(orderId!),
    }
  });

  const addPayment = useAddPayment();

  const [selectedMethod, setSelectedMethod] = useState<AddPaymentInputMethodCode>('cash');
  const [amountStr, setAmountStr] = useState<string>('');
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (summary?.methods?.length && !amountStr) {
      const first = summary.methods[0].code as AddPaymentInputMethodCode;
      setSelectedMethod(first);
    }
    if (summary?.remaining && !amountStr) {
      setAmountStr(summary.remaining);
    }
  }, [summary]);

  if (isLoading || !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { order, items, subtotal, taxTotal, total, paid, remaining, methods, payments } = summary;
  const remainingNum = parseFloat(remaining) || 0;
  const amountNum = parseFloat(amountStr) || 0;

  const isCash = selectedMethod === 'cash';
  const isOverRemaining = amountNum > remainingNum + 0.001;
  const isInvalidAmount = amountNum <= 0 || (!isCash && isOverRemaining);

  const handleNumpad = (val: string) => {
    if (val === 'clear') {
      setAmountStr(remaining);
    } else if (val === 'backspace') {
      setAmountStr(prev => prev.slice(0, -1) || '');
    } else if (val === '.') {
      if (!amountStr.includes('.')) setAmountStr(prev => prev + '.');
    } else {
      // If current value equals remaining exactly, start fresh
      if (amountStr === remaining) {
        setAmountStr(val);
      } else {
        setAmountStr(prev => prev + val);
      }
    }
  };

  const getMethodIcon = (code: string) => {
    switch (code) {
      case 'cash': return <Euro className="w-6 h-6" />;
      case 'card': return <CreditCard className="w-6 h-6" />;
      case 'bizum': return <Smartphone className="w-6 h-6" />;
      default: return <Euro className="w-6 h-6" />;
    }
  };

  const getMethodName = (code: string) => methods.find(m => m.code === code)?.name || code;

  const submitPayment = () => {
    addPayment.mutate(
      { orderId: orderId!, data: { methodCode: selectedMethod, amount: amountStr } },
      {
        onSuccess: (res) => {
          setShowConfirm(false);
          queryClient.invalidateQueries({ queryKey: getGetOrderPaymentSummaryQueryKey(orderId!) });

          const changeNum = parseFloat(res.change);
          if (res.newRemaining <= 0) {
            if (isCash && changeNum > 0) {
              toast.success(`Cobro completo. Cambio: ${changeNum.toFixed(2)}€`);
            } else {
              toast.success('Cobro completo. Ticket emitido.');
            }
            setTimeout(() => setLocation(`/ticket/${orderId}`), 2000);
          } else {
            toast.success(`Cobrado ${amountNum.toFixed(2)}€`);
            setAmountStr(res.newRemaining.toFixed(2));
          }
        },
        onError: () => toast.error('Error al procesar el cobro'),
      }
    );
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-[100dvh] bg-background text-foreground overflow-hidden">

      {/* LEFT PANEL — SUMMARY */}
      <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-border bg-card lg:max-w-md xl:max-w-lg shrink-0 h-[40vh] lg:h-full">
        <div className="p-4 border-b border-border bg-secondary/30 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold leading-none text-primary">Cobro — {order.tableName}</h1>
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{order.employeeName}</span>
          </div>
          <Link href="/tables" className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95">
            <ChevronLeft size={24} />
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-3">
                <span className="font-bold text-muted-foreground">{item.quantity}×</span>
                <span className="font-semibold">{item.productName}</span>
              </div>
              <span className="font-mono">{parseFloat(item.lineTotal).toFixed(2)}€</span>
            </div>
          ))}
        </div>

        <div className="p-4 bg-secondary/20 border-t border-border shrink-0 space-y-2">
          <div className="flex justify-between text-muted-foreground font-semibold">
            <span>Subtotal</span>
            <span>{parseFloat(subtotal).toFixed(2)}€</span>
          </div>
          <div className="flex justify-between text-muted-foreground font-semibold">
            <span>IVA (10%)</span>
            <span>{parseFloat(taxTotal).toFixed(2)}€</span>
          </div>
          <div className="flex justify-between items-end mt-2 pt-2 border-t border-border">
            <span className="text-xl font-bold">TOTAL</span>
            <span className="text-3xl font-black">{parseFloat(total).toFixed(2)}€</span>
          </div>
          {parseFloat(paid) > 0 && (
            <div className="flex justify-between text-green-500 font-semibold text-sm pt-1">
              <span>Pagado</span>
              <span className="font-mono">{parseFloat(paid).toFixed(2)}€</span>
            </div>
          )}
          {remainingNum > 0 && (
            <div className="flex justify-between items-center pt-1 border-t border-border/60">
              <span className="font-bold text-amber-400 uppercase text-sm">Pendiente</span>
              <span className="font-mono text-xl font-black text-amber-400">{remainingNum.toFixed(2)}€</span>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL — PAYMENT ENTRY */}
      <div className="flex-1 flex flex-col h-[60vh] lg:h-full bg-background relative overflow-y-auto">
        {order.status === 'paid' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-24 h-24 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6">
              <Check className="w-12 h-12" strokeWidth={3} />
            </div>
            <h2 className="text-4xl font-black text-green-500 mb-8">¡COBRADO!</h2>
            <button onClick={() => setLocation(`/ticket/${orderId}`)}
              className="px-8 py-4 bg-primary text-primary-foreground text-xl font-black uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all shadow-lg hover:shadow-primary/30">
              Ver Ticket
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-4 lg:p-8 max-w-2xl mx-auto w-full">

            {/* Payment Methods */}
            <div className="flex gap-2 lg:gap-4 mb-6">
              {methods.map(m => {
                const isActive = selectedMethod === m.code;
                return (
                  <button key={m.code}
                    onClick={() => setSelectedMethod(m.code as AddPaymentInputMethodCode)}
                    className={`flex-1 py-4 lg:py-6 rounded-xl flex flex-col items-center justify-center gap-2 border-2 transition-all font-bold text-lg ${
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary shadow-lg'
                        : 'bg-card text-muted-foreground border-border hover:bg-secondary'
                    }`}>
                    {getMethodIcon(m.code)}
                    {m.name}
                  </button>
                );
              })}
            </div>

            {/* Amount Display */}
            <div className="bg-card border-2 border-border rounded-xl p-4 lg:p-6 mb-6 text-right shadow-inner flex flex-col items-end">
              <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">A cobrar</span>
              <div className="text-5xl lg:text-6xl font-black tracking-tighter">
                {amountStr || '0'}€
              </div>
              {!isCash && isOverRemaining && (
                <span className="text-destructive font-bold text-sm mt-2">⚠ Excede el pendiente ({remainingNum.toFixed(2)}€)</span>
              )}
              {isCash && amountNum > remainingNum + 0.001 && (
                <span className="text-green-500 font-bold text-sm mt-2">Cambio: {(amountNum - remainingNum).toFixed(2)}€</span>
              )}
            </div>

            {/* Quick Amounts & Numpad */}
            <div className="grid grid-cols-4 gap-2 lg:gap-3 mb-6">
              <div className="col-span-1 flex flex-col gap-2 lg:gap-3">
                {[remaining, '5', '10', '20', '50'].map(v => (
                  <button key={v} onClick={() => setAmountStr(v)}
                    className="flex-1 bg-secondary text-foreground font-bold text-base rounded-xl border border-border hover:bg-secondary/80 active:scale-95 transition-all min-h-[48px]">
                    {v === remaining ? 'Resto' : `${v}€`}
                  </button>
                ))}
              </div>
              <div className="col-span-3 grid grid-cols-3 gap-2 lg:gap-3">
                {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '⌫'].map(btn => (
                  <button key={btn}
                    onClick={() => handleNumpad(btn === '⌫' ? 'backspace' : btn)}
                    className="bg-card text-foreground text-3xl font-bold rounded-xl border-2 border-border shadow-sm hover:bg-secondary active:scale-95 transition-all flex items-center justify-center min-h-[60px] lg:min-h-[72px]">
                    {btn}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowConfirm(true)}
              disabled={isInvalidAmount || addPayment.isPending}
              className="w-full py-5 lg:py-6 bg-primary text-primary-foreground text-2xl lg:text-3xl font-black uppercase tracking-wider rounded-xl disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] transition-all shadow-[0_8px_20px_rgba(0,0,0,0.3)] hover:shadow-primary/30">
              COBRAR {amountNum > 0 ? `${amountNum.toFixed(2)}€` : ''}
            </button>

            {/* Existing Payments */}
            {payments.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-3">Pagos realizados</h3>
                <div className="flex flex-wrap gap-2">
                  {payments.map(p => (
                    <div key={p.id} className="bg-secondary/50 border border-border px-3 py-1.5 rounded-lg text-sm font-bold">
                      {p.methodName}: <span className="font-mono">{parseFloat(p.amount).toFixed(2)}€</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 text-center pb-8">
              <button onClick={() => window.history.back()}
                className="text-muted-foreground hover:text-foreground font-bold uppercase tracking-wider text-sm border-b border-transparent hover:border-foreground transition-all">
                ← Volver a la comanda
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-black mb-2 text-center">Confirmar cobro</h3>
            <p className="text-lg text-center text-muted-foreground mb-6">
              ¿Confirmar cobro de{' '}
              <span className="font-black text-foreground">{amountNum.toFixed(2)}€</span>{' '}
              en{' '}
              <span className="font-black text-foreground">{getMethodName(selectedMethod)}</span>?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} disabled={addPayment.isPending}
                className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl active:scale-95 transition-all">
                Cancelar
              </button>
              <button onClick={submitPayment} disabled={addPayment.isPending}
                className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2">
                {addPayment.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
