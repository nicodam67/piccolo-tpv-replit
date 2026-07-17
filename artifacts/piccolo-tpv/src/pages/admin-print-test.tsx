/**
 * admin-print-test.tsx
 * Guided 10-step print test wizard — /admin/prueba-impresion
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  ArrowLeft, Printer, CheckCircle, XCircle, Loader2, RefreshCw,
  ChevronRight, ChevronLeft, Save, RotateCcw, Zap,
} from 'lucide-react';

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('token') ?? '';
  return fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

interface PrinterOption {
  id: string;
  name: string;
  type: string;
  active: boolean;
}

const TEST_STEPS = [
  { key: 'zone_cocina',   label: 'Cocina', desc: 'Imprime una comanda de prueba en la impresora de cocina.',    printerType: 'cocina' },
  { key: 'zone_pizza',    label: 'Pizza',  desc: 'Imprime una comanda de prueba en la impresora de pizza.',     printerType: 'pizza' },
  { key: 'zone_ensalada', label: 'Ensaladas', desc: 'Imprime en la impresora de ensaladas / cuarto frío.',      printerType: 'ensalada' },
  { key: 'zone_barra',    label: 'Barra',  desc: 'Imprime en la impresora de barra / bebidas.',                 printerType: 'barra' },
  { key: 'zone_caja',     label: 'Caja / Tickets', desc: 'Imprime un ticket de prueba en la caja principal.',   printerType: 'caja' },
  { key: 'special_chars', label: 'Caracteres especiales', desc: 'Verifica tildes, ñ, €, y comillas especiales en todos los idiomas.', printerType: null },
  { key: 'paper_cut',     label: 'Corte de papel', desc: 'Prueba el corte automático al final de cada ticket.',   printerType: null },
  { key: 'cash_drawer',   label: 'Apertura de cajón', desc: 'Abre el cajón de efectivo mediante el comando ESC/POS.', printerType: 'caja' },
  { key: 'fallback',      label: 'Impresora de respaldo', desc: 'Prueba que el trabajo se redirige a la impresora de respaldo cuando la principal falla.', printerType: null },
  { key: 'summary',       label: 'Resumen final', desc: 'Revisa los resultados de todos los pasos anteriores.', printerType: null },
];

type StepResult = 'pending' | 'pass' | 'fail' | 'skip';

function generateSessionId() {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function AdminPrintTest() {
  const [, setLocation] = useLocation();
  const [printers, setPrinters] = useState<PrinterOption[]>([]);
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<Record<string, StepResult>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [printing, setPrinting] = useState(false);
  const [sessionId] = useState(generateSessionId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/admin/printers').then(r => r.ok ? r.json() : []).then(ps => setPrinters(ps));
  }, []);

  const currentStep = TEST_STEPS[step];
  const assignedPrinter = currentStep.printerType
    ? printers.find(p => p.type === currentStep.printerType && p.active)
    : null;

  async function sendTestPrint() {
    if (!assignedPrinter) { toast.error('No hay impresora de este tipo configurada'); return; }
    setPrinting(true);
    try {
      const r = await apiFetch(`/admin/printers/${assignedPrinter.id}/test`, { method: 'POST' });
      if (r.ok) toast.success(`Trabajo enviado a ${assignedPrinter.name}`);
      else toast.error('Error al enviar prueba');
    } finally { setPrinting(false); }
  }

  function mark(result: StepResult) {
    setResults(prev => ({ ...prev, [currentStep.key]: result }));
    if (step < TEST_STEPS.length - 1) {
      setTimeout(() => setStep(s => s + 1), 300);
    }
  }

  async function saveResults() {
    setSaving(true);
    try {
      const rows = TEST_STEPS.map(s => ({
        stepKey: s.key,
        stepLabel: s.label,
        result: results[s.key] ?? 'pending',
        notes: notes[s.key] ?? null,
        sessionId,
        printerId: assignedPrinter?.id ?? (printers[0]?.id ?? null),
      })).filter(r => r.printerId);

      await apiFetch('/admin/print-test-results', {
        method: 'POST',
        body: JSON.stringify(rows),
      });
      setSaved(true);
      toast.success('Resultados guardados');
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  }

  function reset() {
    setStep(0);
    setResults({});
    setNotes({});
    setSaved(false);
  }

  const isSummary = currentStep.key === 'summary';
  const passCount = Object.values(results).filter(r => r === 'pass').length;
  const failCount = Object.values(results).filter(r => r === 'fail').length;
  const skipCount = Object.values(results).filter(r => r === 'skip').length;

  const RESULT_ICON: Record<StepResult, React.ReactNode> = {
    pending: <span className="w-5 h-5 rounded-full border-2 border-border" />,
    pass:    <CheckCircle size={18} className="text-green-400" />,
    fail:    <XCircle size={18} className="text-red-400" />,
    skip:    <span className="w-5 h-5 rounded-full bg-muted-foreground/20" />,
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 bg-card border-b border-border">
        <button onClick={() => setLocation('/admin/impresoras')}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground">
          <ArrowLeft size={16} />
        </button>
        <Printer size={18} className="text-primary" />
        <h1 className="font-black text-base">Prueba de impresión guiada</h1>
        <div className="flex-1" />
        <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-border hover:bg-secondary text-muted-foreground transition-colors">
          <RotateCcw size={11} /> Reiniciar
        </button>
      </header>

      {/* Progress bar */}
      <div className="h-1.5 bg-secondary">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${((step + 1) / TEST_STEPS.length) * 100}%` }} />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Step list */}
        <aside className="w-56 shrink-0 border-r border-border bg-card overflow-y-auto">
          <div className="p-2 space-y-0.5">
            {TEST_STEPS.map((s, i) => {
              const res = results[s.key] as StepResult | undefined;
              return (
                <button key={s.key} onClick={() => setStep(i)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    step === i ? 'bg-primary/10 border border-primary/20' : 'hover:bg-secondary/60'
                  }`}>
                  <span className="shrink-0">{res ? RESULT_ICON[res] : (
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-black ${
                      step === i ? 'border-primary text-primary' : 'border-border text-muted-foreground'
                    }`}>{i + 1}</span>
                  )}</span>
                  <span className={`text-xs font-semibold truncate ${step === i ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main area */}
        <main className="flex-1 overflow-y-auto p-6">
          {isSummary ? (
            <div className="max-w-lg mx-auto space-y-6">
              <h2 className="text-2xl font-black">Resumen de pruebas</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-950/30 border border-green-800 rounded-xl p-4 text-center">
                  <div className="text-3xl font-black text-green-400">{passCount}</div>
                  <div className="text-xs text-green-300/70 mt-1 font-semibold">Superados</div>
                </div>
                <div className="bg-red-950/30 border border-red-800 rounded-xl p-4 text-center">
                  <div className="text-3xl font-black text-red-400">{failCount}</div>
                  <div className="text-xs text-red-300/70 mt-1 font-semibold">Fallidos</div>
                </div>
                <div className="bg-secondary border border-border rounded-xl p-4 text-center">
                  <div className="text-3xl font-black text-muted-foreground">{skipCount}</div>
                  <div className="text-xs text-muted-foreground/70 mt-1 font-semibold">Omitidos</div>
                </div>
              </div>

              {TEST_STEPS.slice(0, -1).map(s => {
                const res = (results[s.key] ?? 'pending') as StepResult;
                return (
                  <div key={s.key} className={`flex items-center gap-3 p-3 rounded-xl border ${
                    res === 'pass' ? 'bg-green-950/20 border-green-800/50' :
                    res === 'fail' ? 'bg-red-950/20 border-red-800/50' :
                    'bg-secondary/30 border-border/60'
                  }`}>
                    {RESULT_ICON[res]}
                    <div className="flex-1">
                      <span className="text-sm font-bold">{s.label}</span>
                      {notes[s.key] && <p className="text-xs text-muted-foreground mt-0.5">{notes[s.key]}</p>}
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-3">
                {!saved ? (
                  <button onClick={saveResults} disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-black text-sm disabled:opacity-60 transition-colors">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {saving ? 'Guardando…' : 'Guardar resultados'}
                  </button>
                ) : (
                  <div className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-700/30 text-green-400 border border-green-700 rounded-xl font-black text-sm">
                    <CheckCircle size={14} /> Resultados guardados
                  </div>
                )}
                <button onClick={reset}
                  className="px-6 py-3 border border-border rounded-xl font-bold text-sm hover:bg-secondary transition-colors">
                  Nueva prueba
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-lg mx-auto space-y-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
                Paso {step + 1} de {TEST_STEPS.length - 1}
              </div>
              <h2 className="text-2xl font-black">{currentStep.label}</h2>
              <p className="text-muted-foreground text-sm">{currentStep.desc}</p>

              {/* Assigned printer */}
              {currentStep.printerType && (
                <div className={`p-4 rounded-xl border ${
                  assignedPrinter ? 'bg-card border-border' : 'bg-orange-950/30 border-orange-800'
                }`}>
                  {assignedPrinter ? (
                    <div className="flex items-center gap-3">
                      <Printer size={16} className="text-primary" />
                      <div>
                        <p className="font-bold text-sm">{assignedPrinter.name}</p>
                        <p className="text-xs text-muted-foreground">{assignedPrinter.type}</p>
                      </div>
                      <button onClick={sendTestPrint} disabled={printing}
                        className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-60 transition-colors">
                        {printing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                        {printing ? 'Enviando…' : 'Enviar prueba'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-orange-400 font-semibold">
                      No hay impresora de tipo "{currentStep.printerType}" configurada. Puedes omitir este paso.
                    </p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-muted-foreground block mb-1">Notas (opcional)</label>
                <textarea
                  value={notes[currentStep.key] ?? ''}
                  onChange={e => setNotes(prev => ({ ...prev, [currentStep.key]: e.target.value }))}
                  rows={2} placeholder="Observaciones sobre esta prueba…"
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none resize-none"
                />
              </div>

              {/* Result buttons */}
              <div className="grid grid-cols-3 gap-3">
                <button onClick={() => mark('pass')}
                  className="flex flex-col items-center gap-2 py-5 bg-green-950/40 hover:bg-green-900/60 text-green-400 border border-green-800 rounded-xl font-black transition-all active:scale-95">
                  <CheckCircle size={22} /> Supera
                </button>
                <button onClick={() => mark('fail')}
                  className="flex flex-col items-center gap-2 py-5 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800 rounded-xl font-black transition-all active:scale-95">
                  <XCircle size={22} /> Falla
                </button>
                <button onClick={() => mark('skip')}
                  className="flex flex-col items-center gap-2 py-5 bg-secondary hover:bg-secondary/80 text-muted-foreground border border-border rounded-xl font-bold text-sm transition-all active:scale-95">
                  <span className="text-xl">—</span> Omitir
                </button>
              </div>

              {/* Navigation */}
              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
                  className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-xl text-sm font-bold hover:bg-secondary disabled:opacity-30 transition-colors">
                  <ChevronLeft size={14} /> Anterior
                </button>
                <button onClick={() => setStep(s => Math.min(TEST_STEPS.length - 1, s + 1))}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold transition-colors hover:opacity-90">
                  Siguiente <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
