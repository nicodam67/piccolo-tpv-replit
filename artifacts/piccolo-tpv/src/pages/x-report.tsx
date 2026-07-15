import React, { useRef, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { ChevronLeft, Printer, FileDown, Loader2, Wallet, TrendingUp, TrendingDown, Receipt, AlertTriangle, RefreshCw } from 'lucide-react';
import { useGetCashSessionXReport } from '@workspace/api-client-react';
import type { ZReport, TaxBreakdownItem } from '@workspace/api-client-react';

function fmt(n: number | string) { return parseFloat(String(n)).toFixed(2); }
function fmtDate(d: string) {
  return new Date(d).toLocaleString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', bizum: 'Bizum',
  transfer: 'Transferencia', cheque_rest: 'Cheque restaurante',
  invitation: 'Invitación', other: 'Otro',
};

const MOVEMENT_LABELS: Record<string, string> = {
  in: 'Entrada de efectivo', out: 'Retirada de efectivo',
  supplier_payment: 'Pago a proveedor', tip: 'Propina',
  change_added: 'Cambio añadido', correction: 'Corrección autorizada',
};

const CASH_IN_TYPES = ['in', 'tip', 'change_added', 'correction'];

export default function XReport() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [, setLocation] = useLocation();
  const printRef = useRef<HTMLDivElement>(null);

  const { data: report, isLoading, refetch } = useGetCashSessionXReport(sessionId!, {
    query: { enabled: !!sessionId, queryKey: [`/api/cash-sessions/${sessionId}/x-report`] as const },
  });

  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) void refetch(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refetch]);

  const handlePrint = () => { window.print(); };

  const handlePdf = () => {
    const el = document.createElement('style');
    el.setAttribute('id', '__pdf-override');
    el.textContent = `@media print { @page { size: A4; margin: 20mm; } body > * { display: none !important; } #x-report-printable { display: block !important; } }`;
    document.head.appendChild(el);
    window.print();
    setTimeout(() => el.remove(), 800);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-4 text-center">
        <AlertTriangle size={36} className="text-destructive" />
        <p className="text-muted-foreground text-sm">No se pudo cargar el informe X</p>
        <button onClick={() => void refetch()} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl text-sm">
          <RefreshCw size={14} /> Reintentar
        </button>
      </div>
    );
  }

  const typedReport = report as ZReport;
  const { session, salesByMethod, movements, tips, voids, totalSales, totalTips, movIn, movOut, paymentsCount } = typedReport;
  const taxBreakdown: TaxBreakdownItem[] = typedReport.taxBreakdown ?? [];
  const totalSalesNum = parseFloat(totalSales);
  const totalTipsNum = parseFloat(totalTips);
  const movInNum = parseFloat(movIn);
  const movOutNum = parseFloat(movOut);
  const openingFloatNum = parseFloat(session.openingFloat);

  const cashRow = salesByMethod.find(m => m.methodCode === 'cash');
  const cashSales = parseFloat(cashRow?.total ?? '0');
  const expectedCash = (session as any).expectedCash
    ?? (openingFloatNum + cashSales + movInNum - movOutNum).toFixed(2);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <style>{`
        @media print {
          nav, header, .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .print-bg { background: white !important; color: black !important; }
          .print-border { border-color: #ccc !important; }
        }
      `}</style>

      {/* HEADER */}
      <header className="h-16 flex items-center px-4 border-b border-border bg-card shrink-0 justify-between no-print">
        <div className="flex items-center gap-4">
          <button onClick={() => setLocation('/caja')}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors active:scale-95">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">Informe X — {session.terminalName || 'Caja'}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void refetch()}
            className="flex items-center gap-2 px-3 py-2 bg-secondary text-muted-foreground font-bold rounded-xl text-sm hover:bg-secondary/80 transition-colors"
            title="Actualizar datos">
            <RefreshCw size={15} />
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground font-bold rounded-xl text-sm hover:bg-secondary/80 transition-colors">
            <Printer size={16} /> Imprimir
          </button>
          <button onClick={handlePdf}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl text-sm hover:bg-primary/90 transition-colors">
            <FileDown size={16} /> PDF
          </button>
        </div>
      </header>

      {/* REPORT */}
      <div id="x-report-printable" ref={printRef} className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* PROVISIONAL banner */}
          <div className="flex items-center gap-3 bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-4">
            <AlertTriangle className="text-amber-400 shrink-0" size={24} />
            <div className="flex-1">
              <p className="font-black text-amber-400 uppercase tracking-widest text-sm">Informe provisional</p>
              <p className="text-xs text-muted-foreground mt-0.5">La sesión sigue abierta. Los datos pueden cambiar hasta el cierre definitivo.</p>
            </div>
            <button onClick={() => void refetch()} className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-amber-400/70 hover:text-amber-400">
              <RefreshCw size={12} /> Actualizar
            </button>
          </div>

          {/* Title block */}
          <div className="text-center border-b-2 border-border pb-5">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Receipt className="text-amber-400" size={28} />
              <h2 className="text-3xl font-black tracking-tight">INFORME X — PROVISIONAL</h2>
            </div>
            <p className="text-muted-foreground font-semibold">{session.terminalName || 'Caja principal'}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Empleado: <span className="font-bold text-foreground">{session.employeeName}</span>
            </p>
            <div className="flex justify-center gap-8 mt-3 text-sm">
              <div>
                <span className="text-muted-foreground">Apertura:</span>{' '}
                <span className="font-bold">{fmtDate(session.openedAt)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Generado:</span>{' '}
                <span className="font-bold">{fmtDate(new Date().toISOString())}</span>
              </div>
            </div>
          </div>

          {/* Resumen financiero */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-black uppercase tracking-widest mb-2">
                <Wallet size={14} /> Fondo inicial
              </div>
              <div className="text-2xl font-black font-mono">{fmt(openingFloatNum)}€</div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-black uppercase tracking-widest mb-2">
                <Receipt size={14} /> Total ventas
              </div>
              <div className="text-2xl font-black font-mono text-green-400">{fmt(totalSalesNum)}€</div>
              <div className="text-xs text-muted-foreground mt-1">{paymentsCount} cobros</div>
            </div>
            {totalTipsNum > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-muted-foreground text-xs font-black uppercase tracking-widest mb-2">Propinas</div>
                <div className="text-2xl font-black font-mono text-yellow-400">{fmt(totalTipsNum)}€</div>
              </div>
            )}
            <div className="bg-card border border-amber-500/30 rounded-2xl p-4">
              <div className="text-muted-foreground text-xs font-black uppercase tracking-widest mb-2">Efectivo esperado</div>
              <div className="text-2xl font-black font-mono text-amber-400">
                {fmt(parseFloat(expectedCash))}€
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Fondo + efectivo + entradas − salidas
              </div>
            </div>
          </div>

          {/* Desglose IVA */}
          {taxBreakdown.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Desglose fiscal (IVA)</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                    <th className="text-left pb-2">Tipo IVA</th>
                    <th className="text-right pb-2">Base imponible</th>
                    <th className="text-right pb-2">Cuota IVA</th>
                    <th className="text-right pb-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {taxBreakdown.map((b) => (
                    <tr key={b.rate} className="border-b border-border/40 last:border-0">
                      <td className="py-2 font-semibold">{b.rate}%</td>
                      <td className="py-2 text-right font-mono">{parseFloat(b.base).toFixed(2)}€</td>
                      <td className="py-2 text-right font-mono text-blue-400">{parseFloat(b.cuota).toFixed(2)}€</td>
                      <td className="py-2 text-right font-mono">{(parseFloat(b.base) + parseFloat(b.cuota)).toFixed(2)}€</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-black border-t-2 border-border">
                    <td className="pt-2">TOTAL</td>
                    <td className="pt-2 text-right font-mono">{taxBreakdown.reduce((s, b) => s + parseFloat(b.base), 0).toFixed(2)}€</td>
                    <td className="pt-2 text-right font-mono text-blue-400">{taxBreakdown.reduce((s, b) => s + parseFloat(b.cuota), 0).toFixed(2)}€</td>
                    <td className="pt-2 text-right font-mono text-green-400">{fmt(totalSalesNum)}€</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Ventas por método */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Ventas por método de pago</h3>
            <div className="space-y-2">
              {salesByMethod.map(m => (
                <div key={m.methodCode} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                  <span className="font-semibold">{METHOD_LABELS[m.methodCode] ?? m.methodName}</span>
                  <span className="font-mono font-black">{fmt(m.total ?? '0')}€</span>
                </div>
              ))}
              {salesByMethod.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-2">Sin ventas registradas</p>
              )}
              <div className="flex justify-between items-center pt-2 font-black text-lg">
                <span>TOTAL</span>
                <span className="font-mono text-green-400">{fmt(totalSalesNum)}€</span>
              </div>
            </div>
          </div>

          {/* Movimientos de caja */}
          {movements.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Movimientos de caja</h3>
              <div className="space-y-2">
                {movements.map(m => (
                  <div key={m.id} className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${CASH_IN_TYPES.includes(m.movementType) ? 'bg-green-500/10 text-green-400' : 'bg-destructive/10 text-destructive'}`}>
                        {CASH_IN_TYPES.includes(m.movementType) ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-none">{MOVEMENT_LABELS[m.movementType] ?? m.movementType}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{m.reason}</p>
                        <p className="text-xs text-muted-foreground">{m.employeeName} · {fmtDate(m.createdAt)}</p>
                      </div>
                    </div>
                    <span className={`font-mono font-bold ${CASH_IN_TYPES.includes(m.movementType) ? 'text-green-400' : 'text-destructive'}`}>
                      {CASH_IN_TYPES.includes(m.movementType) ? '+' : '-'}{fmt(m.amount)}€
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 text-sm font-bold">
                  <span className="text-green-400">Total entradas: {fmt(movInNum)}€</span>
                  <span className="text-destructive">Total salidas: {fmt(movOutNum)}€</span>
                </div>
              </div>
            </div>
          )}

          {/* Propinas */}
          {tips.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Propinas</h3>
              <div className="space-y-1">
                {tips.map((t, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t.method === 'cash' ? 'Efectivo' : 'Tarjeta'}</span>
                    <span className="font-mono font-bold text-yellow-400">+{fmt(t.amount)}€</span>
                  </div>
                ))}
                <div className="flex justify-between font-black pt-2 border-t border-border">
                  <span>Total propinas</span>
                  <span className="font-mono text-yellow-400">{fmt(totalTipsNum)}€</span>
                </div>
              </div>
            </div>
          )}

          {/* Anulaciones */}
          {voids.length > 0 && (
            <div className="bg-card border border-destructive/30 rounded-2xl p-5">
              <h3 className="text-sm font-black uppercase tracking-widest text-destructive mb-4">Anulaciones ({voids.length})</h3>
              <div className="space-y-2">
                {voids.map(v => (
                  <div key={v.id} className="text-sm border-b border-border/40 pb-2 last:border-0">
                    <p className="font-semibold">{v.reason}</p>
                    <p className="text-xs text-muted-foreground">{v.employeeName} · {fmtDate(v.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-center text-xs text-muted-foreground pb-4">
            Documento provisional generado el {fmtDate(new Date().toISOString())} · Piccolo TPV
          </div>
        </div>
      </div>
    </div>
  );
}
