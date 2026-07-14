import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Check, Loader2, Euro, CreditCard, Smartphone, FileText, X, Printer } from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetOrderPaymentSummary,
  useAddPayment,
  useGetClients,
  useCreateInvoice,
  useCreateClient,
  getGetOrderPaymentSummaryQueryKey,
  getGetClientsQueryKey,
  type AddPaymentInputMethodCode,
  type Invoice,
  type Client,
  type CreateClientInput,
} from '@workspace/api-client-react';

// ── tap-slop guard ────────────────────────────────────────────────────────────
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

// ── VeriFactu pill ────────────────────────────────────────────────────────────
function VeriFactuPill({ status }: { status: string }) {
  const info = status === 'accepted'
    ? { label: 'VeriFactu aceptado', cls: 'bg-green-500/10 text-green-400 border-green-500/30' }
    : { label: 'Integración fiscal pendiente', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${info.cls}`}>
      {info.label}
    </span>
  );
}

// ── TouchBtn — reliable touch feedback ────────────────────────────────────────
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

// ── Factura completa modal ────────────────────────────────────────────────────
interface FacturaModalProps {
  orderId: string;
  onClose: () => void;
  onIssued: (invoice: Invoice) => void;
}

function FacturaModal({ orderId, onClose, onIssued }: FacturaModalProps) {
  const qc = useQueryClient();
  const { data: clients = [] } = useGetClients({ query: { queryKey: getGetClientsQueryKey() } });
  const createInvoice = useCreateInvoice();
  const createClient  = useCreateClient();

  const [selectedClientId, setSelectedClientId] = useState<string>('new');
  const [form, setForm] = useState<Partial<CreateClientInput>>({});
  const [saveClient, setSaveClient] = useState(false);
  const [issuing, setIssuing] = useState(false);

  const setF = (k: keyof CreateClientInput, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleIssue = async () => {
    if (!form.name?.trim()) { toast.error('El nombre es obligatorio'); return; }
    setIssuing(true);
    try {
      // Optionally save client for next time
      if (saveClient && form.name) {
        try {
          await createClient.mutateAsync({ data: form as CreateClientInput });
          qc.invalidateQueries({ queryKey: getGetClientsQueryKey() });
        } catch {}
      }
      const invoice = await createInvoice.mutateAsync({
        data: {
          orderId,
          clientName:    form.name,
          clientNif:     form.nif,
          clientAddress: form.address,
          clientCp:      form.cp,
          clientCity:    form.city,
          clientProvince:form.province,
          clientCountry: form.country,
          clientEmail:   form.email,
          clientPhone:   form.phone,
        },
      });
      onIssued(invoice);
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al generar la factura');
    } finally {
      setIssuing(false);
    }
  };

  const handleSelectClient = (c: Client) => {
    setSelectedClientId(c.id);
    setForm({
      name:     c.name,
      nif:      c.nif ?? '',
      address:  c.address ?? '',
      cp:       c.cp ?? '',
      city:     c.city ?? '',
      province: c.province ?? '',
      country:  c.country ?? 'España',
      email:    c.email ?? '',
      phone:    c.phone ?? '',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText size={16} className="text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-lg leading-none">Generar factura completa</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Introduce los datos fiscales del cliente</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Saved clients picker */}
          {clients.length > 0 && (
            <div>
              <label className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 block">Cliente guardado</label>
              <div className="flex flex-wrap gap-2 mb-2">
                <button
                  onClick={() => { setSelectedClientId('new'); setForm({}); }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${selectedClientId === 'new' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                >
                  + Nuevo cliente
                </button>
                {clients.slice(0, 6).map(c => (
                  <button key={c.id} onClick={() => handleSelectClient(c)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${selectedClientId === c.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Client data form */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Nombre / Razón social *</label>
              <input value={form.name ?? ''} onChange={e => setF('name', e.target.value)} placeholder="Empresa Ejemplo S.L."
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">NIF / CIF</label>
              <input value={form.nif ?? ''} onChange={e => setF('nif', e.target.value)} placeholder="B12345678"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Email</label>
              <input type="email" value={form.email ?? ''} onChange={e => setF('email', e.target.value)} placeholder="info@empresa.es"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Dirección fiscal</label>
              <input value={form.address ?? ''} onChange={e => setF('address', e.target.value)} placeholder="Calle Mayor 1"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">CP</label>
              <input value={form.cp ?? ''} onChange={e => setF('cp', e.target.value)} placeholder="43580"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Localidad</label>
              <input value={form.city ?? ''} onChange={e => setF('city', e.target.value)} placeholder="La Ràpita"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          {/* Save client toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <button onClick={() => setSaveClient(s => !s)}
              className={`w-10 h-6 rounded-full transition-colors shrink-0 ${saveClient ? 'bg-primary' : 'bg-secondary'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${saveClient ? 'translate-x-4' : ''}`} />
            </button>
            <span className="text-sm font-semibold text-muted-foreground">Guardar datos para futuros pedidos</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl" style={{ touchAction: 'manipulation' }}>
            Cancelar
          </button>
          <button onClick={handleIssue} disabled={issuing || !form.name?.trim()}
            className="flex-1 py-3 bg-primary text-primary-foreground font-black rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ touchAction: 'manipulation' }}>
            {issuing ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-4 h-4" />}
            Generar factura
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Invoice result display ────────────────────────────────────────────────────
interface InvoiceResultProps {
  invoice: Invoice;
  onClose: () => void;
}

function InvoiceResult({ invoice, onClose }: InvoiceResultProps) {
  const handlePrint = () => window.print();
  const handlePdf = () => {
    const el = document.createElement('style');
    el.textContent = `@media print { @page { size: A4; margin: 20mm; } }`;
    document.head.appendChild(el);
    window.print();
    setTimeout(() => el.remove(), 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Check size={16} className="text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-lg leading-none text-green-400">Factura emitida</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {invoice.serie}-{invoice.invoiceNumber?.toString().padStart(4, '0')}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* VeriFactu status */}
          <div className="flex justify-center">
            <VeriFactuPill status={invoice.verifactuStatus} />
          </div>

          {/* Invoice summary */}
          <div className="bg-secondary/30 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Número</span>
              <span className="font-bold">{invoice.serie}-{invoice.invoiceNumber?.toString().padStart(4, '0')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <span className="font-bold truncate ml-4 max-w-[60%] text-right">{invoice.clientName}</span>
            </div>
            {invoice.clientNif && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">NIF</span>
                <span className="font-bold">{invoice.clientNif}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 mt-2">
              <span className="text-muted-foreground">Base imponible</span>
              <span className="font-bold">{parseFloat(invoice.subtotal).toFixed(2)}€</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span className="font-bold">{parseFloat(invoice.taxTotal).toFixed(2)}€</span>
            </div>
            <div className="flex justify-between text-lg font-black">
              <span>TOTAL</span>
              <span>{parseFloat(invoice.total).toFixed(2)}€</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          <button onClick={handlePrint}
            className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl flex items-center justify-center gap-2 text-sm"
            style={{ touchAction: 'manipulation' }}>
            <Printer size={15} /> Imprimir
          </button>
          <button onClick={handlePdf}
            className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2 text-sm"
            style={{ touchAction: 'manipulation' }}>
            <FileText size={15} /> Descargar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Payment() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

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

  const [amounts, setAmounts]         = useState<Record<string, string>>({});
  const [focused, setFocused]         = useState<string>('cash');
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [showFacturaModal, setShowFacturaModal] = useState(false);
  const [issuedInvoice, setIssuedInvoice]       = useState<Invoice | null>(null);

  const initialised = useRef(false);
  useEffect(() => {
    if (!summary || initialised.current) return;
    initialised.current = true;
    const init: Record<string, string> = {};
    for (const m of summary.methods) init[m.code] = '0';
    if (summary.methods[0]) {
      init[summary.methods[0].code] = summary.remaining;
      setFocused(summary.methods[0].code);
    }
    setAmounts(init);
  }, [summary]);

  const remainingNum = summary ? parseAmt(summary.remaining) : 0;

  const handleNumpad = useCallback((val: string) => {
    setAmounts(prev => {
      const cur = prev[focused] ?? '0';
      if (val === 'backspace') {
        const next = cur.slice(0, -1);
        return { ...prev, [focused]: next === '' ? '0' : next };
      }
      if (val === 'clear') return { ...prev, [focused]: '0' };
      if (val === 'resto') {
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
      const base = cur === '0' ? val : cur + val;
      return { ...prev, [focused]: base };
    });
  }, [focused, remainingNum]);

  if (isLoading || !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { order, items, subtotal, taxTotal, total, paid, remaining, methods, payments } = summary;

  const enteredTotal    = Object.values(amounts).reduce((s, v) => s + parseAmt(v), 0);
  const focusedAmt      = parseAmt(amounts[focused] ?? '0');
  const leftover        = Math.max(0, remainingNum - enteredTotal + focusedAmt);
  const nonZeroMethods  = methods.filter(m => parseAmt(amounts[m.code] ?? '0') > 0);
  const hasChange       = focused === 'cash' && focusedAmt > leftover + 0.001;
  const changeAmt       = hasChange ? focusedAmt - leftover : 0;
  const nonCashOverflow = methods.some(m =>
    m.code !== 'cash' && parseAmt(amounts[m.code] ?? '0') > remainingNum + 0.001
  );
  const effectiveTotal  = enteredTotal - changeAmt;
  const canSubmit       = nonZeroMethods.length > 0 && effectiveTotal >= remainingNum - 0.01 && !nonCashOverflow;

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

  return (
    <div className="flex flex-col lg:flex-row min-h-[100dvh] bg-background text-foreground overflow-hidden">

      {/* Factura modal */}
      {showFacturaModal && orderId && (
        <FacturaModal
          orderId={orderId}
          onClose={() => setShowFacturaModal(false)}
          onIssued={(inv) => { setShowFacturaModal(false); setIssuedInvoice(inv); }}
        />
      )}
      {issuedInvoice && (
        <InvoiceResult invoice={issuedInvoice} onClose={() => setIssuedInvoice(null)} />
      )}

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
            <h2 className="text-4xl font-black text-green-500 mb-6">¡COBRADO!</h2>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <button onClick={() => setLocation(`/ticket/${orderId}`)}
                className="w-full px-8 py-4 bg-primary text-primary-foreground text-xl font-black uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all shadow-lg"
                style={{ touchAction: 'manipulation' }}>
                Ver Ticket
              </button>
              <button
                onClick={() => setShowFacturaModal(true)}
                className="w-full px-8 py-4 bg-secondary text-foreground text-base font-black uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all border-2 border-border hover:border-primary/40 flex items-center justify-center gap-2"
                style={{ touchAction: 'manipulation' }}>
                <FileText size={18} /> Generar factura completa
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-3 lg:p-6 gap-3 max-w-2xl mx-auto w-full">

            {/* ── Method cards ── */}
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
                    {isFocused && <span className="w-1.5 h-1.5 rounded-full bg-primary mt-0.5" />}
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
