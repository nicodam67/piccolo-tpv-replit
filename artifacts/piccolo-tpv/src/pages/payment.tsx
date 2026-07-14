import React, { useState, useEffect, useCallback, useRef } from 'react';
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

// ── tap-slop guard ────────────────────────────────────────────────────────────
// Prevents accidental taps while scrolling: record pointer-down origin; if the
// finger/cursor moves more than TAP_SLOP pixels before release, suppress the click.
const TAP_SLOP = 8;

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toFixed(2); }
function parseAmt(s: string) { const n = parseFloat(s); return isNaN(n) ? 0 : n; }

function methodIcon(code: string) {
  if (code === 'cash')  return <Euro        className="w-5 h-5" />;
  if (code === 'card')  return <CreditCard  className="w-5 h-5" />;
  if (code === 'bizum') return <Smartphone  className="w-5 h-5" />;
  return <Euro className="w-5 h-5" />;
}

// ── PinKey — reliable touch feedback ─────────────────────────────────────────
function TouchBtn({
  children, onPress, className, disabled,
}: {
  children: React.ReactNode; onPress: () => void;
  className?: string; disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const down = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    setPressed(true);
    onPress();
  }, [onPress, disabled]);
  return (
    <button
      onPointerDown={down}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      disabled={disabled}
      style={{ touchAction: 'manipulation', userSelect: 'none' }}
      className={`${className} transition-all duration-75 ${pressed ? 'scale-95 brightness-75' : ''} disabled:opacity-40 disabled:pointer-events-none`}
    >
      {children}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Payment() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

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

  const { data: summary, isLoading } = useGetOrderPaymentSummary(orderId!, {
    query: { enabled: !!orderId, queryKey: getGetOrderPaymentSummaryQueryKey(orderId!) },
  });
  const addPayment = useAddPayment();

  // amounts keyed by method code
  const [amounts, setAmounts]       = useState<Record<string, string>>({});
  // which method the numpad is editing
  const [focused, setFocused]       = useState<string>('cash');
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting]  = useState(false);

  // initialise once summary loads
  const initialised = useRef(false);
  useEffect(() => {
    if (!summary || initialised.current) return;
    initialised.current = true;
    const init: Record<string, string> = {};
    for (const m of summary.methods) init[m.code] = '0';
    // pre-fill first method with remaining
    if (summary.methods[0]) {
      init[summary.methods[0].code] = summary.remaining;
      setFocused(summary.methods[0].code);
    }
    setAmounts(init);
  }, [summary]);

  if (isLoading || !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { order, items, subtotal, taxTotal, total, paid, remaining, methods, payments } = summary;
  const remainingNum = parseAmt(remaining);

  // derived totals
  const enteredTotal = Object.values(amounts).reduce((s, v) => s + parseAmt(v), 0);
  const focusedAmt   = parseAmt(amounts[focused] ?? '0');
  const leftover     = Math.max(0, remainingNum - enteredTotal + focusedAmt); // remaining once others are set

  // validation
  const nonZeroMethods = methods.filter(m => parseAmt(amounts[m.code] ?? '0') > 0);
  const hasChange      = focused === 'cash' && focusedAmt > leftover + 0.001;
  const changeAmt      = hasChange ? focusedAmt - leftover : 0;
  // non-cash cannot exceed their slice
  const nonCashOverflow = methods.some(m =>
    m.code !== 'cash' && parseAmt(amounts[m.code] ?? '0') > remainingNum + 0.001
  );
  // total entered (excl change) must be >= remaining
  const effectiveTotal = enteredTotal - changeAmt;
  const canSubmit = nonZeroMethods.length > 0 && effectiveTotal >= remainingNum - 0.01 && !nonCashOverflow;

  // ── numpad ────────────────────────────────────────────────────────────────
  const handleNumpad = useCallback((val: string) => {
    setAmounts(prev => {
      const cur = prev[focused] ?? '0';
      if (val === 'backspace') {
        const next = cur.slice(0, -1);
        return { ...prev, [focused]: next === '' ? '0' : next };
      }
      if (val === 'clear') {
        return { ...prev, [focused]: '0' };
      }
      if (val === 'resto') {
        // fill focused method with its share of remaining
        const others = Object.entries(prev)
          .filter(([k]) => k !== focused)
          .reduce((s, [, v]) => s + parseAmt(v), 0);
        const share = Math.max(0, remainingNum - others);
        return { ...prev, [focused]: fmt(share) };
      }
      if (val === '.') {
        if (cur.includes('.')) return prev;
        return { ...prev, [focused]: cur + '.' };
      }
      // number digit
      const base = cur === '0' ? val : cur + val;
      return { ...prev, [focused]: base };
    });
  }, [focused, remainingNum]);

  // ── submit ────────────────────────────────────────────────────────────────
  const submitAll = async () => {
    setSubmitting(true);
    let lastChange = 0;
    let lastRemaining = remainingNum;
    for (const m of methods) {
      const amtStr = amounts[m.code] ?? '0';
      if (parseAmt(amtStr) <= 0) continue;
      try {
        const res = await new Promise<{ change: string; newRemaining: number }>((resolve, reject) => {
          addPayment.mutate(
            { orderId: orderId!, data: { methodCode: m.code as AddPaymentInputMethodCode, amount: amtStr } },
            { onSuccess: resolve, onError: reject }
          );
        });
        lastChange    = parseFloat(res.change);
        lastRemaining = res.newRemaining;
      } catch {
        toast.error(`Error al cobrar ${m.name}`);
        setSubmitting(false);
        setShowConfirm(false);
        return;
      }
    }
    setSubmitting(false);
    setShowConfirm(false);
    queryClient.invalidateQueries({ queryKey: getGetOrderPaymentSummaryQueryKey(orderId!) });
    if (lastChange > 0) {
      toast.success(`Cobro completo. Cambio: ${fmt(lastChange)}€`);
    } else {
      toast.success('Cobro completo.');
    }
    setTimeout(() => setLocation(`/ticket/${orderId}`), 1600);
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col lg:flex-row min-h-[100dvh] bg-background text-foreground overflow-hidden">

      {/* ── LEFT: order summary ── */}
      <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-border bg-card lg:max-w-md xl:max-w-lg shrink-0 h-[38vh] lg:h-full">
        <div className="p-4 border-b border-border bg-secondary/30 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold leading-none text-primary">Cobro — {order.tableName}</h1>
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{order.employeeName}</span>
          </div>
          <Link href="/tables"
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
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
            <span>Subtotal</span><span>{parseFloat(subtotal).toFixed(2)}€</span>
          </div>
          <div className="flex justify-between text-muted-foreground font-semibold">
            <span>IVA (10%)</span><span>{parseFloat(taxTotal).toFixed(2)}€</span>
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
              <span className="font-mono text-xl font-black text-amber-400">{fmt(remainingNum)}€</span>
            </div>
          )}
          {payments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {payments.map(p => (
                <span key={p.id} className="bg-secondary/50 border border-border px-2 py-1 rounded-lg text-xs font-bold">
                  {p.methodName}: {parseFloat(p.amount).toFixed(2)}€
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: payment entry ── */}
      <div className="flex-1 flex flex-col h-[62vh] lg:h-full bg-background overflow-y-auto">

        {order.status === 'paid' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-24 h-24 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6">
              <Check className="w-12 h-12" strokeWidth={3} />
            </div>
            <h2 className="text-4xl font-black text-green-500 mb-8">¡COBRADO!</h2>
            <button onClick={() => setLocation(`/ticket/${orderId}`)}
              className="px-8 py-4 bg-primary text-primary-foreground text-xl font-black uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all shadow-lg">
              Ver Ticket
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-3 lg:p-6 gap-3 max-w-2xl mx-auto w-full">

            {/* ── Method cards — tap to focus ── */}
            <div className="flex gap-2 lg:gap-3">
              {methods.map(m => {
                const isFocused = focused === m.code;
                const amt = parseAmt(amounts[m.code] ?? '0');
                const isCash = m.code === 'cash';
                const over = !isCash && amt > remainingNum + 0.001;
                return (
                  <button
                    key={m.code}
                    onPointerDown={handlePointerDown}
                    onClick={guardedClick(() => setFocused(m.code))}
                    style={{ touchAction: 'manipulation' }}
                    className={`flex-1 rounded-xl border-2 px-2 py-3 lg:py-4 flex flex-col items-center gap-1 transition-all ${
                      isFocused
                        ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
                        : 'border-border bg-card hover:border-primary/40'
                    }`}
                  >
                    <div className={`${isFocused ? 'text-primary' : 'text-muted-foreground'}`}>
                      {methodIcon(m.code)}
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${isFocused ? 'text-primary' : 'text-muted-foreground'}`}>
                      {m.name}
                    </span>
                    <span className={`text-xl lg:text-2xl font-black font-mono ${
                      over ? 'text-destructive' : amt > 0 ? 'text-foreground' : 'text-muted-foreground/50'
                    }`}>
                      {fmt(amt)}€
                    </span>
                    {isCash && amt > 0 && amt > remainingNum - Object.entries(amounts).filter(([k]) => k !== 'cash').reduce((s, [, v]) => s + parseAmt(v), 0) + 0.001 && (
                      <span className="text-green-500 text-[10px] font-bold">cambio</span>
                    )}
                    {isFocused && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Running total bar ── */}
            <div className={`rounded-xl border-2 px-4 py-2 flex items-center justify-between ${
              canSubmit ? 'border-green-500/40 bg-green-500/5' : 'border-border bg-card'
            }`}>
              <div className="flex gap-4 items-center">
                {methods.filter(m => parseAmt(amounts[m.code] ?? '0') > 0).map(m => (
                  <span key={m.code} className="text-sm font-bold flex items-center gap-1">
                    {methodIcon(m.code)}
                    <span className="font-mono">{fmt(parseAmt(amounts[m.code]))}€</span>
                  </span>
                ))}
              </div>
              <div className="text-right">
                {canSubmit ? (
                  <span className="text-green-500 font-black text-sm">✓ Listo</span>
                ) : (
                  <span className="text-amber-400 font-bold text-sm">
                    Falta {fmt(Math.max(0, remainingNum - effectiveTotal))}€
                  </span>
                )}
              </div>
            </div>

            {/* ── Numpad ── */}
            <div className="grid grid-cols-4 gap-2 flex-1">
              {/* Quick shortcuts column */}
              <div className="flex flex-col gap-2">
                <TouchBtn onPress={() => handleNumpad('resto')}
                  className="flex-1 bg-primary/20 text-primary font-bold text-sm rounded-xl border border-primary/30 flex items-center justify-center min-h-[48px]">
                  Resto
                </TouchBtn>
                {(['5', '10', '20', '50'] as const).map(v => (
                  <TouchBtn key={v} onPress={() => setAmounts(prev => ({ ...prev, [focused]: v }))}
                    className="flex-1 bg-secondary text-foreground font-bold text-base rounded-xl border border-border min-h-[48px] flex items-center justify-center">
                    {v}€
                  </TouchBtn>
                ))}
              </div>

              {/* Digit grid */}
              <div className="col-span-3 grid grid-cols-3 gap-2">
                {['7','8','9','4','5','6','1','2','3','0','.','⌫'].map(btn => (
                  <TouchBtn key={btn}
                    onPress={() => handleNumpad(btn === '⌫' ? 'backspace' : btn)}
                    className="bg-card text-foreground text-2xl lg:text-3xl font-bold rounded-xl border-2 border-border shadow-sm flex items-center justify-center min-h-[52px] lg:min-h-[64px]">
                    {btn}
                  </TouchBtn>
                ))}
              </div>
            </div>

            {/* ── Cobrar button ── */}
            <TouchBtn
              onPress={() => setShowConfirm(true)}
              disabled={!canSubmit || submitting}
              className="w-full py-4 lg:py-5 bg-primary text-primary-foreground text-xl lg:text-2xl font-black uppercase tracking-wider rounded-xl shadow-[0_8px_20px_rgba(0,0,0,0.3)] flex items-center justify-center gap-3">
              {submitting
                ? <Loader2 className="w-6 h-6 animate-spin" />
                : <>COBRAR {fmt(Math.min(enteredTotal, enteredTotal))}€</>
              }
            </TouchBtn>

            <div className="text-center pb-4">
              <button onClick={() => window.history.back()}
                className="text-muted-foreground hover:text-foreground font-bold uppercase tracking-wider text-sm"
                style={{ touchAction: 'manipulation' }}>
                ← Volver a la comanda
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Confirmation dialog ── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-2xl font-black mb-4 text-center">Confirmar cobro</h3>

            <div className="space-y-2 mb-6">
              {methods.filter(m => parseAmt(amounts[m.code] ?? '0') > 0).map(m => (
                <div key={m.code} className="flex items-center justify-between bg-secondary/40 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {methodIcon(m.code)}
                    <span className="font-bold">{m.name}</span>
                  </div>
                  <span className="font-mono font-black text-lg">{fmt(parseAmt(amounts[m.code]))}€</span>
                </div>
              ))}
              {changeAmt > 0 && (
                <div className="flex items-center justify-between px-4 py-2 text-green-500">
                  <span className="font-bold">Cambio a devolver</span>
                  <span className="font-mono font-black">{fmt(changeAmt)}€</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-3 mt-2">
                <span className="font-bold text-muted-foreground">Total cobrado</span>
                <span className="font-black text-xl">{fmt(Math.min(enteredTotal, remainingNum + changeAmt))}€</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} disabled={submitting}
                className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl"
                style={{ touchAction: 'manipulation' }}>
                Cancelar
              </button>
              <button onClick={submitAll} disabled={submitting}
                className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2"
                style={{ touchAction: 'manipulation' }}>
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
