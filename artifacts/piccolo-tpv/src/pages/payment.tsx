import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Check, Loader2, Euro, CreditCard, Smartphone, FileText, X,
  Printer, Percent, Scissors, Wallet, Gift, Plus, Minus, ArrowRight, AlertCircle,
  Banknote, Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetOrderPaymentSummary,
  useAddPayment,
  useGetClients,
  useCreateInvoice,
  useCreateClient,
  useGetCurrentCashSession,
  useGetPaymentMethods,
  useAddDiscount,
  useAddTip,
  useCreateOrderSplits,
  useMarkSplitGroupPaid,
  useGetOrderSplits,
  getGetOrderPaymentSummaryQueryKey,
  getGetClientsQueryKey,
  getGetCurrentCashSessionQueryKey,
  getGetPaymentMethodsQueryKey,
  getGetOrderSplitsQueryKey,
  type AddPaymentInputMethodCode,
  type Invoice,
  type Client,
  type CreateClientInput,
  type PaymentMethod,
  type SplitGroupWithItems,
  type SplitGroupItemDetail,
} from '@workspace/api-client-react';

// ── helpers ───────────────────────────────────────────────────────────────────
const TAP_SLOP = 8;
function fmt(n: number | string) { return parseFloat(String(n)).toFixed(2); }
function parseAmt(s: string) { const n = parseFloat(s); return isNaN(n) ? 0 : n; }

