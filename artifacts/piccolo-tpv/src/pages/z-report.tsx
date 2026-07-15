import React, { useRef, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { ChevronLeft, Printer, FileDown, Loader2, CheckCircle2, AlertCircle, Wallet, TrendingUp, TrendingDown, Receipt, RefreshCw, AlertTriangle } from 'lucide-react';
import { useGetCashSessionReport, useGetCashMachineSessionSummary } from '@workspace/api-client-react';
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

export default function ZReport() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [, setLocation] = useLocation();
  const printRef = useRef<HTMLDivElement>(null);

  const { data: report, isLoading, refetch } = useGetCashSessionReport(sessionId!, {
    query: { enabled: !!sessionId, queryKey: [`/api/cash-sessions/${sessionId}/report`] as const },
  });

  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) void refetch(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refetch]);

  const { data: cashMachineSummary } = useGetCashMachineSessionSummary(sessionId!, {
    query: {
      enabled: !!sessionId,
      queryKey: [`/api/cash-sessions/${sessionId}/cash-machine-summary`] as const,
    },
  });

  const handlePrint = () => {
    window.print();
  };

  const handlePdf = () => {
    const el = document.createElement('style');
    el.setAttribute('id', '__pdf-override');
    el.textContent = `@media print { @page { size: A4; margin: 20mm; } body > * { display: none !important; } #z-report-printable { display: block !important; } }`;
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
        <p className="text-muted-foreground text-sm">No se pudo cargar el informe Z</p>
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
  const diffNum = parseFloat(session.difference ?? '0');
  const isOk = diffNum >= -0.01;

  const cashRow = salesByMethod.find(m => m.methodCode === 'cash');
  const cashSales = parseFloat(cashRow?.total ?? '0');

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
          <h1 className="text-xl font-bold">Informe Z — {session.terminalName || 'Caja'}</h1>
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
      <div id="z-report-printable" ref={printRef} className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* Title block */}
          <div className="text-center border-b-2 border-border pb-5">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Receipt className="text-primary" size={28} />
              <h2 className="text-3xl font-black tracking-tight">INFORME Z</h2>
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
              {session.closedAt && (
                <div>
                  <span className="text-muted-foreground">Cierre:</span>{' '}
                  <span className="font-bold">{fmtDate(session.closedAt)}</span>
                </div>
              )}
            </div>
            <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full text-sm font-black uppercase tracking-wider bg-secondary">
              <span className="text-muted-foreground">Modo:</span>
              <span>{session.blindClose ? '🙈 Cierre ciego' : '👁 Cierre normal'}</span>
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
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="text-muted-foreground text-xs font-black uppercase tracking-widest mb-2">Efectivo esperado</div>
              <div className="text-2xl font-black font-mono">
                {fmt(parseFloat(session.expectedCash ?? '0'))}€
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
                    <td className="pt-2 text-right font-mono">
                      {taxBreakdown.reduce((s, b) => s + parseFloat(b.base), 0).toFixed(2)}€
                    </td>
                    <td className="pt-2 text-right font-mono text-blue-400">
                      {taxBreakdown.reduce((s, b) => s + parseFloat(b.cuota), 0).toFixed(2)}€
                    </td>
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
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${m.movementType === 'in' ? 'bg-green-500/10 text-green-400' : 'bg-destructive/10 text-destructive'}`}>
                        {m.movementType === 'in' ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-none">{m.reason}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{m.employeeName} · {fmtDate(m.createdAt)}</p>
                      </div>
                    </div>
                    <span className={`font-mono font-bold ${m.movementType === 'in' ? 'text-green-400' : 'text-destructive'}`}>
                      {m.movementType === 'in' ? '+' : '-'}{fmt(m.amount)}€
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

          {/* Arqueo */}
          <div className={`rounded-2xl p-5 border-2 ${isOk ? 'bg-green-500/5 border-green-500/30' : 'bg-destructive/5 border-destructive/30'}`}>
            <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Arqueo de caja</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Efectivo esperado</span>
                <span className="font-mono font-black">{fmt(session.expectedCash ?? '0')}€</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Efectivo contado</span>
                <span className="font-mono font-black">{fmt(session.countedCash ?? '0')}€</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="font-black text-lg">Diferencia</span>
                <div className="flex items-center gap-2">
                  {isOk ? <CheckCircle2 className="text-green-400" size={20} /> : <AlertCircle className="text-destructive" size={20} />}
                  <span className={`font-mono font-black text-2xl ${isOk ? 'text-green-400' : 'text-destructive'}`}>
                    {diffNum > 0 ? '+' : ''}{fmt(diffNum)}€
                  </span>
                </div>
              </div>
              {session.discrepancyReason && (
                <div className="bg-background/50 rounded-xl p-3">
                  <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Explicación</p>
                  <p className="text-sm">{session.discrepancyReason}</p>
                </div>
              )}
            </div>
          </div>

          {/* Caja automática */}
          {cashMachineSummary && (cashMachineSummary as any).enabled && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Caja automática — conciliación</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cobros por máquina (TPV)</span>
                  <span className="font-mono font-bold">{fmt((cashMachineSummary as any).tpvTotal ?? 0)}€</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cobros por máquina (dispositivo)</span>
                  <span className="font-mono font-bold">{fmt((cashMachineSummary as any).deviceTotal ?? 0)}€</span>
                </div>
                {parseFloat((cashMachineSummary as any).changeDispensed ?? '0') > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cambio dispensado</span>
                    <span className="font-mono font-bold text-yellow-400">{fmt((cashMachineSummary as any).changeDispensed)}€</span>
                  </div>
                )}
                {parseFloat((cashMachineSummary as any).refundsDispensed ?? '0') > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Devoluciones</span>
                    <span className="font-mono font-bold text-destructive">{fmt((cashMachineSummary as any).refundsDispensed)}€</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-border font-black">
                  <span>Diferencia dispositivo</span>
                  <span className={`font-mono ${parseFloat((cashMachineSummary as any).difference ?? '0') === 0 ? 'text-green-400' : 'text-destructive'}`}>
                    {parseFloat((cashMachineSummary as any).difference ?? '0') >= 0 ? '+' : ''}{fmt((cashMachineSummary as any).difference ?? 0)}€
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{(cashMachineSummary as any).transactionCount ?? 0} transacciones registradas</p>
              </div>
            </div>
          )}

          {/* Notas */}
          {session.closingNotes && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-2">Notas de cierre</h3>
              <p className="text-sm">{session.closingNotes}</p>
            </div>
          )}

          <div className="text-center text-xs text-muted-foreground pb-4">
            Documento generado el {fmtDate(new Date().toISOString())} · Piccolo TPV
          </div>
        </div>
      </div>
    </div>
  );
}
