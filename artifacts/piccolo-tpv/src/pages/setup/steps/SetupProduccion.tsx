import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch } from '../setupUtils';

interface ChecklistItem { id: string; category: string; label: string; status: string; required: boolean; }
interface ChecklistResult { items: ChecklistItem[]; summary: { total: number; done: number; pct: number; readyForProduction: boolean }; }

function statusIcon(s: string) {
  if (s === 'configured') return <span className="text-emerald-400">✓</span>;
  if (s === 'partial') return <span className="text-amber-400">~</span>;
  return <span className="text-zinc-600">○</span>;
}

export default function SetupProduccion({ sessionId, onNext, onBack }: StepProps) {
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => { loadChecklist(); }, []);

  async function loadChecklist() {
    setLoading(true);
    try {
      const r = await setupFetch<ChecklistResult>('/api/setup/checklist');
      setChecklist(r);
      // Check if already activated
      const status = await setupFetch<{ setupCompleted: boolean }>('/api/setup/status');
      if (status.setupCompleted) setActivated(true);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function goLive() {
    if (confirmText.trim().toLowerCase() !== 'producción') {
      toast.error('Escribe "producción" para confirmar');
      return;
    }
    setActivating(true);
    try {
      await setupFetch('/api/setup/go-live', {
        method: 'POST',
        body: JSON.stringify({ confirm: true, sessionId }),
      });
      setActivated(true);
      toast.success('🎉 ¡Sistema activado en producción!');
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setActivating(false);
    }
  }

  async function exportCsv() {
    try {
      const token = localStorage.getItem('token') ?? '';
      const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');
      const res = await fetch(`${BASE_URL}/api/setup/checklist?format=csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `piccolo_setup_checklist_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo exportar el checklist');
    }
  }

  const missingRequired = checklist?.items.filter((i) => i.required && i.status !== 'configured') ?? [];
  const ready = checklist?.summary.readyForProduction ?? false;

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">🚀 Puesta en producción</h2>
      <p className="text-zinc-500 mb-6">Revisa la lista de control y activa el modo producción cuando todo esté listo.</p>

      {activated ? (
        /* Celebration screen */
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎉</div>
          <h3 className="text-3xl font-bold text-zinc-100 mb-2">¡Piccolo TPV está en producción!</h3>
          <p className="text-zinc-400 mb-6">El sistema está activo y listo para el servicio. ¡Mucho éxito!</p>
          <div className="flex justify-center gap-3">
            <a href="/tables" className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors">
              Ir al TPV →
            </a>
            <a href="/admin" className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
              Panel de admin
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* Checklist */}
          {loading ? (
            <div className="text-zinc-500 text-sm py-4">Cargando lista de control…</div>
          ) : checklist ? (
            <>
              {/* Progress */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-300">Progreso de configuración</span>
                  <span className="text-sm font-bold text-amber-400">{checklist.summary.pct}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${checklist.summary.pct}%` }} />
                </div>
                <p className="text-xs text-zinc-500">{checklist.summary.done} de {checklist.summary.total} elementos completados</p>
              </div>

              {/* Items by category */}
              {Object.entries(
                checklist.items.reduce((acc, item) => {
                  if (!acc[item.category]) acc[item.category] = [];
                  acc[item.category].push(item);
                  return acc;
                }, {} as Record<string, ChecklistItem[]>)
              ).map(([cat, items]) => (
                <div key={cat} className="mb-4">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">{cat}</h3>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-5 shrink-0 text-center">{statusIcon(item.status)}</span>
                        <span className={`text-sm flex-1 ${item.status === 'configured' ? 'text-zinc-300' : 'text-zinc-500'}`}>
                          {item.label}
                        </span>
                        {item.required && item.status !== 'configured' && (
                          <span className="text-xs text-red-400/80 font-medium">Requerido</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex justify-end mb-4">
                <button onClick={exportCsv} className="text-xs text-zinc-500 hover:text-zinc-300 underline transition-colors">
                  ↓ Exportar lista como CSV
                </button>
              </div>

              {/* Missing required items */}
              {missingRequired.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
                  <p className="font-semibold text-red-300 text-sm mb-2">Elementos obligatorios pendientes:</p>
                  <ul className="space-y-1">
                    {missingRequired.map((item) => (
                      <li key={item.id} className="text-xs text-red-400 flex items-center gap-2">
                        <span>✗</span> {item.label}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-zinc-500 mt-3">Completa los pasos anteriores para habilitar la activación en producción.</p>
                </div>
              )}

              {/* Go live form */}
              {ready && (
                <div className="bg-zinc-900 border border-amber-500/25 rounded-xl p-5 mb-4">
                  <h3 className="font-semibold text-amber-300 mb-1">✓ Todo listo para producción</h3>
                  <p className="text-sm text-zinc-400 mb-4">
                    Una vez actives producción, el sistema emitirá tickets con numeración fiscal real. Esta acción no se puede deshacer.
                  </p>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-zinc-400 mb-1">
                      Escribe <strong className="text-zinc-200">producción</strong> para confirmar
                    </label>
                    <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="producción"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500" />
                  </div>
                  <button onClick={goLive} disabled={activating || confirmText.trim().toLowerCase() !== 'producción'}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {activating ? 'Activando…' : '🚀 Activar modo producción'}
                  </button>
                </div>
              )}
            </>
          ) : null}
        </>
      )}

      {!activated && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
          <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm">← Anterior</button>
          {activated && (
            <button onClick={onNext} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm">
              Finalizar →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
