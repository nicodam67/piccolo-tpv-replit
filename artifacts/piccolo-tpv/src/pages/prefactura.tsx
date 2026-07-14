import React from 'react';
import { useParams, useLocation } from 'wouter';
import {
  useGetOrderPaymentSummary,
  getGetOrderPaymentSummaryQueryKey,
} from '@workspace/api-client-react';
import { Loader2, ChevronLeft, Printer, CreditCard } from 'lucide-react';

export default function Prefactura() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();

  const { data: summary, isLoading } = useGetOrderPaymentSummary(orderId!, {
    query: { enabled: !!orderId, queryKey: getGetOrderPaymentSummaryQueryKey(orderId!) },
  });

  // ── all hooks must be above any early return ──────────────────────────────
  const now = new Date().toLocaleString('es-ES');

  if (isLoading || !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { order, items, subtotal, taxTotal, total } = summary;

  // The payment-summary API already returns only billable (non-draft, non-invitation) items
  const billableItems = items;

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
          {/* Badge */}
          <span className="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-wider">
            Prefactura
          </span>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center">

          {/* Action buttons */}
          <div className="flex gap-3 mb-8 w-full max-w-sm">
            <button
              onClick={() => window.print()}
              className="flex-1 py-4 bg-secondary text-foreground font-black uppercase tracking-wider rounded-xl border-2 border-border hover:border-primary/40 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Printer size={18} />
              Imprimir
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
          <div className="bg-[#fdfcfb] text-black w-full max-w-sm rounded-sm shadow-2xl font-mono text-sm border-t-8 border-t-amber-500 overflow-hidden">

            {/* Inner padding */}
            <div className="p-6">

              {/* Restaurant name */}
              <div className="text-center font-bold text-2xl mb-3 tracking-widest uppercase">
                🍽 Piccolo
              </div>

              {/* PREFACTURA disclaimer box */}
              <div className="border-2 border-dashed border-amber-600 rounded-md px-3 py-2 mb-4 text-center bg-amber-50">
                <div className="font-black text-base text-amber-700 uppercase tracking-widest leading-none">
                  PREFACTURA
                </div>
                <div className="text-[10px] text-amber-800 font-bold mt-1 leading-tight">
                  NO VÁLIDA COMO FACTURA FISCAL
                </div>
              </div>

              <div className="border-b-2 border-dashed border-gray-400 mb-4" />

              {/* Order meta */}
              <div className="mb-4 space-y-0.5 font-semibold text-gray-800 text-xs">
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

              {/* Totals */}
              <div className="space-y-1 text-gray-800 font-semibold mb-4">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{parseFloat(subtotal).toFixed(2)}€</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA (10%)</span>
                  <span>{parseFloat(taxTotal).toFixed(2)}€</span>
                </div>
                <div className="flex justify-between text-xl font-black mt-2 pt-2 border-t-2 border-gray-300 text-black">
                  <span>TOTAL</span>
                  <span>{parseFloat(total).toFixed(2)}€</span>
                </div>
              </div>

              <div className="border-b-2 border-dashed border-gray-400 mb-4" />

              {/* Footer disclaimer */}
              <div className="text-center space-y-1 text-gray-500 text-[10px] font-semibold">
                <div>Este documento es una prefactura informativa.</div>
                <div className="font-black text-amber-700 uppercase tracking-wide text-[9px]">
                  NO VÁLIDA COMO FACTURA FISCAL
                </div>
                <div className="mt-2 text-gray-400 text-[9px]">
                  Solicite factura oficial al finalizar el pago.
                </div>
              </div>
            </div>

            {/* Bottom amber stripe */}
            <div className="h-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
          </div>

          {/* Spacer */}
          <div className="h-8" />
        </div>
      </div>

      {/* ══ PRINT VIEW (80 mm thermal) ═══════════════════════════════════════ */}
      <div className="hidden print:block font-mono text-[12px] leading-tight w-[80mm] mx-auto bg-white text-black p-0">

        {/* Header */}
        <div className="text-center font-bold text-xl mb-1 uppercase">🍽 Piccolo</div>

        {/* Disclaimer box */}
        <div className="border border-dashed border-black px-2 py-1 mb-2 text-center">
          <div className="font-black text-sm uppercase tracking-widest">PREFACTURA</div>
          <div className="text-[9px] font-bold leading-tight mt-0.5">
            NO VÁLIDA COMO FACTURA FISCAL
          </div>
        </div>

        <div className="border-b border-dashed border-black mb-2" />

        {/* Meta */}
        <div className="mb-2 text-[11px]">
          <div>Mesa: {order.tableName}</div>
          <div>Atiende: {order.employeeName}</div>
          <div>Fecha: {now}</div>
        </div>

        <div className="border-b border-dashed border-black mb-2" />

        {/* Items */}
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

        {/* Totals */}
        <div className="mb-2">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{parseFloat(subtotal).toFixed(2)}€</span>
          </div>
          <div className="flex justify-between">
            <span>IVA 10%</span>
            <span>{parseFloat(taxTotal).toFixed(2)}€</span>
          </div>
          <div className="flex justify-between font-black text-base mt-1 border-t border-black pt-1">
            <span>TOTAL</span>
            <span>{parseFloat(total).toFixed(2)}€</span>
          </div>
        </div>

        <div className="border-b border-dashed border-black mb-2" />

        {/* Footer */}
        <div className="text-center text-[9px] leading-snug">
          <div className="font-bold">Documento informativo — prefactura</div>
          <div className="font-black uppercase tracking-wide mt-0.5">
            NO VÁLIDA COMO FACTURA FISCAL
          </div>
          <div className="mt-1">Solicite factura oficial al pagar.</div>
        </div>
      </div>
    </div>
  );
}
