import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Loader2, Euro, ArrowUpRight, ArrowDownRight, Wallet,
  CheckCircle2, AlertCircle, ClipboardList, History, Settings, Eye, EyeOff, X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetCurrentCashSession,
  useOpenCashSession,
  useAddCashMovement,
  useCloseCashSession,
  useGetCashSessionSummary,
  useGetCashSessionHistory,
  getGetCurrentCashSessionQueryKey,
  getGetCashSessionSummaryQueryKey,
  getGetCashSessionHistoryQueryKey,
} from '@workspace/api-client-react';

function fmt(n: number | string) { return parseFloat(String(n)).toFixed(2); }
function fmtDate(d: string) {
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TERMINAL_PRESETS = ['Caja principal', 'Caja barra', 'Caja terraza', 'Caja sala'];

// ─── Closing Wizard ────────────────────────────────────────────────────────────
interface CloseWizardProps {
  session: any;
  summary: any;
  onClose: () => void;
  onClosed: (diff: string, sessionId: string) => void;
}

function CloseWizard({ session, summary, onClose, onClosed }: CloseWizardProps) {
  const queryClient = useQueryClient();
  const closeSession = useCloseCashSession();

  const [step, setStep] = useState(1); // 1=summary, 2=count, 3=confirm
  const [countedCash, setCountedCash] = useState('');
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const cashSales = parseFloat(summary?.salesByMethod?.find((m: any) => m.methodCode === 'cash')?.total ?? '0');
  const movIn  = summary?.movements?.filter((m: any) => m.movementType === 'in').reduce((a: number, m: any) => a + parseFloat(m.amount), 0) ?? 0;
  const movOut = summary?.movements?.filter((m: any) => m.movementType === 'out').reduce((a: number, m: any) => a + parseFloat(m.amount), 0) ?? 0;
  const expectedCash = parseFloat(session.openingFloat) + cashSales + movIn - movOut;
  const countedNum   = parseFloat(countedCash) || 0;
  const difference   = countedNum - expectedCash;
  const diffAbs      = Math.abs(difference);
  const needsReason  = diffAbs > 5;

  const salesTotal = summary?.salesByMethod?.reduce((a: number, m: any) => a + parseFloat(m.total ?? '0'), 0) ?? 0;

  const METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo', card: 'Tarjeta', bizum: 'Bizum',
    transfer: 'Transferencia', cheque_rest: 'Cheque restaurante',
    invitation: 'Invitación', other: 'Otro',
  };

  const handleConfirm = async () => {
    if (!countedCash) { toast.error('Introduce el efectivo contado'); return; }
    if (needsReason && !discrepancyReason.trim()) { toast.error('Explica el descuadre'); return; }
    setSubmitting(true);
    try {
      const res = await new Promise<any>((resolve, reject) => {
        closeSession.mutate(
          { id: session.id, data: { countedCash, discrepancyReason: discrepancyReason || undefined, closingNotes: closingNotes || undefined } },
          { onSuccess: resolve, onError: reject }
        );
      });
      queryClient.invalidateQueries({ queryKey: getGetCurrentCashSessionQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetCashSessionHistoryQueryKey() });
      onClosed(res.difference ?? '0', res.id);
    } catch (e: any) {
      const msg = e?.error ?? 'Error al cerrar caja';
      if (msg.includes('explicación')) {
        toast.error(msg);
        setStep(3);
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-destructive/10 text-destructive rounded-lg flex items-center justify-center text-sm font-black">
              {step}/3
            </div>
            <h2 className="text-lg font-black">
              {step === 1 ? 'Resumen de turno' : step === 2 ? 'Recuento de efectivo' : 'Confirmar cierre'}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {step === 1 && (
            <>
              <div className="bg-secondary/30 rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Terminal</span>
                  <span className="font-bold">{session.terminalName}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Apertura</span>
                  <span className="font-bold">{fmtDate(session.openedAt)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Fondo inicial</span>
                  <span className="font-bold font-mono">{fmt(session.openingFloat)}€</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Ventas por método</p>
                {(summary?.salesByMethod ?? []).map((m: any) => (
                  <div key={m.methodCode} className="flex justify-between text-sm border-b border-border/40 pb-1">
                    <span>{METHOD_LABELS[m.methodCode] ?? m.methodName}</span>
                    <span className="font-mono font-bold">{fmt(m.total ?? '0')}€</span>
                  </div>
                ))}
                <div className="flex justify-between font-black text-lg pt-1">
                  <span>Total ventas</span>
                  <span className="font-mono text-green-400">{fmt(salesTotal)}€</span>
                </div>
              </div>

              {(summary?.movements?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Movimientos</p>
                  {summary.movements.map((m: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{m.reason}</span>
                      <span className={`font-mono ${m.movementType === 'in' ? 'text-green-400' : 'text-destructive'}`}>
                        {m.movementType === 'in' ? '+' : '-'}{fmt(m.amount)}€
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              {!session.blindClose && (
                <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 flex justify-between items-center">
                  <span className="font-semibold text-sm">Efectivo esperado en caja</span>
                  <span className="font-mono font-black text-xl text-primary">{fmt(expectedCash)}€</span>
                </div>
              )}
              {session.blindClose && (
                <div className="bg-secondary/40 rounded-xl p-4 flex items-center gap-3">
                  <EyeOff size={20} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-muted-foreground">Cierre ciego activado — el efectivo esperado está oculto</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-black text-muted-foreground uppercase tracking-widest mb-2">Efectivo contado (€)</label>
                <input
                  type="number" step="0.01" min="0" placeholder="0.00" autoFocus
                  value={countedCash} onChange={e => setCountedCash(e.target.value)}
                  className="w-full bg-background border-2 border-border rounded-xl px-4 py-4 text-3xl font-black font-mono text-right focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              {countedCash !== '' && (
                <div className={`rounded-xl p-4 border-2 ${Math.abs(difference) < 0.01 ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5'}`}>
                  <div className="flex justify-between items-center">
                    <span className="font-black">Diferencia</span>
                    <span className={`font-mono font-black text-2xl ${Math.abs(difference) < 0.01 ? 'text-green-400' : 'text-destructive'}`}>
                      {difference > 0 ? '+' : ''}{fmt(difference)}€
                    </span>
                  </div>
                  {needsReason && (
                    <p className="text-xs text-destructive mt-2 font-semibold">
                      ⚠ El descuadre supera 5€. Deberás explicarlo en el siguiente paso.
                    </p>
                  )}
                </div>
              )}

              {needsReason && countedCash !== '' && (
                <div>
                  <label className="block text-sm font-black text-muted-foreground uppercase tracking-widest mb-2">Explicación del descuadre *</label>
                  <textarea rows={3} value={discrepancyReason} onChange={e => setDiscrepancyReason(e.target.value)}
                    placeholder="Explica el motivo del descuadre..."
                    className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary resize-none transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">Notas de cierre (opcional)</label>
                <textarea rows={2} value={closingNotes} onChange={e => setClosingNotes(e.target.value)}
                  placeholder="Observaciones..."
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-center text-muted-foreground">Confirma el cierre de la caja</p>
              <div className="bg-secondary/30 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Fondo inicial</span><span className="font-mono font-bold">{fmt(session.openingFloat)}€</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total ventas</span><span className="font-mono font-bold text-green-400">{fmt(salesTotal)}€</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Efectivo esperado</span><span className="font-mono font-bold">{fmt(expectedCash)}€</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Efectivo contado</span><span className="font-mono font-bold">{fmt(countedCash)}€</span></div>
                <div className="flex justify-between border-t border-border pt-2 font-black">
                  <span>Diferencia</span>
                  <span className={`font-mono ${Math.abs(difference) < 0.01 ? 'text-green-400' : 'text-destructive'}`}>
                    {difference > 0 ? '+' : ''}{fmt(difference)}€
                  </span>
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)} disabled={submitting}
              className="px-4 py-3 bg-secondary text-foreground font-bold rounded-xl transition-all hover:bg-secondary/80">
              Atrás
            </button>
          )}
          {step < 3 && (
            <button onClick={() => setStep(s => s + 1)}
              disabled={step === 2 && (!countedCash || (needsReason && !discrepancyReason.trim()))}
              className="flex-1 py-3 bg-primary text-primary-foreground font-black rounded-xl transition-all hover:bg-primary/90 disabled:opacity-50">
              Continuar
            </button>
          )}
          {step === 3 && (
            <button onClick={handleConfirm} disabled={submitting}
              className="flex-1 py-3 bg-destructive text-destructive-foreground font-black rounded-xl flex items-center justify-center gap-2 transition-all">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar cierre'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab({ onViewReport }: { onViewReport: (id: string) => void }) {
  const { data: history = [], isLoading } = useGetCashSessionHistory({
    query: { queryKey: getGetCashSessionHistoryQueryKey() }
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  if (history.length === 0) return <div className="text-center text-muted-foreground p-8">Sin historial</div>;

  return (
    <div className="space-y-3 p-4 lg:p-6">
      {history.map(s => {
        const diff = parseFloat(s.difference ?? '0');
        const isOk = Math.abs(diff) < 0.01;
        return (
          <div key={s.id} className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold">{s.terminalName}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-black uppercase ${s.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                  {s.status === 'open' ? 'Abierta' : 'Cerrada'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{s.employeeName} · {fmtDate(s.openedAt)}</p>
              {s.closedAt && (
                <p className="text-xs text-muted-foreground">Cierre: {fmtDate(s.closedAt)}</p>
              )}
              {s.difference != null && (
                <p className={`text-xs font-mono font-bold mt-1 ${isOk ? 'text-green-400' : 'text-destructive'}`}>
                  Diferencia: {diff > 0 ? '+' : ''}{fmt(diff)}€
                </p>
              )}
            </div>
            <button onClick={() => onViewReport(s.id)}
              className="px-3 py-2 bg-secondary text-foreground font-bold rounded-xl text-sm shrink-0 hover:bg-primary hover:text-primary-foreground transition-colors">
              <ClipboardList size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function CashSession() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'session' | 'history'>('session');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeRole, setEmployeeRole] = useState('');
  const [storedTerminal, setStoredTerminal] = useState('');

  useEffect(() => {
    const empStr = localStorage.getItem('employee');
    if (empStr) {
      try {
        const emp = JSON.parse(empStr);
        setEmployeeName(emp.name ?? '');
        setEmployeeRole(emp.role ?? '');
      } catch (_) {}
    }
    setStoredTerminal(localStorage.getItem('cashTerminal') ?? '');
  }, []);

  const terminalParam = storedTerminal ? { terminal: storedTerminal } : undefined;
  const { data: session, isLoading: loadingSession } = useGetCurrentCashSession(terminalParam, {
    query: { queryKey: getGetCurrentCashSessionQueryKey(terminalParam) }
  });

  const { data: summary, isLoading: loadingSummary } = useGetCashSessionSummary(
    session?.id || '',
    { query: { enabled: !!session?.id, queryKey: getGetCashSessionSummaryQueryKey(session?.id || '') } }
  );

  const openSession  = useOpenCashSession();
  const addMovement  = useAddCashMovement();

  // Open form state
  const [openingFloat,  setOpeningFloat]  = useState('100');
  const [terminalName,  setTerminalName]  = useState('Caja principal');
  const [customTerminal, setCustomTerminal] = useState('');
  const [blindClose,    setBlindClose]    = useState(false);
  const [openingNotes,  setOpeningNotes]  = useState('');

  // Movement state
  const [movType,   setMovType]   = useState<'in' | 'out'>('in');
  const [movAmount, setMovAmount] = useState('');
  const [movReason, setMovReason] = useState('');

  // Wizard
  const [showCloseWizard, setShowCloseWizard] = useState(false);
  const [closedDiff,      setClosedDiff]      = useState<string | null>(null);
  const [closedSessionId, setClosedSessionId] = useState<string | null>(null);

  const isAdmin   = ['admin'].includes(employeeRole);
  const isManager = ['admin', 'manager'].includes(employeeRole);

  if (loadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Post-close screen ────────────────────────────────────────────────────
  if (closedDiff !== null && closedSessionId) {
    const diffNum = parseFloat(closedDiff);
    const isOk = Math.abs(diffNum) < 0.01;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 gap-6">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center ${isOk ? 'bg-green-500/20 text-green-500' : 'bg-destructive/20 text-destructive'}`}>
          {isOk ? <CheckCircle2 size={48} /> : <AlertCircle size={48} />}
        </div>
        <h2 className="text-3xl font-black">Caja Cerrada</h2>
        <div className="text-xl text-muted-foreground">
          Diferencia:{' '}
          <span className={`font-mono font-black ${isOk ? 'text-green-500' : 'text-destructive'}`}>
            {diffNum > 0 ? '+' : ''}{fmt(diffNum)}€
          </span>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setLocation(`/caja/informe/${closedSessionId}`)}
            className="px-6 py-3 bg-secondary text-foreground font-bold rounded-xl flex items-center gap-2 hover:bg-primary hover:text-primary-foreground transition-colors">
            <ClipboardList size={18} /> Ver Informe Z
          </button>
          <button onClick={() => setLocation('/tables')}
            className="px-8 py-4 bg-primary text-primary-foreground font-black text-xl rounded-xl shadow-lg hover:shadow-primary/30 active:scale-[0.98] transition-all">
            Volver a mesas
          </button>
        </div>
      </div>
    );
  }

  // ─── No session → Open form ───────────────────────────────────────────────
  if (!session) {
    const finalTerminal = terminalName === '__custom' ? customTerminal : terminalName;
    const canOpen = isAdmin || isManager;

    return (
      <div className="min-h-[100dvh] flex flex-col bg-background">
        <header className="h-16 flex items-center px-4 border-b border-border bg-card shrink-0 justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setLocation('/tables')}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors active:scale-95">
              <ChevronLeft size={24} />
            </button>
            <h1 className="text-xl font-bold">Gestión de Caja</h1>
          </div>
          <button onClick={() => setTab(tab === 'session' ? 'history' : 'session')}
            className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-xl text-sm font-bold hover:bg-secondary/80 transition-colors">
            {tab === 'session' ? <><History size={16} /> Historial</> : <><Wallet size={16} /> Apertura</>}
          </button>
        </header>

        {tab === 'history' ? (
          <HistoryTab onViewReport={id => setLocation(`/caja/informe/${id}`)} />
        ) : !canOpen ? (
          <div className="flex-1 flex items-center justify-center p-6 flex-col gap-4">
            <AlertCircle size={48} className="text-muted-foreground" />
            <p className="text-muted-foreground text-center font-semibold">
              No hay caja abierta.<br />Contacta con el administrador.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="bg-card border-2 border-border rounded-2xl p-6 lg:p-8 max-w-md w-full shadow-2xl">
              <div className="w-20 h-20 bg-primary/20 text-primary mx-auto rounded-full flex items-center justify-center mb-6">
                <Wallet size={40} />
              </div>
              <h2 className="text-3xl font-black mb-6 text-center">Apertura de Caja</h2>

              <div className="space-y-4 mb-6">
                {/* Terminal */}
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">Terminal</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {TERMINAL_PRESETS.map(t => (
                      <button key={t} onClick={() => setTerminalName(t)}
                        className={`px-3 py-1.5 rounded-xl border text-sm font-bold transition-colors ${terminalName === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                        {t}
                      </button>
                    ))}
                    <button onClick={() => setTerminalName('__custom')}
                      className={`px-3 py-1.5 rounded-xl border text-sm font-bold transition-colors ${terminalName === '__custom' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                      Otro
                    </button>
                  </div>
                  {terminalName === '__custom' && (
                    <input value={customTerminal} onChange={e => setCustomTerminal(e.target.value)} placeholder="Nombre del terminal"
                      className="w-full bg-background border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                  )}
                </div>

                {/* Float */}
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">Fondo inicial (€)</label>
                  <input type="number" step="0.01" min="0" value={openingFloat} onChange={e => setOpeningFloat(e.target.value)}
                    className="w-full bg-background border-2 border-border rounded-xl px-4 py-4 text-3xl font-black font-mono text-center focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">Notas (opcional)</label>
                  <textarea rows={2} value={openingNotes} onChange={e => setOpeningNotes(e.target.value)} placeholder="Observaciones..."
                    className="w-full bg-background border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                  />
                </div>

                {/* Blind close toggle */}
                {isAdmin && (
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <button onClick={() => setBlindClose(b => !b)}
                      className={`w-10 h-6 rounded-full transition-colors shrink-0 ${blindClose ? 'bg-primary' : 'bg-secondary'}`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${blindClose ? 'translate-x-4' : ''}`} />
                    </button>
                    <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      {blindClose ? <EyeOff size={16} /> : <Eye size={16} />}
                      {blindClose ? 'Cierre ciego (efectivo esperado oculto)' : 'Cierre normal (efectivo esperado visible)'}
                    </span>
                  </label>
                )}
              </div>

              <button
                disabled={openSession.isPending || parseFloat(openingFloat) < 0 || (terminalName === '__custom' && !customTerminal.trim())}
                onClick={() => {
                  openSession.mutate(
                    { data: { openingFloat, terminalName: finalTerminal, blindClose, notes: openingNotes || undefined } },
                    {
                      onSuccess: () => {
                        // Persist terminal identity so all subsequent queries are scoped correctly
                        localStorage.setItem('cashTerminal', finalTerminal);
                        setStoredTerminal(finalTerminal);
                        const tp = { terminal: finalTerminal };
                        queryClient.invalidateQueries({ queryKey: getGetCurrentCashSessionQueryKey(tp) });
                        queryClient.invalidateQueries({ queryKey: getGetCurrentCashSessionQueryKey() });
                        toast.success('Caja abierta correctamente');
                      },
                      onError: (e: any) => toast.error(e?.error ?? 'Error al abrir la caja'),
                    }
                  );
                }}
                className="w-full py-4 lg:py-5 bg-primary text-primary-foreground text-xl lg:text-2xl font-black uppercase tracking-wider rounded-xl disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] transition-all shadow-[0_8px_20px_rgba(0,0,0,0.3)] flex justify-center items-center gap-2"
              >
                {openSession.isPending ? <Loader2 className="animate-spin w-8 h-8" /> : 'Abrir Caja'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Open session ──────────────────────────────────────────────────────────
  const handleAddMovement = () => {
    const amountNum = parseFloat(movAmount);
    if (!amountNum || amountNum <= 0) { toast.error('Importe inválido'); return; }
    if (movReason.length < 3)         { toast.error('Indica un motivo válido'); return; }

    addMovement.mutate(
      { id: session.id, data: { movementType: movType, amount: movAmount, reason: movReason } },
      {
        onSuccess: () => {
          setMovAmount(''); setMovReason('');
          queryClient.invalidateQueries({ queryKey: getGetCashSessionSummaryQueryKey(session.id) });
          toast.success('Movimiento registrado');
        },
        onError: (e: any) => toast.error(e?.error ?? 'Error al registrar movimiento'),
      }
    );
  };

  const cashTotal = parseFloat(summary?.salesByMethod.find((m: any) => m.methodCode === 'cash')?.total ?? '0');
  const movIn  = summary?.movements.filter((m: any) => m.movementType === 'in').reduce((a: number, m: any) => a + parseFloat(m.amount), 0) ?? 0;
  const movOut = summary?.movements.filter((m: any) => m.movementType === 'out').reduce((a: number, m: any) => a + parseFloat(m.amount), 0) ?? 0;
  const expectedCash = parseFloat(session.openingFloat) + cashTotal + movIn - movOut;

  const salesTotal = summary?.salesByMethod?.reduce((a: number, m: any) => a + parseFloat(m.total ?? '0'), 0) ?? 0;

  const METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo', card: 'Tarjeta', bizum: 'Bizum',
    transfer: 'Transferencia', cheque_rest: 'Cheque restaurante',
    invitation: 'Invitación', other: 'Otro',
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background overflow-hidden relative">
      {showCloseWizard && (
        <CloseWizard
          session={session}
          summary={summary}
          onClose={() => setShowCloseWizard(false)}
          onClosed={(diff, sid) => {
            setShowCloseWizard(false);
            setClosedDiff(diff);
            setClosedSessionId(sid);
          }}
        />
      )}

      {/* HEADER */}
      <header className="h-16 flex items-center px-4 lg:px-6 border-b border-border bg-card shrink-0 justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => setLocation('/tables')}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors active:scale-95 border border-transparent hover:border-border">
            <ChevronLeft size={24} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold leading-none">Caja</h1>
              <span className="bg-green-500/20 text-green-500 border border-green-500/30 px-2 py-0.5 rounded text-xs font-black uppercase">Abierta</span>
            </div>
            <span className="text-xs text-muted-foreground font-semibold mt-1">
              {session.terminalName} · {(session as any).employeeName || employeeName} · Fondo: {fmt(session.openingFloat)}€
              {session.blindClose && <span className="ml-2 opacity-60">🙈 Cierre ciego</span>}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setLocation(`/caja/informe/${session.id}`)}
            title="Ver informe Z"
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
            <ClipboardList size={20} />
          </button>
          <button onClick={() => setTab(tab === 'session' ? 'history' : 'session')}
            className={`w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary ${tab === 'history' ? 'bg-secondary text-foreground' : ''}`}>
            <History size={20} />
          </button>
        </div>
      </header>

      {tab === 'history' ? (
        <HistoryTab onViewReport={id => setLocation(`/caja/informe/${id}`)} />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto w-full">

          {/* LEFT: Movements */}
          <div className="flex-1 flex flex-col gap-6">
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <h2 className="text-lg font-black uppercase tracking-wider mb-5 flex items-center gap-2">
                <Euro className="text-primary" /> Registrar Movimiento
              </h2>

              <div className="flex gap-2 mb-4 p-1 bg-secondary rounded-xl">
                <button onClick={() => setMovType('in')}
                  className={`flex-1 py-3 rounded-lg font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${movType === 'in' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                  <ArrowUpRight size={18} className={movType === 'in' ? 'text-green-500' : ''} /> Entrada
                </button>
                <button onClick={() => setMovType('out')}
                  className={`flex-1 py-3 rounded-lg font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${movType === 'out' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                  <ArrowDownRight size={18} className={movType === 'out' ? 'text-destructive' : ''} /> Salida
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">Importe (€)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00"
                    value={movAmount} onChange={e => setMovAmount(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-4 text-xl font-mono focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">Motivo</label>
                  <textarea rows={2} placeholder="Ej. Cambio, Pago a proveedor..."
                    value={movReason} onChange={e => setMovReason(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-base focus:outline-none focus:border-primary transition-colors resize-none"
                  />
                </div>
                <button onClick={handleAddMovement}
                  disabled={addMovement.isPending || !movAmount || movReason.length < 3}
                  className="w-full py-4 bg-secondary text-secondary-foreground text-lg font-black uppercase tracking-wider rounded-xl disabled:opacity-50 hover:bg-primary hover:text-primary-foreground active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                  {addMovement.isPending ? <Loader2 className="animate-spin w-5 h-5" /> : 'Registrar'}
                </button>
              </div>
            </div>

            {/* Movement history */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex-1 flex flex-col min-h-[200px]">
              <h2 className="text-lg font-black uppercase tracking-wider mb-4 text-muted-foreground">Historial de movimientos</h2>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {loadingSummary ? (
                  <div className="flex justify-center p-4"><Loader2 className="animate-spin text-muted-foreground" /></div>
                ) : summary?.movements && summary.movements.length > 0 ? (
                  summary.movements.map((m: any, i: number) => (
                    <div key={i} className="bg-background border border-border rounded-xl p-3 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.movementType === 'in' ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}`}>
                          {m.movementType === 'in' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                        </div>
                        <span className="font-semibold text-sm line-clamp-1">{m.reason}</span>
                      </div>
                      <span className={`font-mono font-bold ${m.movementType === 'in' ? 'text-green-500' : 'text-destructive'}`}>
                        {m.movementType === 'in' ? '+' : '-'}{fmt(m.amount)}€
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground opacity-60 text-sm font-semibold uppercase">Sin movimientos</div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Summary & Close */}
          <div className="flex-1 flex flex-col gap-6 lg:max-w-md">
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <h2 className="text-lg font-black uppercase tracking-wider mb-4">Resumen de Ventas</h2>
              {loadingSummary ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
              ) : (
                <div className="space-y-2">
                  {(summary?.salesByMethod ?? []).map((m: any) => (
                    <div key={m.methodCode} className="flex justify-between items-center bg-background border border-border p-3 rounded-xl">
                      <span className="font-bold text-muted-foreground">{METHOD_LABELS[m.methodCode] ?? m.methodName}</span>
                      <span className="font-mono text-lg font-black">{fmt(m.total ?? '0')}€</span>
                    </div>
                  ))}
                  {(summary?.salesByMethod ?? []).length === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-2">Sin ventas</p>
                  )}
                  <div className="flex justify-between items-center bg-green-500/10 border border-green-500/30 p-3 rounded-xl mt-2">
                    <span className="font-black text-green-400">TOTAL</span>
                    <span className="font-mono text-xl font-black text-green-400">{fmt(salesTotal)}€</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card border border-border border-t-4 border-t-primary rounded-2xl p-5 shadow-sm flex flex-col">
              <h2 className="text-xl font-black uppercase tracking-wider mb-4">Cierre de Caja</h2>

              <div className="bg-secondary/30 rounded-xl p-3 mb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Efectivo esperado</span>
                  <span className="font-mono font-black">{fmt(expectedCash)}€</span>
                </div>
              </div>

              {isManager && (
                <button onClick={() => setShowCloseWizard(true)}
                  className="w-full py-5 bg-destructive text-destructive-foreground text-xl font-black uppercase tracking-wider rounded-xl hover:bg-destructive/90 active:scale-[0.98] transition-all shadow-[0_4px_14px_rgba(0,0,0,0.2)] flex justify-center items-center gap-2">
                  <Settings size={22} /> Cerrar Caja
                </button>
              )}
              {!isManager && (
                <p className="text-center text-muted-foreground text-sm">Solo los gerentes y administradores pueden cerrar la caja</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
