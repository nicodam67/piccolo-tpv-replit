import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  useGetOrderTicket,
  useGetBusinessConfig,
  getGetOrderTicketQueryKey,
  getGetBusinessConfigQueryKey,
} from '@workspace/api-client-react';
import {
  useGetDocumentTemplates,
  useCreateReprint,
  getGetDocumentTemplatesQueryKey,
} from '@workspace/api-client-react/documents';
import type { TaxBreakdownItem } from '@workspace/api-client-react';
import { Loader2, ChevronLeft, Printer, Mail, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';

// VeriFactu status pill
const VERIFACTU_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Integración fiscal pendiente', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  generated:  { label: 'VeriFactu generado', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  sent:       { label: 'VeriFactu enviado', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  accepted:   { label: 'VeriFactu aceptado', color: 'bg-green-500/10 text-green-400 border-green-500/30' },
  rejected:   { label: 'VeriFactu rechazado', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  retry:      { label: 'VeriFactu — reintentando', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  rectified:  { label: 'Rectificado', color: 'bg-muted/10 text-muted-foreground border-border' },
};

export default function Ticket() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const [reprinting, setReprinting] = useState(false);

  const { data, isLoading, refetch } = useGetOrderTicket(orderId!, {
    query: { enabled: !!orderId, queryKey: getGetOrderTicketQueryKey(orderId!) }
  });

  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) void refetch(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refetch]);
  const { data: businessConfig } = useGetBusinessConfig({
    query: { queryKey: getGetBusinessConfigQueryKey() },
  });
  const { data: templates = [] } = useGetDocumentTemplates({ documentType: 'ticket' }, {
    query: { queryKey: getGetDocumentTemplatesQueryKey({ documentType: 'ticket' }) },
  });
  const createReprint = useCreateReprint();

  const activeTpl = templates.find(t => t.isDefault) ?? templates[0];
  const cfg = (activeTpl?.config ?? {}) as Record<string, unknown>;
  const showPhone  = cfg.showPhone !== false && !!businessConfig?.telefono;
  const showWeb    = cfg.showWeb === true && !!businessConfig?.web;
  const footerText = (cfg.footerText as string) ?? '¡Gracias por su visita!';
  const fontFamily = (cfg.fontFamily as string) === 'sans-serif' ? 'Arial, sans-serif'
    : (cfg.fontFamily as string) === 'serif' ? 'Georgia, serif'
    : '"Courier New", Courier, monospace';

  const logReprint = async (ticketId: string) => {
    return createReprint.mutateAsync({
      data: { documentId: ticketId, documentType: 'ticket', reason: 'Reimpresión manual' },
    });
  };

  const handlePrint = () => {
    window.print();
    toast.success('Imprimiendo…');
  };

  const handleReprint = async () => {
    if (!data?.ticket?.id) return;
    setReprinting(true);
    try {
      await logReprint(data.ticket.id);
      toast.success('Reimpresión registrada en auditoría');
      window.print();
    } catch {
      toast.error('Error al registrar reimpresión');
    } finally {
      setReprinting(false);
    }
  };

  const handleDownloadPdf = () => {
    // Inject A4 print styles temporarily then print
    const styleId = 'pdf-print-override';
    let el = document.getElementById(styleId);
    if (!el) {
      el = document.createElement('style');
      el.id = styleId;
      document.head.appendChild(el);
    }
    el.textContent = `@media print { @page { size: A4; margin: 15mm; } }`;
    window.print();
    setTimeout(() => { el?.remove(); }, 500);
    toast.success('Abriendo diálogo de PDF…');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center gap-4">
        <div className="text-destructive text-xl font-bold">Error: No se pudo cargar el ticket</div>
        <div className="flex gap-3">
          <button onClick={() => void refetch()} className="flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground font-bold rounded-xl text-sm">
            <RefreshCw size={14} /> Reintentar
          </button>
          <button onClick={() => setLocation('/tables')} className="px-5 py-3 bg-secondary text-foreground font-black rounded-xl text-sm">Volver a mesas</button>
        </div>
      </div>
    );
  }

  const { ticket, order, items, payments, employeeName } = data;
  const verifactuInfo = VERIFACTU_LABELS[(ticket as any).verifactuStatus ?? 'pending'] ?? VERIFACTU_LABELS.pending;
  const bizName = businessConfig?.nombreComercial || 'Piccolo';
  const bizNif  = businessConfig?.nif || (ticket as any).nifEmisor;
  const bizAddr = [businessConfig?.direccionFiscal, businessConfig?.codigoPostal, businessConfig?.poblacion].filter(Boolean).join(', ');

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col print:bg-white print:text-black">
      <style>{`
        @media print {
          @page { margin: 0; size: 80mm auto; }
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; }
          * { text-shadow: none !important; box-shadow: none !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>

      {/* SCREEN VIEW */}
      <div className="flex-1 flex flex-col print:hidden">
        <header className="h-16 flex items-center px-4 border-b border-border bg-card shrink-0 shadow-sm gap-3">
          <button onClick={() => setLocation('/tables')} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 border border-transparent hover:border-border">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold ml-2">Ticket #{ticket.ticketNumber}</h1>
          </div>
          {/* VeriFactu status pill */}
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold whitespace-nowrap ${verifactuInfo.color}`}>
            {verifactuInfo.label}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center">
          {/* Actions */}
          <div className="flex gap-3 mb-6 w-full max-w-sm flex-wrap">
            <button
              onClick={handlePrint}
              className="flex-1 py-4 bg-primary text-primary-foreground font-black uppercase tracking-wider rounded-xl shadow-[0_8px_20px_rgba(0,0,0,0.3)] hover:shadow-primary/30 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm min-w-[100px]"
            >
              <Printer size={18} /> Imprimir
            </button>
            <button
              onClick={handleReprint}
              disabled={reprinting}
              className="flex-1 py-4 bg-secondary text-foreground font-black uppercase tracking-wider rounded-xl border-2 border-border hover:border-primary/40 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm min-w-[100px] disabled:opacity-60"
            >
              {reprinting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Reimprimir
            </button>
            <button
              onClick={handleDownloadPdf}
              className="flex-1 py-4 bg-secondary text-foreground font-black uppercase tracking-wider rounded-xl border-2 border-border hover:border-primary/40 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm min-w-[100px]"
            >
              <Download size={16} /> PDF
            </button>
            <div className="w-full group relative">
              <button
                disabled
                className="w-full py-3 bg-secondary text-muted-foreground font-black uppercase tracking-wider rounded-xl cursor-not-allowed opacity-60 flex items-center justify-center gap-2 border-2 border-border text-sm"
              >
                <Mail size={16} /> Correo
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-foreground text-background text-xs font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                Disponible próximamente
              </div>
            </div>
          </div>

          {/* Preview Card */}
          <div className="bg-[#fdfcfb] text-black w-full max-w-sm p-6 rounded-sm shadow-2xl font-mono text-sm border-t-8 border-t-primary relative overflow-hidden"
            style={{ fontFamily }}>
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-black/5 to-transparent"></div>

            <div className="text-center font-bold text-2xl mb-1 tracking-widest uppercase text-black">{bizName}</div>
            {bizNif  && <div className="text-center text-[10px] text-gray-500 mb-0.5">NIF: {bizNif}</div>}
            {bizAddr && <div className="text-center text-[10px] text-gray-500 mb-0.5">{bizAddr}</div>}
            {showPhone && <div className="text-center text-[10px] text-gray-500 mb-0.5">Tel: {businessConfig?.telefono}</div>}
            {showWeb   && <div className="text-center text-[10px] text-gray-500 mb-0.5">{businessConfig?.web}</div>}

            <div className="border-b-2 border-dashed border-gray-400 mb-4 mt-3"></div>

            <div className="mb-4 space-y-1 font-semibold text-gray-800 text-sm">
              <div className="flex justify-between"><span>Ticket nº:</span><span className="font-black">#{ticket.ticketNumber}</span></div>
              <div>Mesa: {order.tableName}</div>
              <div>Atiende: {employeeName}</div>
              <div>Fecha: {new Date(ticket.issuedAt).toLocaleString('es-ES')}</div>
            </div>

            <div className="border-b-2 border-dashed border-gray-400 mb-4"></div>

            <div className="space-y-2 mb-4 text-gray-900">
              {items.map((item, i) => (
                <div key={i} className="flex justify-between items-start">
                  <div className="flex-1 pr-2 leading-tight">
                    {item.quantity}x {item.productName}
                  </div>
                  <div className="font-bold">{parseFloat(item.lineTotal).toFixed(2)}€</div>
                </div>
              ))}
            </div>

            <div className="border-b-2 border-dashed border-gray-400 mb-4"></div>

            <div className="space-y-1 mb-4 text-gray-800 font-semibold">
              {/* Desglose completo por tipo de IVA — nunca se muestran líneas a cero */}
              {(data.taxBreakdown ?? [])
                .filter((b: TaxBreakdownItem) => parseFloat(b.base) !== 0 || parseFloat(b.cuota) !== 0)
                .map((b: TaxBreakdownItem) => (
                  <div key={b.rate}>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Base imponible {b.rate}%</span>
                      <span>{parseFloat(b.base).toFixed(2)}€</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Cuota IVA {b.rate}%</span>
                      <span>{parseFloat(b.cuota).toFixed(2)}€</span>
                    </div>
                  </div>
                ))}
              {/* Subtotales agregados sólo cuando conviven varios tipos */}
              {(data.taxBreakdown ?? []).filter((b: TaxBreakdownItem) => parseFloat(b.base) !== 0).length > 1 && (
                <>
                  <div className="flex justify-between pt-1 border-t border-gray-200">
                    <span>Total base imponible</span>
                    <span>{parseFloat(ticket.subtotal).toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total cuota IVA</span>
                    <span>{parseFloat(ticket.taxTotal).toFixed(2)}€</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-xl font-black mt-2 pt-2 border-t border-gray-300 text-black">
                <span>TOTAL</span>
                <span>{parseFloat(ticket.total).toFixed(2)}€</span>
              </div>
            </div>

            <div className="border-b-2 border-dashed border-gray-400 mb-4"></div>

            <div className="space-y-1 mb-4 text-xs font-semibold text-gray-800">
              {payments.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span>{p.methodName}</span>
                  <span>{parseFloat(p.amount).toFixed(2)}€</span>
                </div>
              ))}
            </div>

            <div className="border-b-2 border-dashed border-gray-400 mb-4"></div>

            <div className="text-center text-xs space-y-2 text-gray-600">
              {footerText && <div className="font-bold text-gray-900 text-sm">{footerText}</div>}
              {(data.taxBreakdown ?? []).length > 0 ? (
                <div>
                  IVA incluido:{' '}
                  {(data.taxBreakdown ?? []).map((b: TaxBreakdownItem, i: number) => (
                    <span key={b.rate}>{i > 0 ? ' · ' : ''}{b.rate}%</span>
                  ))}
                </div>
              ) : (
                <div>IVA incluido al tipo reducido del 10%</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PRINT VIEW (80mm) */}
      <div id="ticket-print" className="hidden print:block font-mono text-[12px] leading-tight w-[80mm] mx-auto bg-white text-black p-0">
        <div className="text-center font-bold text-xl mb-1 uppercase">{bizName}</div>
        {bizNif  && <div className="text-center text-[9px] mb-0.5">NIF: {bizNif}</div>}
        {showPhone && <div className="text-center text-[9px] mb-0.5">Tel: {businessConfig?.telefono}</div>}
        <div className="border-b border-dashed border-black mb-2 mt-1"></div>

        <div className="mb-2">
          <div className="flex justify-between"><span>Ticket:</span><span className="font-bold">#{ticket.ticketNumber}</span></div>
          <div>Fecha: {new Date(ticket.issuedAt).toLocaleString('es-ES')}</div>
          <div>Mesa: {order.tableName}</div>
          <div>Atiende: {employeeName}</div>
        </div>

        <div className="border-b border-dashed border-black mb-2"></div>

        <div className="mb-2 w-full">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between w-full mb-1">
              <div className="max-w-[65%] leading-tight pr-1">{item.quantity}x {item.productName}</div>
              <div className="whitespace-nowrap">{parseFloat(item.lineTotal).toFixed(2)}€</div>
            </div>
          ))}
        </div>

        <div className="border-b border-dashed border-black mb-2"></div>

        <div className="mb-2">
          {/* Vista térmica: desglose completo, sin líneas a cero */}
          {(data.taxBreakdown ?? [])
            .filter((b: TaxBreakdownItem) => parseFloat(b.base) !== 0 || parseFloat(b.cuota) !== 0)
            .map((b: TaxBreakdownItem) => (
              <div key={b.rate}>
                <div className="flex justify-between text-[9px]"><span>Base {b.rate}%</span><span>{parseFloat(b.base).toFixed(2)}€</span></div>
                <div className="flex justify-between text-[9px]"><span>IVA {b.rate}%</span><span>{parseFloat(b.cuota).toFixed(2)}€</span></div>
              </div>
            ))}
          {(data.taxBreakdown ?? []).filter((b: TaxBreakdownItem) => parseFloat(b.base) !== 0).length > 1 && (
            <>
              <div className="flex justify-between text-[9px]"><span>Subtotal</span><span>{parseFloat(ticket.subtotal).toFixed(2)}€</span></div>
              <div className="flex justify-between text-[9px]"><span>Total IVA</span><span>{parseFloat(ticket.taxTotal).toFixed(2)}€</span></div>
            </>
          )}
          <div className="flex justify-between font-bold text-sm mt-1 border-t border-black pt-1">
            <span>TOTAL</span><span>{parseFloat(ticket.total).toFixed(2)}€</span>
          </div>
        </div>

        <div className="border-b border-dashed border-black mb-2"></div>

        <div className="mb-2">
          {payments.map((p, i) => (
            <div key={i} className="flex justify-between">
              <span>{p.methodName}</span>
              <span>{parseFloat(p.amount).toFixed(2)}€</span>
            </div>
          ))}
        </div>

        <div className="border-b border-dashed border-black mb-2"></div>

        <div className="text-center text-[10px]">
          {footerText && <div className="font-bold mb-0.5">{footerText}</div>}
          {(data.taxBreakdown ?? []).length > 0 ? (
            <div>IVA: {(data.taxBreakdown ?? []).map((b: TaxBreakdownItem, i: number) => `${i > 0 ? ' · ' : ''}${b.rate}%`).join('')}</div>
          ) : (
            <div>IVA incluido al tipo reducido del 10%</div>
          )}
        </div>
      </div>
    </div>
  );
}
