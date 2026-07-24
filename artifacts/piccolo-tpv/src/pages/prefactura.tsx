import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetOrderPaymentSummary,
  useGetBusinessConfig,
  getGetOrderPaymentSummaryQueryKey,
  getGetBusinessConfigQueryKey,
} from '@workspace/api-client-react';
import {
  useGetDocumentTemplates,
  getGetDocumentTemplatesQueryKey,
} from '@workspace/api-client-react/documents';
import {
  useCreatePrefacturaPrint,
  useGetPrefacturaStatus,
  getGetPrefacturaStatusQueryKey,
  type PrefacturaPrintResult,
} from '@workspace/api-client-react/phase1';
import { Loader2, ChevronLeft, Printer, CreditCard, RefreshCw, AlertTriangle } from 'lucide-react';
import type { TaxBreakdownItem } from '@workspace/api-client-react';
import { toast } from 'sonner';

// Helper: parse employee id from localStorage
function getEmployeeId(): string | undefined {
  try { return JSON.parse(localStorage.getItem('employee') ?? '{}')?.id; } catch { return undefined; }
}

export default function Prefactura() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: summary, isLoading } = useGetOrderPaymentSummary(orderId!, {
    query: { enabled: !!orderId, queryKey: getGetOrderPaymentSummaryQueryKey(orderId!) },
  });
  const { data: businessConfig } = useGetBusinessConfig({
    query: { queryKey: getGetBusinessConfigQueryKey() },
  });
  const { data: templates = [] } = useGetDocumentTemplates({ documentType: 'prefactura' }, {
    query: { queryKey: getGetDocumentTemplatesQueryKey({ documentType: 'prefactura' }) },
  });

  // Persistent print state from the server
  const { data: prefacturaStatus, refetch: refetchStatus } = useGetPrefacturaStatus(orderId!, {
    query: {
      enabled: !!orderId,
      queryKey: getGetPrefacturaStatusQueryKey(orderId!),
      refetchOnWindowFocus: true,
    },
  });

  // Refresh prefactura status + summary when returning to foreground
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) {
        void refetchStatus();
        queryClient.invalidateQueries({ queryKey: getGetOrderPaymentSummaryQueryKey(orderId!) });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refetchStatus, queryClient, orderId]);
  const createPrint = useCreatePrefacturaPrint();

  const now = new Date().toLocaleString('es-ES');

  // Active template settings (or defaults)
  const activeTpl = templates.find(t => t.isDefault) ?? templates[0];
  const cfg = (activeTpl?.config ?? {}) as Record<string, unknown>;
  const showPhone = cfg.showPhone !== false && !!businessConfig?.telefono;
  const showWeb   = cfg.showWeb === true && !!businessConfig?.web;
  const footerText = (cfg.footerText as string) ?? '¡Gracias por su visita!';
  const fontFamily = (cfg.fontFamily as string) === 'sans-serif' ? 'Arial, sans-serif'
    : (cfg.fontFamily as string) === 'serif' ? 'Georgia, serif'
    : '"Courier New", Courier, monospace';

  // pendingPrint holds the API response while we wait for a re-render so the
  // correct P-XXXX appears in the DOM before window.print() opens the dialog.
  const [pendingPrint, setPendingPrint] = useState<PrefacturaPrintResult | null>(null);

  // Derived display values: prefer the fresh mutation result so the document
  // shows the assigned code even before the status query has re-fetched.
  const hasPrinted = pendingPrint?.isReprint !== undefined ? pendingPrint.isReprint : (prefacturaStatus?.hasPrinted ?? false);
  const prefacturaCode = pendingPrint?.prefacturaCode ?? prefacturaStatus?.prefacturaCode ?? null;

  // After pendingPrint is committed to state (React has re-rendered), open the
  // print dialog so the correct P-XXXX is guaranteed to appear in the output.
  useEffect(() => {
    if (!pendingPrint) return;
    // requestAnimationFrame ensures the browser has painted the new DOM.
    const raf = requestAnimationFrame(() => {
      window.print();
      queryClient.invalidateQueries({ queryKey: getGetPrefacturaStatusQueryKey(orderId!) });
      refetchStatus();
      setPendingPrint(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingPrint, orderId, queryClient, refetchStatus]);

  const handlePrint = () => {
    createPrint.mutate({ orderId: orderId! }, {
      onSuccess: (result: PrefacturaPrintResult) => {
        toast.success(result.isReprint ? `Reimpresión prefactura ${result.prefacturaCode} registrada` : `Prefactura ${result.prefacturaCode} registrada`);
        // Store result → triggers useEffect above after re-render
        setPendingPrint(result);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? 'Error al registrar la impresión';
        toast.error(msg);
      },
    });
  };

  // 409 = order already paid, show a specific error state
  const orderIsPaid = (summary as any)?.order?.status === 'paid';

  if (isLoading || !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { order, items, subtotal, taxTotal, total, taxBreakdown = [] as TaxBreakdownItem[], discount } = summary;
  const billableItems = items;
  const bizName = businessConfig?.nombreComercial || 'Piccolo';
  const bizNif   = businessConfig?.nif;
  const bizAddr  = [businessConfig?.direccionFiscal, businessConfig?.codigoPostal, businessConfig?.poblacion].filter(Boolean).join(', ');

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col print:bg-white print:text-black">
      <style>{`
        @media print {
          @page { margin: 0; size: 80mm auto; }
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; }
          * { text-shadow: none !important; box-shadow: none !important; }
          .print\\:hidden { display: none !important; }
          .hidden.print\\:block { display: block !important; }
        }
      `}</style>

      {/* ══ SCREEN VIEW ══════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col print:hidden">

        {/* Header */}
        <header className="h-16 flex items-center px-4 border-b border-border bg-card shrink-0 shadow-sm gap-3">
          <button
            onClick={() => window.history.back()}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 border border-transparent hover:border-border"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-none text-primary truncate">
              Prefactura — {order.tableName}
            </h1>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {order.employeeName}
            </span>
          </div>
          <button
            onClick={() => { void queryClient.invalidateQueries(); }}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95"
            title="Actualizar"
          >
            <RefreshCw size={16} />
          </button>
          <span className="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-wider">
            Prefactura
          </span>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center">

          {/* Reprint banner — shown when a prefactura was already printed for this order */}
          {hasPrinted && (
            <div className="w-full max-w-sm mb-4 flex items-start gap-2 bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-400 font-black text-sm uppercase tracking-wide leading-tight">
                  Reimpresión de prefactura
                </p>
                <p className="text-amber-400/80 text-xs font-semibold mt-0.5">
                  {prefacturaCode} · {prefacturaStatus?.totalPrints ?? 0} impresión(es) registrada(s)
                </p>
              </div>
            </div>
          )}

          {/* Paid error state */}
          {orderIsPaid && (
            <div className="w-full max-w-sm mb-4 flex items-start gap-2 bg-red-500/10 border border-red-500/40 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-400 font-bold text-sm leading-tight">
                Esta comanda ya ha sido cobrada. No se puede generar una nueva prefactura.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 mb-8 w-full max-w-sm">
            <button
              onClick={handlePrint}
              disabled={createPrint.isPending || orderIsPaid}
              className="flex-1 py-4 bg-secondary text-foreground font-black uppercase tracking-wider rounded-xl border-2 border-border hover:border-primary/40 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:pointer-events-none"
            >
              {createPrint.isPending ? <Loader2 size={16} className="animate-spin" /> : hasPrinted ? <RefreshCw size={16} /> : <Printer size={18} />}
              {hasPrinted ? 'Reimprimir' : 'Imprimir'}
            </button>
            <button
              onClick={() => setLocation(`/cobro/${orderId}`)}
              className="flex-1 py-4 bg-primary text-primary-foreground font-black uppercase tracking-wider rounded-xl shadow-[0_8px_20px_rgba(0,0,0,0.3)] hover:shadow-primary/30 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
            >
              <CreditCard size={18} />
              Cobrar
            </button>
          </div>

          {/* Pre-bill card */}
          <div className="bg-[#fdfcfb] text-black w-full max-w-sm rounded-sm shadow-2xl font-mono text-sm border-t-8 border-t-amber-500 overflow-hidden"
            style={{ fontFamily }}>

            <div className="p-6">
              {/* Business name + NIF */}
              <div className="text-center font-bold text-2xl mb-1 tracking-widest uppercase">
                {bizName}
              </div>
              {bizNif && <div className="text-center text-[10px] text-gray-500 mb-1">NIF: {bizNif}</div>}
              {bizAddr && <div className="text-center text-[10px] text-gray-500 mb-1">{bizAddr}</div>}
              {showPhone && <div className="text-center text-[10px] text-gray-500 mb-1">Tel: {businessConfig?.telefono}</div>}
              {showWeb   && <div className="text-center text-[10px] text-gray-500 mb-1">{businessConfig?.web}</div>}

              {/* PREFACTURA disclaimer box — MANDATORY, cannot be hidden */}
              <div className="border-2 border-dashed border-amber-600 rounded-md px-3 py-2 mb-4 mt-3 text-center bg-amber-50">
                <div className="font-black text-base text-amber-700 uppercase tracking-widest leading-none">
                  {hasPrinted ? 'REIMPRESIÓN DE PREFACTURA' : 'PREFACTURA'}
                </div>
                <div className="text-[10px] text-amber-800 font-bold mt-1 leading-tight">
                  DOCUMENTO NO VÁLIDO COMO FACTURA
                </div>
              </div>

              <div className="border-b-2 border-dashed border-gray-400 mb-4" />

              {/* Order meta */}
              <div className="mb-4 space-y-0.5 font-semibold text-gray-800 text-xs">
                {prefacturaCode && <div>Nº prefactura: <span className="font-black text-black">{prefacturaCode}</span></div>}
                <div>Mesa: <span className="font-black text-black">{order.tableName}</span></div>
                <div>Atiende: {order.employeeName}</div>
                <div>Fecha: {now}</div>
              </div>

              <div className="border-b-2 border-dashed border-gray-400 mb-4" />

              {/* Items */}
              <div className="space-y-2 mb-4 text-gray-900">
                {billableItems.map((item, i) => (
                  <div key={i} className="flex justify-between items-start gap-2">
                    <div className="flex-1 leading-tight">
                      <span className="font-bold text-gray-700">{item.quantity}×</span>{' '}
                      {item.productName}
                      {item.unitPrice && (
                        <span className="text-gray-400 text-[10px] ml-1">
                          ({parseFloat(item.unitPrice).toFixed(2)}€/u)
                        </span>
                      )}
                    </div>
                    <div className="font-bold whitespace-nowrap">
                      {parseFloat(item.lineTotal).toFixed(2)}€
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-b-2 border-dashed border-gray-400 mb-4" />

              {/* Totals — MANDATORY */}
              <div className="space-y-1 text-gray-800 font-semibold mb-4">
                {/* Descuento (sólo si hay alguno) */}
                {discount && parseFloat(discount) > 0 && (
                  <div className="flex justify-between text-red-600 text-sm">
                    <span>Descuento aplicado</span>
                    <span>-{parseFloat(discount).toFixed(2)}€</span>
                  </div>
                )}
                {/* Desglose por tipo de IVA — nunca mostramos líneas a cero */}
                {taxBreakdown
                  .filter(b => parseFloat(b.base) !== 0 || parseFloat(b.cuota) !== 0)
                  .map(b => (
                    <div key={b.rate}>
                      <div className="flex justify-between text-sm">
                        <span>Base imponible {b.rate}%</span>
                        <span>{parseFloat(b.base).toFixed(2)}€</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Cuota IVA {b.rate}%</span>
                        <span>{parseFloat(b.cuota).toFixed(2)}€</span>
                      </div>
                    </div>
                  ))}
                {/* Subtotales agregados sólo cuando hay más de un tipo */}
                {taxBreakdown.filter(b => parseFloat(b.base) !== 0).length > 1 && (
                  <>
                    <div className="flex justify-between pt-1 border-t border-gray-200 text-sm">
                      <span>Total base imponible</span>
                      <span>{parseFloat(subtotal).toFixed(2)}€</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total cuota IVA</span>
                      <span>{parseFloat(taxTotal).toFixed(2)}€</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-xl font-black mt-2 pt-2 border-t-2 border-gray-300 text-black">
                  <span>TOTAL</span>
                  <span>{parseFloat(total).toFixed(2)}€</span>
                </div>
              </div>

              <div className="border-b-2 border-dashed border-gray-400 mb-4" />

              {/* Footer */}
              <div className="text-center space-y-1 text-gray-500 text-[10px] font-semibold">
                {footerText && <div>{footerText}</div>}
                <div className="font-black text-amber-700 uppercase tracking-wide text-[9px]">
                  DOCUMENTO NO VÁLIDO COMO FACTURA
                </div>
                <div className="mt-2 text-gray-400 text-[9px]">
                  Solicite factura oficial al finalizar el pago.
                </div>
              </div>
            </div>

            {/* Bottom amber stripe */}
            <div className="h-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
          </div>

          <div className="h-8" />
        </div>
      </div>

      {/* ══ PRINT VIEW (80 mm thermal) ═══════════════════════════════════════ */}
      <div className="hidden print:block font-mono text-[12px] leading-tight w-[80mm] mx-auto bg-white text-black p-0">

        <div className="text-center font-bold text-xl mb-1 uppercase">{bizName}</div>
        {bizNif && <div className="text-center text-[9px] mb-0.5">NIF: {bizNif}</div>}
        {bizAddr && <div className="text-center text-[9px] mb-0.5">{bizAddr}</div>}
        {showPhone && <div className="text-center text-[9px] mb-0.5">Tel: {businessConfig?.telefono}</div>}

        {/* Disclaimer box — always printed */}
        <div className="border border-dashed border-black px-2 py-1 mb-2 mt-1 text-center">
          <div className="font-black text-sm uppercase tracking-widest">
            {hasPrinted ? 'REIMPRESIÓN DE PREFACTURA' : 'PREFACTURA'}
          </div>
          <div className="text-[9px] font-bold leading-tight mt-0.5">
            DOCUMENTO NO VÁLIDO COMO FACTURA
          </div>
        </div>

        <div className="border-b border-dashed border-black mb-2" />

        <div className="mb-2 text-[11px]">
          {prefacturaCode && <div>Nº: {prefacturaCode}</div>}
          <div>Mesa: {order.tableName}</div>
          <div>Atiende: {order.employeeName}</div>
          <div>Fecha: {now}</div>
        </div>

        <div className="border-b border-dashed border-black mb-2" />

        <div className="mb-2">
          {billableItems.map((item, i) => (
            <div key={i} className="flex justify-between w-full mb-1">
              <div className="max-w-[65%] leading-tight pr-1">
                {item.quantity}× {item.productName}
              </div>
              <div className="whitespace-nowrap font-bold">
                {parseFloat(item.lineTotal).toFixed(2)}€
              </div>
            </div>
          ))}
        </div>

        <div className="border-b border-dashed border-black mb-2" />

        <div className="mb-2">
          {/* Vista de impresión: desglose completo por tipo de IVA */}
          {discount && parseFloat(discount) > 0 && (
            <div className="flex justify-between"><span>Descuento</span><span>-{parseFloat(discount).toFixed(2)}€</span></div>
          )}
          {taxBreakdown
            .filter(b => parseFloat(b.base) !== 0 || parseFloat(b.cuota) !== 0)
            .map(b => (
              <div key={b.rate}>
                <div className="flex justify-between"><span>Base {b.rate}%</span><span>{parseFloat(b.base).toFixed(2)}€</span></div>
                <div className="flex justify-between"><span>IVA {b.rate}%</span><span>{parseFloat(b.cuota).toFixed(2)}€</span></div>
              </div>
            ))}
          {taxBreakdown.filter(b => parseFloat(b.base) !== 0).length > 1 && (
            <>
              <div className="flex justify-between"><span>Subtotal</span><span>{parseFloat(subtotal).toFixed(2)}€</span></div>
              <div className="flex justify-between"><span>Total IVA</span><span>{parseFloat(taxTotal).toFixed(2)}€</span></div>
            </>
          )}
          <div className="flex justify-between font-black text-base mt-1 border-t border-black pt-1">
            <span>TOTAL</span>
            <span>{parseFloat(total).toFixed(2)}€</span>
          </div>
        </div>

        <div className="border-b border-dashed border-black mb-2" />

        <div className="text-center text-[9px] leading-snug">
          {footerText && <div className="font-bold mb-0.5">{footerText}</div>}
          <div className="font-black uppercase tracking-wide">
            DOCUMENTO NO VÁLIDO COMO FACTURA
          </div>
          <div className="mt-1">Solicite factura oficial al pagar.</div>
        </div>
      </div>
    </div>
  );
}
