import React from 'react';
import { useParams, useLocation } from 'wouter';
import { useGetOrderTicket, getGetOrderTicketQueryKey } from '@workspace/api-client-react';
import { Loader2, ChevronLeft, Printer, Mail } from 'lucide-react';

export default function Ticket() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();

  const { data, isLoading } = useGetOrderTicket(orderId!, {
    query: { enabled: !!orderId, queryKey: getGetOrderTicketQueryKey(orderId!) }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
        <div className="text-destructive text-xl font-bold mb-4">Error: No se pudo cargar el ticket</div>
        <button onClick={() => setLocation('/tables')} className="px-8 py-4 bg-secondary text-foreground font-black rounded-xl">Volver a mesas</button>
      </div>
    );
  }

  const { ticket, order, items, payments, employeeName } = data;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col print:bg-white print:text-black">
      <style>{`
        @media print {
          @page { margin: 0; size: 80mm auto; }
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; }
          * { text-shadow: none !important; box-shadow: none !important; }
        }
      `}</style>

      {/* SCREEN VIEW */}
      <div className="flex-1 flex flex-col print:hidden">
        <header className="h-16 flex items-center px-4 border-b border-border bg-card shrink-0 shadow-sm">
          <button onClick={() => setLocation('/tables')} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 border border-transparent hover:border-border">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold ml-4">Ticket #{ticket.ticketNumber}</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center">
          {/* Actions */}
          <div className="flex gap-4 mb-8 w-full max-w-sm">
            <button
              onClick={() => window.print()}
              className="flex-1 py-4 bg-primary text-primary-foreground font-black uppercase tracking-wider rounded-xl shadow-[0_8px_20px_rgba(0,0,0,0.3)] hover:shadow-primary/30 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Printer size={24} /> Imprimir
            </button>
            <div className="flex-1 group relative">
              <button
                disabled
                className="w-full py-4 bg-secondary text-muted-foreground font-black uppercase tracking-wider rounded-xl cursor-not-allowed opacity-70 flex items-center justify-center gap-2 border-2 border-border"
              >
                <Mail size={24} /> Correo
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-foreground text-background text-xs font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                Disponible próximamente
              </div>
            </div>
          </div>

          {/* Preview Card */}
          <div className="bg-[#fdfcfb] text-black w-full max-w-sm p-6 rounded-sm shadow-2xl font-mono text-sm border-t-8 border-t-primary relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-black/5 to-transparent"></div>
            
            <div className="text-center font-bold text-2xl mb-4 tracking-widest uppercase text-black">🍽 Piccolo</div>
            <div className="border-b-2 border-dashed border-gray-400 mb-4"></div>
            
            <div className="mb-4 space-y-1 font-semibold text-gray-800">
              <div>Mesa: {order.tableName}</div>
              <div>Atiende: {employeeName}</div>
              <div>Fecha: {new Date(ticket.issuedAt).toLocaleString('es-ES')}</div>
              <div>Ticket: #{ticket.ticketNumber}</div>
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
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{parseFloat(ticket.subtotal).toFixed(2)}€</span>
              </div>
              <div className="flex justify-between">
                <span>IVA 10%</span>
                <span>{parseFloat(ticket.taxTotal).toFixed(2)}€</span>
              </div>
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
              <div className="font-bold text-gray-900 text-sm">¡Gracias por su visita!</div>
              <div>IVA incluido al tipo reducido del 10%</div>
            </div>
          </div>
        </div>
      </div>

      {/* PRINT VIEW (80mm) */}
      <div id="ticket-print" className="hidden print:block font-mono text-[12px] leading-tight w-[80mm] mx-auto bg-white text-black p-0">
        <div className="text-center font-bold text-xl mb-2 uppercase">🍽 Piccolo</div>
        <div className="border-b border-dashed border-black mb-2"></div>
        
        <div className="mb-2">
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
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{parseFloat(ticket.subtotal).toFixed(2)}€</span>
          </div>
          <div className="flex justify-between">
            <span>IVA 10%</span>
            <span>{parseFloat(ticket.taxTotal).toFixed(2)}€</span>
          </div>
          <div className="flex justify-between font-bold text-sm mt-1">
            <span>TOTAL</span>
            <span>{parseFloat(ticket.total).toFixed(2)}€</span>
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

        <div className="text-center">
          <div>Ticket #{ticket.ticketNumber}</div>
          <div className="mt-2 font-bold text-sm">¡Gracias por su visita!</div>
          <div className="text-[10px] mt-1">IVA incluido al tipo reducido del 10%</div>
        </div>
      </div>
    </div>
  );
}