function methodIcon(code: string) {
  if (code === 'cash')       return <Banknote className="w-5 h-5" />;
  if (code === 'card')       return <CreditCard className="w-5 h-5" />;
  if (code === 'bizum')      return <Smartphone className="w-5 h-5" />;
  if (code === 'transfer')   return <Building2 className="w-5 h-5" />;
  if (code === 'cheque_rest')return <FileText className="w-5 h-5" />;
  if (code === 'invitation') return <Gift className="w-5 h-5" />;
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

// ── TouchBtn ──────────────────────────────────────────────────────────────────
function TouchBtn({ children, onPress, className, disabled }: {
  children: React.ReactNode; onPress: () => void; className?: string; disabled?: boolean;
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
      onPointerDown={down} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
      disabled={disabled}
      style={{ touchAction: 'manipulation', userSelect: 'none' }}
      className={`${className} transition-all duration-75 ${pressed ? 'scale-95 brightness-75' : ''} disabled:opacity-40 disabled:pointer-events-none`}
    >
      {children}
    </button>
  );
}

// ── Cash Session Guard ────────────────────────────────────────────────────────
function CashSessionGuard({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-destructive/10 text-destructive mx-auto rounded-full flex items-center justify-center mb-4">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-xl font-black mb-2">Caja no abierta</h3>
        <p className="text-muted-foreground text-sm mb-6">
          No hay ninguna caja abierta en este terminal.<br />
          Debes abrir la caja antes de cobrar.
        </p>
        <div className="flex gap-3">
          <Link href="/tables"
            className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl text-center text-sm">
            Cancelar
          </Link>
          <button onClick={onOpen}
            className="flex-1 py-3 bg-primary text-primary-foreground font-black rounded-xl text-sm hover:bg-primary/90 transition-colors">
            Ir a Caja
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Discount Panel ────────────────────────────────────────────────────────────
interface DiscountPanelProps {
  orderId: string;
  orderTotal: number;
  userRole: string;
  onClose: () => void;
  onApplied: () => void;
}

function DiscountPanel({ orderId, orderTotal, userRole, onClose, onApplied }: DiscountPanelProps) {
  const addDiscount = useAddDiscount();
  const [type, setType] = useState<'percentage' | 'fixed' | 'invitation'>('percentage');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [applying, setApplying] = useState(false);

  const presets = type === 'percentage'
    ? ['5', '10', '15', '20', '50', '100']
    : ['1', '2', '5', '10'];

  const valueNum = parseFloat(value) || 0;
  const discountAmount = type === 'percentage'
    ? (orderTotal * valueNum / 100)
    : valueNum;
  const needsAdmin = (type === 'percentage' && valueNum > 20) || type === 'invitation';
  const cantApply = (userRole === 'waiter') || (needsAdmin && userRole !== 'admin');

  const handleApply = async () => {
    if (!value || valueNum <= 0) { toast.error('Introduce un valor'); return; }
    if (!reason.trim() || reason.trim().length < 3) { toast.error('El motivo es obligatorio'); return; }
    if (cantApply) { toast.error('No tienes permisos para este descuento'); return; }
    setApplying(true);
    try {
      await addDiscount.mutateAsync({ orderId, data: { type, value, reason: reason.trim() } });
      toast.success('Descuento aplicado');
      onApplied();
    } catch (e: any) {
      toast.error(e?.error ?? 'Error al aplicar descuento');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-t-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Percent size={18} className="text-primary" />
            <h3 className="font-black text-lg">Aplicar descuento</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Type selector */}
          <div className="flex gap-2 p-1 bg-secondary rounded-xl">
            <button onClick={() => setType('percentage')}
              className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${type === 'percentage' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              Porcentaje (%)
            </button>
            <button onClick={() => setType('fixed')}
              className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${type === 'fixed' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              Importe fijo (€)
            </button>
          </div>

          {/* Preset buttons */}
          <div className="grid grid-cols-3 gap-2">
            {presets.map(p => (
              <button key={p} onClick={() => setValue(p)}
                className={`py-2.5 rounded-xl border font-bold text-sm transition-all ${value === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                {p}{type === 'percentage' ? '%' : '€'}
              </button>
            ))}
          </div>

          {/* Value input */}
          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">
              Valor {type === 'percentage' ? '(%)' : '(€)'}
            </label>
            <input type="number" step="0.01" min="0" max={type === 'percentage' ? '100' : undefined}
              value={value} onChange={e => setValue(e.target.value)} placeholder="0"
              className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-2xl font-black font-mono text-center focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Preview */}
          {valueNum > 0 && (
            <div className={`rounded-xl p-3 text-sm ${needsAdmin ? 'bg-destructive/10 border border-destructive/30' : 'bg-primary/5 border border-primary/20'}`}>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descuento calculado</span>
                <span className="font-black text-primary">{fmt(discountAmount)}€</span>
              </div>
              {needsAdmin && (
                <p className="text-xs text-destructive mt-1 font-semibold">⚠ Requiere autorización de administrador</p>
              )}
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Motivo *</label>
            <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Ej. Descuento empleado, Promoción..."
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary resize-none transition-colors"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose}
            className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl text-sm">
            Cancelar
          </button>
          <button onClick={handleApply} disabled={applying || !value || !reason.trim() || cantApply}
            className="flex-1 py-3 bg-primary text-primary-foreground font-black rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tip Modal ─────────────────────────────────────────────────────────────────
interface TipModalProps {
  paymentId: string;
  onClose: () => void;
  onSaved: () => void;
}

function TipModal({ paymentId, onClose, onSaved }: TipModalProps) {
  const addTip = useAddTip();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card'>('cash');
  const [saving, setSaving] = useState(false);

  const presets = ['0.50', '1', '2', '5'];

  const handleSave = async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) { toast.error('Introduce un importe'); return; }
    setSaving(true);
    try {
      await addTip.mutateAsync({ paymentId, data: { amount: fmt(n), method } });
      toast.success(`Propina de ${fmt(n)}€ registrada`);
      onSaved();
    } catch {
      toast.error('Error al registrar propina');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-t-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-black text-lg">¿Añadir propina?</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Method */}
          <div className="flex gap-2 p-1 bg-secondary rounded-xl">
            <button onClick={() => setMethod('cash')}
              className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${method === 'cash' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              <Banknote size={15} /> Efectivo
            </button>
            <button onClick={() => setMethod('card')}
              className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${method === 'card' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              <CreditCard size={15} /> Tarjeta
            </button>
          </div>

          {/* Presets */}
          <div className="grid grid-cols-4 gap-2">
            {presets.map(p => (
              <button key={p} onClick={() => setAmount(p)}
                className={`py-2.5 rounded-xl border font-bold text-sm transition-all ${amount === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                {p}€
              </button>
            ))}
          </div>

          {/* Input */}
          <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
            className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-2xl font-black font-mono text-center focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl text-sm">
            Omitir
          </button>
          <button onClick={handleSave} disabled={saving || !amount || parseFloat(amount) <= 0}
            className="flex-1 py-3 bg-primary text-primary-foreground font-black rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Guardar propina
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Split Sheet ────────────────────────────────────────────────────────────────
interface SplitSheetProps {
  orderId: string;
  items: any[];
  remaining: number;
  onClose: () => void;
  onSplitCreated: (groups: SplitGroupWithItems[]) => void;
}

type SplitGroup = { label: string; items: { itemIndex: number; quantity: number }[] };

function SplitSheet({ orderId, items, remaining, onClose, onSplitCreated }: SplitSheetProps) {
  const createSplits = useCreateOrderSplits();
  const [mode, setMode] = useState<'equal' | 'items'>('equal');
  const [numParts, setNumParts] = useState(2);
  const [groups, setGroups] = useState<SplitGroup[]>([
    { label: 'Comensal 1', items: [] },
    { label: 'Comensal 2', items: [] },
  ]);
  const [saving, setSaving] = useState(false);

  const adjustParts = (delta: number) => {
    const next = Math.max(2, Math.min(8, numParts + delta));
    setNumParts(next);
    setGroups(prev => {
      if (next > prev.length) {
        return [...prev, ...Array.from({ length: next - prev.length }, (_, i) => ({
          label: `Comensal ${prev.length + i + 1}`,
          items: [],
        }))];
      }
      return prev.slice(0, next);
    });
  };

  const equalAmount = remaining / numParts;

  const handleCreate = async () => {
    setSaving(true);
    try {
      if (mode === 'equal') {
        // Create groups with all items equally split (assign all items to group 0 placeholder; server just splits by amount)
        const equalGroups = groups.map((g, i) => ({
          label: g.label,
          items: items.map(it => ({ orderItemId: it.id, quantity: it.quantity / numParts })),
        }));
        // For equal splits we send the groups but the frontend tracks by amount, not by item assignment
        // We still persist them for tracking
        const res = await createSplits.mutateAsync({
          orderId,
          data: { groups: groups.map(g => ({ label: g.label, items: items.map(it => ({ orderItemId: it.id, quantity: it.quantity / numParts })) })) },
        });
        onSplitCreated(res);
      } else {
        const apiGroups = groups
          .filter(g => g.items.length > 0)
          .map(g => ({
            label: g.label,
            items: g.items.map(gi => ({
              orderItemId: items[gi.itemIndex].id,
              quantity: gi.quantity,
            })),
          }));
        if (apiGroups.length === 0) {
          toast.error('Asigna al menos un artículo'); return;
        }
        const res = await createSplits.mutateAsync({ orderId, data: { groups: apiGroups } });
        onSplitCreated(res);
      }
    } catch (e: any) {
      toast.error(e?.error ?? 'Error al crear división');
    } finally {
      setSaving(false);
    }
  };

  const toggleItemInGroup = (groupIdx: number, itemIdx: number) => {
    setGroups(prev => {
      const next = prev.map((g, gi) => {
        if (gi !== groupIdx) return g;
        const has = g.items.some(x => x.itemIndex === itemIdx);
        return {
          ...g,
          items: has ? g.items.filter(x => x.itemIndex !== itemIdx) : [...g.items, { itemIndex: itemIdx, quantity: items[itemIdx].quantity }],
        };
      });
      return next;
    });
  };

  const isItemInGroup = (groupIdx: number, itemIdx: number) =>
    groups[groupIdx]?.items.some(x => x.itemIndex === itemIdx);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-t-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Scissors size={18} className="text-primary" />
            <h3 className="font-black text-lg">Dividir cuenta</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Mode */}
          <div className="flex gap-2 p-1 bg-secondary rounded-xl">
            <button onClick={() => setMode('equal')}
              className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${mode === 'equal' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              Partes iguales
            </button>
            <button onClick={() => setMode('items')}
              className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${mode === 'items' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              Por artículos
            </button>
          </div>

          {/* Number of parts */}
          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-3">Número de comensales</label>
            <div className="flex items-center justify-center gap-6">
              <button onClick={() => adjustParts(-1)} disabled={numParts <= 2}
                className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center disabled:opacity-40 hover:bg-secondary/80 transition-colors">
                <Minus size={20} />
              </button>
              <span className="text-4xl font-black w-12 text-center">{numParts}</span>
              <button onClick={() => adjustParts(1)} disabled={numParts >= 8}
                className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center disabled:opacity-40 hover:bg-secondary/80 transition-colors">
                <Plus size={20} />
              </button>
            </div>
          </div>

          {/* Group labels */}
          <div className="space-y-2">
            {groups.map((g, gi) => (
              <div key={gi} className="flex items-center gap-3">
                <input value={g.label} onChange={e => setGroups(prev => prev.map((p, i) => i === gi ? { ...p, label: e.target.value } : p))}
                  className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-primary transition-colors"
                />
                {mode === 'equal' && (
                  <span className="font-mono font-black text-primary shrink-0">{fmt(equalAmount)}€</span>
                )}
              </div>
            ))}
          </div>

          {/* Item assignment mode */}
          {mode === 'items' && (
            <div className="space-y-3">
              <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Asignar artículos</p>
              {items.map((item, ii) => (
                <div key={ii} className="bg-background border border-border rounded-xl p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-sm">{item.quantity}× {item.productName}</span>
                    <span className="font-mono text-sm">{fmt(item.lineTotal)}€</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {groups.map((g, gi) => (
                      <button key={gi} onClick={() => toggleItemInGroup(gi, ii)}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition-all ${isItemInGroup(gi, ii) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl text-sm">
            Cancelar
          </button>
          <button onClick={handleCreate} disabled={saving}
            className="flex-1 py-3 bg-primary text-primary-foreground font-black rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors size={16} />}
            Dividir
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Factura modal ────────────────────────────────────────────────────────────
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
      if (saveClient && form.name) {
        try { await createClient.mutateAsync({ data: form as CreateClientInput }); qc.invalidateQueries({ queryKey: getGetClientsQueryKey() }); } catch {}
      }
      const invoice = await createInvoice.mutateAsync({
        data: { orderId, clientName: form.name, clientNif: form.nif, clientAddress: form.address, clientCp: form.cp, clientCity: form.city, clientProvince: form.province, clientCountry: form.country, clientEmail: form.email, clientPhone: form.phone },
      });
      onIssued(invoice);
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al generar la factura');
    } finally { setIssuing(false); }
  };

  const handleSelectClient = (c: Client) => {
    setSelectedClientId(c.id);
    setForm({ name: c.name, nif: c.nif ?? '', address: c.address ?? '', cp: c.cp ?? '', city: c.city ?? '', province: c.province ?? '', country: c.country ?? 'España', email: c.email ?? '', phone: c.phone ?? '' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center"><FileText size={16} className="text-primary" /></div>
          <div className="flex-1">
            <h3 className="font-black text-lg leading-none">Generar factura completa</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Introduce los datos fiscales del cliente</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {clients.length > 0 && (
            <div>
              <label className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 block">Cliente guardado</label>
              <div className="flex flex-wrap gap-2 mb-2">
                <button onClick={() => { setSelectedClientId('new'); setForm({}); }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${selectedClientId === 'new' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
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
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <button onClick={() => setSaveClient(s => !s)}
              className={`w-10 h-6 rounded-full transition-colors shrink-0 ${saveClient ? 'bg-primary' : 'bg-secondary'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${saveClient ? 'translate-x-4' : ''}`} />
            </button>
            <span className="text-sm font-semibold text-muted-foreground">Guardar datos para futuros pedidos</span>
          </label>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl" style={{ touchAction: 'manipulation' }}>Cancelar</button>
          <button onClick={handleIssue} disabled={issuing || !form.name?.trim()}
            className="flex-1 py-3 bg-primary text-primary-foreground font-black rounded-xl flex items-center justify-center gap-2 disabled:opacity-50" style={{ touchAction: 'manipulation' }}>
            {issuing ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-4 h-4" />}
            Generar factura
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Invoice result ────────────────────────────────────────────────────────────
function InvoiceResult({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center"><Check size={16} className="text-green-400" /></div>
          <div className="flex-1">
            <h3 className="font-black text-lg leading-none text-green-400">Factura emitida</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{invoice.serie}-{invoice.invoiceNumber?.toString().padStart(4, '0')}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex justify-center"><VeriFactuPill status={invoice.verifactuStatus} /></div>
          <div className="bg-secondary/30 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Número</span><span className="font-bold">{invoice.serie}-{invoice.invoiceNumber?.toString().padStart(4, '0')}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span className="font-bold truncate ml-4 max-w-[60%] text-right">{invoice.clientName}</span></div>
            <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Base imponible</span><span className="font-bold">{parseFloat(invoice.subtotal).toFixed(2)}€</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span className="font-bold">{parseFloat(invoice.taxTotal).toFixed(2)}€</span></div>
            <div className="flex justify-between text-lg font-black"><span>TOTAL</span><span>{parseFloat(invoice.total).toFixed(2)}€</span></div>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          <button onClick={() => window.print()} className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl flex items-center justify-center gap-2 text-sm" style={{ touchAction: 'manipulation' }}>
            <Printer size={15} /> Imprimir
          </button>
          <button onClick={onClose} className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl text-sm" style={{ touchAction: 'manipulation' }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ── Split Pay Mode ────────────────────────────────────────────────────────────
interface SplitPayModeProps {
  orderId: string;
  groups: SplitGroupWithItems[];
  terminal?: string;
  onDone: () => void;
  onRefresh: () => void;
}

function SplitPayMode({ orderId, groups, terminal, onDone, onRefresh }: SplitPayModeProps) {
  const qc = useQueryClient();
  const addPayment   = useAddPayment();
  const markPaid     = useMarkSplitGroupPaid();
  const { data: methods = [] } = useGetPaymentMethods({ query: { queryKey: getGetPaymentMethodsQueryKey() } });

  const [activeGroup, setActiveGroup] = useState(groups.find(g => g.status === 'open')?.id ?? groups[0]?.id);
  const [amounts, setAmounts]   = useState<Record<string, string>>({});
  const [focused, setFocused]   = useState('cash');
  const [paying, setPaying]     = useState(false);

  const group = groups.find(g => g.id === activeGroup);
  const groupTotal = parseFloat(group?.total ?? '0');
  const groupPaid  = parseFloat(group?.paid  ?? '0');
  const groupRem   = Math.max(0, groupTotal - groupPaid);

  const unpaidGroups = groups.filter(g => g.status === 'open');
  const allPaid = unpaidGroups.length === 0;

  // Init amounts when group changes
  useEffect(() => {
    if (!group) return;
    const init: Record<string, string> = {};
    for (const m of methods) init[m.code] = '0';
    if (methods[0]) { init[methods[0].code] = fmt(groupRem); setFocused(methods[0].code); }
    setAmounts(init);
  }, [activeGroup, methods.length]);

  const handleNumpad = (val: string) => {
    setAmounts(prev => {
      const cur = prev[focused] ?? '0';
      if (val === 'backspace') { const n = cur.slice(0, -1); return { ...prev, [focused]: n || '0' }; }
      if (val === 'clear')  return { ...prev, [focused]: '0' };
      if (val === 'resto')  return { ...prev, [focused]: fmt(groupRem) };
      if (val === '.')      return cur.includes('.') ? prev : { ...prev, [focused]: cur + '.' };
      const base = cur === '0' ? val : cur + val;
      return { ...prev, [focused]: base };
    });
  };

  const enteredTotal = Object.values(amounts).reduce((s, v) => s + parseAmt(v), 0);
  const cashAmt      = parseAmt(amounts['cash'] ?? '0');
  const changeAmt    = focused === 'cash' && cashAmt > groupRem + 0.001 ? cashAmt - groupRem : 0;
  const effectiveTotal = enteredTotal - changeAmt;
  const canPay = effectiveTotal >= groupRem - 0.01 && enteredTotal > 0;

  const handlePay = async () => {
    if (!group) return;
    setPaying(true);
    let lastPaymentId: string | null = null;
    try {
      for (const m of methods) {
        const a = parseAmt(amounts[m.code] ?? '0');
        if (a <= 0) continue;
        const res = await new Promise<any>((resolve, reject) => {
          addPayment.mutate(
            { orderId, data: { methodCode: m.code as AddPaymentInputMethodCode, amount: fmt(a), terminal } },
            { onSuccess: resolve, onError: reject }
          );
        });
        lastPaymentId = res.payment?.id ?? null;
      }
      await markPaid.mutateAsync({ orderId, groupId: group.id, data: { paymentId: lastPaymentId ?? undefined } });
      qc.invalidateQueries({ queryKey: getGetOrderPaymentSummaryQueryKey(orderId) });
      qc.invalidateQueries({ queryKey: getGetOrderSplitsQueryKey(orderId) });
      toast.success(`${group.label} cobrado`);
      onRefresh();
    } catch (e: any) {
      toast.error(e?.error ?? 'Error al cobrar');
    } finally {
      setPaying(false);
    }
  };

  if (allPaid) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
          <Check size={40} className="text-green-400" />
        </div>
        <h3 className="text-2xl font-black text-green-400">Cuenta dividida y cobrada</h3>
        <button onClick={onDone} className="px-8 py-4 bg-primary text-primary-foreground font-black rounded-xl text-lg hover:bg-primary/90 transition-colors">
          Finalizar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Group tabs */}
      <div className="flex gap-2 p-3 border-b border-border overflow-x-auto shrink-0">
        {groups.map(g => (
          <button key={g.id} onClick={() => { if (g.status === 'open') setActiveGroup(g.id); }}
            className={`shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all border ${
              g.id === activeGroup ? 'border-primary bg-primary/10 text-primary' :
              g.status === 'paid' ? 'border-green-500/30 bg-green-500/10 text-green-400 cursor-default' :
              'border-border text-muted-foreground hover:border-primary'
            }`}>
            {g.status === 'paid' ? '✓ ' : ''}{g.label}
            <span className="ml-2 font-mono text-xs">{fmt(g.total)}€</span>
          </button>
        ))}
      </div>

      {group && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Group summary */}
          <div className="bg-secondary/30 rounded-xl p-3 flex justify-between items-center">
            <span className="font-semibold">{group.label}</span>
            <div className="text-right">
              <div className="font-mono font-black text-xl text-primary">{fmt(groupRem)}€ <span className="text-sm text-muted-foreground font-normal">pendiente</span></div>
            </div>
          </div>

          {/* Method tabs */}
          <div className="flex gap-2 flex-wrap">
            {methods.map(m => (
              <button key={m.code} onClick={() => setFocused(m.code)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-bold text-sm transition-all ${focused === m.code ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                {methodIcon(m.code)} {m.name}
              </button>
            ))}
          </div>

          {/* Amount input */}
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-1">{methods.find(m => m.code === focused)?.name}</p>
            <p className="text-4xl font-black font-mono">{amounts[focused] ?? '0'}€</p>
            {focused === 'cash' && changeAmt > 0.001 && (
              <p className="text-sm text-yellow-400 font-bold mt-1">Cambio: {fmt(changeAmt)}€</p>
            )}
          </div>

          {/* Quick cash amounts */}
          {focused === 'cash' && (
            <div className="grid grid-cols-3 gap-2">
              {[fmt(groupRem), '10', '20', '50', '100', ''].map((q, i) => (
                <button key={i} onClick={() => q && setAmounts(prev => ({ ...prev, cash: q }))}
                  disabled={!q}
                  className={`py-2.5 rounded-xl border font-bold text-sm transition-all disabled:opacity-0 ${amounts['cash'] === q ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                  {q === fmt(groupRem) ? 'Exacto' : q ? `${q}€` : ''}
                </button>
              ))}
            </div>
          )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2">
            {['7','8','9','4','5','6','1','2','3','.',  '0','backspace'].map(k => (
              <TouchBtn key={k} onPress={() => handleNumpad(k)}
                className="py-4 bg-secondary rounded-xl font-black text-lg text-center">
                {k === 'backspace' ? '⌫' : k}
              </TouchBtn>
            ))}
          </div>

          <TouchBtn onPress={handlePay} disabled={!canPay || paying}
            className="w-full py-5 bg-primary text-primary-foreground text-xl font-black rounded-xl shadow-lg flex items-center justify-center gap-3">
            {paying ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check size={22} />}
            Cobrar {group.label}
          </TouchBtn>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Payment() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [userRole, setUserRole]   = useState('');
  const [terminal, setTerminal]   = useState('');
  useEffect(() => {
    try { setUserRole(JSON.parse(localStorage.getItem('employee') ?? '{}').role ?? ''); } catch {}
    try { setTerminal(localStorage.getItem('cashTerminal') ?? ''); } catch {}
  }, []);

  // Pointer slop guard
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);
  const handlePointerDown = (e: React.PointerEvent) => { pointerOriginRef.current = { x: e.clientX, y: e.clientY }; };
  const guardedClick = (handler: () => void) => (e: React.MouseEvent) => {
    if (pointerOriginRef.current) {
      const dx = e.clientX - pointerOriginRef.current.x, dy = e.clientY - pointerOriginRef.current.y;
      if (Math.sqrt(dx*dx + dy*dy) > TAP_SLOP) { pointerOriginRef.current = null; return; }
    }
    pointerOriginRef.current = null;
    handler();
  };

  // Data fetching
  const terminalParam = terminal ? { terminal } : undefined;
  const { data: session, isLoading: loadingSession } = useGetCurrentCashSession(terminalParam, { query: { queryKey: getGetCurrentCashSessionQueryKey(terminalParam) } });
  const { data: summary, isLoading } = useGetOrderPaymentSummary(orderId!, { query: { enabled: !!orderId, queryKey: getGetOrderPaymentSummaryQueryKey(orderId!) } });
  const { data: paymentMethods = [], isLoading: loadingMethods } = useGetPaymentMethods({ query: { queryKey: getGetPaymentMethodsQueryKey() } });
  const { data: splits = [], refetch: refetchSplits } = useGetOrderSplits(orderId!, { query: { enabled: !!orderId, queryKey: getGetOrderSplitsQueryKey(orderId!) } });

  const addPayment = useAddPayment();

  // UI state
  const [amounts, setAmounts]             = useState<Record<string, string>>({});
  const [focused, setFocused]             = useState<string>('cash');
  const [showConfirm, setShowConfirm]     = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [showFacturaModal, setShowFacturaModal] = useState(false);
  const [issuedInvoice, setIssuedInvoice] = useState<Invoice | null>(null);
  const [showDiscount, setShowDiscount]   = useState(false);
  const [showSplit, setShowSplit]         = useState(false);
  const [splitGroups, setSplitGroups]     = useState<SplitGroupWithItems[] | null>(null);
  const [tipPaymentId, setTipPaymentId]   = useState<string | null>(null);

  const initialised = useRef(false);
  useEffect(() => {
    if (!summary || !paymentMethods.length || initialised.current) return;
    initialised.current = true;
    const init: Record<string, string> = {};
    for (const m of paymentMethods) init[m.code] = '0';
    const first = paymentMethods[0];
    if (first) { init[first.code] = summary.remaining; setFocused(first.code); }
    setAmounts(init);
  }, [summary, paymentMethods]);

  // Sync split state from DB on load
  useEffect(() => {
    if (splits.length > 0) setSplitGroups(splits);
  }, [splits]);

  const remainingNum = summary ? parseAmt(summary.remaining) : 0;

  const handleNumpad = useCallback((val: string) => {
    setAmounts(prev => {
      const cur = prev[focused] ?? '0';
      if (val === 'backspace') { const n = cur.slice(0, -1); return { ...prev, [focused]: n || '0' }; }
      if (val === 'clear')     return { ...prev, [focused]: '0' };
      if (val === 'resto') {
        const others = Object.entries(prev).filter(([k]) => k !== focused).reduce((s, [, v]) => s + parseAmt(v), 0);
        return { ...prev, [focused]: fmt(Math.max(0, remainingNum - others)) };
      }
      if (val === '.') return cur.includes('.') ? prev : { ...prev, [focused]: cur + '.' };
      const base = cur === '0' ? val : cur + val;
      return { ...prev, [focused]: base };
    });
  }, [focused, remainingNum]);

  if (loadingSession || isLoading || loadingMethods) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-10 h-10 animate-spin text-muted-foreground" /></div>;
  }

  // Cash session guard
  if (!session) {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-background text-foreground">
        <div className="p-4 border-b border-border bg-card flex items-center justify-between">
          <h1 className="text-xl font-bold text-primary">Cobro</h1>
          <Link href="/tables" className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors"><ChevronLeft size={24} /></Link>
        </div>
        <CashSessionGuard onOpen={() => setLocation('/caja')} />
      </div>
    );
  }

  if (!summary) return null;

  const { order, items, subtotal, taxTotal, total, paid, remaining, payments } = summary;

  const enteredTotal    = Object.values(amounts).reduce((s, v) => s + parseAmt(v), 0);
  const focusedAmt      = parseAmt(amounts[focused] ?? '0');
  const leftover        = Math.max(0, remainingNum - enteredTotal + focusedAmt);
  const nonZeroMethods  = paymentMethods.filter(m => parseAmt(amounts[m.code] ?? '0') > 0);
  const isCash          = focused === 'cash';
  const hasChange       = isCash && focusedAmt > leftover + 0.001;
  const changeAmt       = hasChange ? focusedAmt - leftover : 0;
  const nonCashOverflow = paymentMethods.some(m => m.code !== 'cash' && parseAmt(amounts[m.code] ?? '0') > remainingNum + 0.001);
  const effectiveTotal  = enteredTotal - changeAmt;
  const canSubmit       = nonZeroMethods.length > 0 && effectiveTotal >= remainingNum - 0.01 && !nonCashOverflow;
  const isPaid          = order.status === 'paid';

  const submitAll = async () => {
    setSubmitting(true);
    let lastChange = 0;
    let lastPaymentId: string | null = null;
    for (const m of paymentMethods) {
      const amtStr = amounts[m.code] ?? '0';
      if (parseAmt(amtStr) <= 0) continue;
      try {
        const res = await new Promise<any>((resolve, reject) => {
          addPayment.mutate(
            { orderId: orderId!, data: { methodCode: m.code as AddPaymentInputMethodCode, amount: amtStr, terminal: terminal || undefined } },
            { onSuccess: resolve, onError: reject }
          );
        });
        lastChange    = parseFloat(res.change ?? '0');
        lastPaymentId = res.payment?.id ?? null;
      } catch (e: any) {
        toast.error(`Error al cobrar ${m.name}: ${e?.error ?? ''}`);
        setSubmitting(false); setShowConfirm(false); return;
      }
    }
    setSubmitting(false); setShowConfirm(false);
    queryClient.invalidateQueries({ queryKey: getGetOrderPaymentSummaryQueryKey(orderId!) });
    if (lastChange > 0) toast.success(`Cobro completo. Cambio: ${fmt(lastChange)}€`);
    else toast.success('Cobro completo.');
    // Offer tip if payment is a direct (non-split) cash/card payment
    if (lastPaymentId) {
      setTipPaymentId(lastPaymentId);
    } else {
      setTimeout(() => setLocation(`/ticket/${orderId}`), 1200);
    }
  };

  // Split flow
  if (splitGroups && splitGroups.length > 0) {
    return (
      <div className="flex flex-col lg:flex-row min-h-[100dvh] bg-background text-foreground overflow-hidden">
        {tipPaymentId && (
          <TipModal paymentId={tipPaymentId} onClose={() => { setTipPaymentId(null); setLocation(`/ticket/${orderId}`); }} onSaved={() => { setTipPaymentId(null); setLocation(`/ticket/${orderId}`); }} />
        )}
        {/* Order summary sidebar */}
        <div className="flex-1 border-b lg:border-b-0 lg:border-r border-border bg-card lg:max-w-xs shrink-0 flex flex-col h-[30vh] lg:h-full">
          <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
            <h1 className="text-lg font-bold text-primary">Dividir — {order.tableName}</h1>
            <Link href="/tables" className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors"><ChevronLeft size={20} /></Link>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {items.map((it, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-border/40 pb-1">
                <span>{it.quantity}× {it.productName}</span>
                <span className="font-mono">{fmt(it.lineTotal)}€</span>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-border bg-secondary/20 shrink-0">
            <div className="flex justify-between font-black">
              <span>Total</span>
              <span className="font-mono">{fmt(total)}€</span>
            </div>
          </div>
        </div>

        {/* Split pay right panel */}
        <div className="flex-1 flex flex-col h-[70vh] lg:h-full overflow-hidden">
          <SplitPayMode
            orderId={orderId!}
            groups={splitGroups}
            terminal={terminal || undefined}
            onRefresh={() => { refetchSplits(); queryClient.invalidateQueries({ queryKey: getGetOrderSplitsQueryKey(orderId!) }); }}
            onDone={() => {
              setSplitGroups(null);
              queryClient.invalidateQueries({ queryKey: getGetOrderPaymentSummaryQueryKey(orderId!) });
              setLocation(`/ticket/${orderId}`);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-[100dvh] bg-background text-foreground overflow-hidden">
      {/* Modals */}
      {showFacturaModal && orderId && (
        <FacturaModal orderId={orderId} onClose={() => setShowFacturaModal(false)} onIssued={inv => { setShowFacturaModal(false); setIssuedInvoice(inv); }} />
      )}
      {issuedInvoice && <InvoiceResult invoice={issuedInvoice} onClose={() => setIssuedInvoice(null)} />}
      {showDiscount && (
        <DiscountPanel
          orderId={orderId!} orderTotal={parseFloat(total)} userRole={userRole}
          onClose={() => setShowDiscount(false)}
          onApplied={() => { setShowDiscount(false); queryClient.invalidateQueries({ queryKey: getGetOrderPaymentSummaryQueryKey(orderId!) }); }}
        />
      )}
      {showSplit && (
        <SplitSheet
          orderId={orderId!} items={items} remaining={remainingNum}
          onClose={() => setShowSplit(false)}
          onSplitCreated={groups => { setShowSplit(false); setSplitGroups(groups); }}
        />
      )}
      {tipPaymentId && (
        <TipModal
          paymentId={tipPaymentId}
          onClose={() => { setTipPaymentId(null); setLocation(`/ticket/${orderId}`); }}
          onSaved={() => { setTipPaymentId(null); setLocation(`/ticket/${orderId}`); }}
        />
      )}

      {/* ── LEFT: order summary ── */}
      <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-border bg-card lg:max-w-md xl:max-w-lg shrink-0 h-[38vh] lg:h-full">
        <div className="p-4 border-b border-border bg-secondary/30 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold leading-none text-primary">Cobro — {order.tableName}</h1>
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{order.employeeName}</span>
          </div>
          <Link href="/tables" className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"><ChevronLeft size={24} /></Link>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2" onPointerDown={handlePointerDown}>
          {items.map((item, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0" onClick={guardedClick(() => {})}>
              <div className="flex items-center gap-3">
                <span className="font-bold text-muted-foreground">{item.quantity}×</span>
                <span className="font-semibold">{item.productName}</span>
              </div>
              <span className="font-mono">{parseFloat(item.lineTotal).toFixed(2)}€</span>
            </div>
          ))}
        </div>

        {/* Totals + action buttons */}
        <div className="p-4 bg-secondary/20 border-t border-border shrink-0 space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span><span className="font-mono">{fmt(subtotal)}€</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>IVA (10%)</span><span className="font-mono">{fmt(taxTotal)}€</span>
          </div>
          <div className="flex justify-between font-black text-lg">
            <span>Total</span><span className="font-mono">{fmt(total)}€</span>
          </div>
          {parseFloat(paid) > 0 && (
            <>
              <div className="flex justify-between text-sm text-green-400">
                <span>Pagado</span><span className="font-mono">{fmt(paid)}€</span>
              </div>
              <div className="flex justify-between font-black text-primary text-lg">
                <span>Pendiente</span><span className="font-mono">{fmt(remaining)}€</span>
              </div>
            </>
          )}

          {/* Action buttons */}
          {!isPaid && (
            <div className="flex gap-2 pt-1">
              {['admin','manager'].includes(userRole) && (
                <button onClick={() => setShowDiscount(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-secondary text-muted-foreground font-bold rounded-xl text-xs hover:text-primary hover:border-primary border border-border transition-colors">
                  <Percent size={14} /> Descuento
                </button>
              )}
              <button onClick={() => setShowSplit(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-secondary text-muted-foreground font-bold rounded-xl text-xs hover:text-primary hover:border-primary border border-border transition-colors">
                <Scissors size={14} /> Dividir
              </button>
              {!isPaid && (
                <button onClick={() => setShowFacturaModal(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-secondary text-muted-foreground font-bold rounded-xl text-xs hover:text-primary hover:border-primary border border-border transition-colors">
                  <FileText size={14} /> Factura
                </button>
              )}
            </div>
          )}

          {/* Existing payments */}
          {payments.length > 0 && (
            <div className="pt-2 space-y-1">
              {payments.map((p, i) => (
                <div key={i} className="flex justify-between text-xs text-muted-foreground">
                  <span>{p.methodName}</span>
                  <span className="font-mono">{parseFloat(p.amount).toFixed(2)}€</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: payment panel ── */}
      <div className="flex-1 flex flex-col bg-background h-[62vh] lg:h-full overflow-hidden">
        {isPaid ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
            <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check size={48} className="text-green-400" />
            </div>
            <h2 className="text-3xl font-black text-green-400">Cobrado</h2>
            <div className="flex gap-3">
              <button onClick={() => setShowFacturaModal(true)}
                className="flex items-center gap-2 px-5 py-3 bg-secondary text-foreground font-bold rounded-xl text-sm hover:bg-secondary/80 transition-colors">
                <FileText size={16} /> Factura
              </button>
              <Link href={`/ticket/${orderId}`}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-black rounded-xl text-sm hover:bg-primary/90 transition-colors">
                Ver ticket <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Method tabs */}
            <div className="flex gap-1.5 p-3 border-b border-border overflow-x-auto shrink-0">
              {paymentMethods.map(m => (
                <button key={m.code} onClick={() => setFocused(m.code)}
                  className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border font-bold text-sm transition-all ${focused === m.code ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                  {methodIcon(m.code)} {m.name}
                  {parseAmt(amounts[m.code] ?? '0') > 0 && (
                    <span className="font-mono text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                      {fmt(amounts[m.code])}€
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Amount display */}
            <div className="p-4 text-center border-b border-border shrink-0">
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-1">
                {paymentMethods.find(m => m.code === focused)?.name ?? focused}
              </p>
              <p className="text-5xl font-black font-mono">{amounts[focused] ?? '0'}€</p>
              {isCash && changeAmt > 0.001 && (
                <p className="text-base font-bold text-yellow-400 mt-1">Cambio: {fmt(changeAmt)}€</p>
              )}
            </div>

            {/* Quick cash buttons */}
            {focused === 'cash' && (
              <div className="grid grid-cols-3 gap-2 px-3 pt-3 shrink-0">
                {[fmt(remainingNum), '10', '20', '50', '100', ''].map((q, i) => (
                  <button key={i} onClick={() => q && setAmounts(prev => ({ ...prev, cash: q }))}
                    disabled={!q}
                    className={`py-2 rounded-xl border font-bold text-sm transition-all disabled:opacity-0 ${amounts['cash'] === q ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                    {q === fmt(remainingNum) ? 'Exacto' : q ? `${q}€` : ''}
                  </button>
                ))}
              </div>
            )}

            {/* Totals strip */}
            <div className="grid grid-cols-3 gap-2 px-3 py-2 text-center text-xs shrink-0">
              <div className="bg-secondary/30 rounded-lg p-2">
                <p className="text-muted-foreground">Total</p>
                <p className="font-black font-mono">{fmt(total)}€</p>
              </div>
              <div className="bg-secondary/30 rounded-lg p-2">
                <p className="text-muted-foreground">Pendiente</p>
                <p className="font-black font-mono text-primary">{fmt(remaining)}€</p>
              </div>
              <div className="bg-secondary/30 rounded-lg p-2">
                <p className="text-muted-foreground">Introducido</p>
                <p className={`font-black font-mono ${effectiveTotal >= remainingNum - 0.01 ? 'text-green-400' : ''}`}>{fmt(effectiveTotal)}€</p>
              </div>
            </div>

            {/* Numpad */}
            <div className="flex-1 grid grid-cols-3 gap-1.5 p-3 content-start">
              {['7','8','9','4','5','6','1','2','3','.','0','backspace'].map(k => (
                <TouchBtn key={k} onPress={() => handleNumpad(k)}
                  className="py-4 bg-secondary rounded-xl font-black text-xl text-center">
                  {k === 'backspace' ? '⌫' : k}
                </TouchBtn>
              ))}

              {/* Confirm button */}
              <TouchBtn onPress={() => setShowConfirm(true)} disabled={!canSubmit}
                className="col-span-3 py-5 bg-primary text-primary-foreground text-xl font-black rounded-xl shadow-lg flex items-center justify-center gap-3 mt-1">
                <Check size={24} /> Cobrar {fmt(effectiveTotal)}€
                {changeAmt > 0.001 && ` · Cambio ${fmt(changeAmt)}€`}
              </TouchBtn>
            </div>
          </>
        )}
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-black mb-4 text-center">Confirmar cobro</h3>
            <div className="space-y-2 mb-6">
              {nonZeroMethods.map(m => {
                const a = parseAmt(amounts[m.code] ?? '0');
                const eff = m.code === 'cash' ? Math.min(a, remainingNum) : a;
                return (
                  <div key={m.code} className="flex justify-between items-center bg-secondary/30 rounded-xl p-3">
                    <div className="flex items-center gap-2">{methodIcon(m.code)}<span className="font-bold">{m.name}</span></div>
                    <span className="font-mono font-black">{fmt(eff)}€</span>
                  </div>
                );
              })}
              {changeAmt > 0.001 && (
                <div className="flex justify-between items-center bg-yellow-500/10 rounded-xl p-3">
                  <span className="font-bold text-yellow-400">Cambio a devolver</span>
                  <span className="font-mono font-black text-yellow-400">{fmt(changeAmt)}€</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 font-black text-lg">
                <span>Total cobrado</span>
                <span className="font-mono">{fmt(effectiveTotal)}€</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} disabled={submitting}
                className="flex-1 py-4 bg-secondary text-foreground font-bold rounded-xl text-lg">
                Cancelar
              </button>
              <button onClick={submitAll} disabled={submitting}
                className="flex-1 py-4 bg-primary text-primary-foreground font-black rounded-xl text-lg flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
