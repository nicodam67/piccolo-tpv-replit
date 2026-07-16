import React, { useEffect, useState } from 'react';
import { setupFetch } from '../setupUtils';

interface StatusEntry { ok: boolean; message?: string; [k: string]: unknown; }
interface DiagnosticsResult { ok: boolean; checkedAt: string; status: Record<string, StatusEntry>; }
interface SetupStatusResult { overall: string; checklist: { id: string; label: string; status: string; required: boolean }[]; readyForProduction: boolean; }

const STATUS_LABELS: Record<string, string> = {
  database: 'Base de datos',
  storage: 'Almacenamiento en disco',
  printers: 'Impresoras',
  print_queue: 'Cola de impresión',
  backups: 'Copias de seguridad',
  offline_queue: 'Cola sin conexión',
  alerts: 'Alertas críticas',
};

function StatusCard({ id, entry }: { id: string; entry: StatusEntry }) {
  return (
    <div className={`bg-zinc-900 border rounded-xl p-4 ${entry.ok ? 'border-emerald-500/20' : 'border-red-500/30'}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-zinc-300">{STATUS_LABELS[id] ?? id}</span>
        <span className={`text-lg shrink-0 ${entry.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {entry.ok ? '✓' : '✗'}
        </span>
      </div>
      {entry.message && (
        <p className={`text-xs mt-1 ${entry.ok ? 'text-zinc-500' : 'text-red-400'}`}>{entry.message}</p>
      )}
    </div>
  );
}

export default function SetupDiagnostico({ onNext, onBack, onSkip }: { onNext(): void; onBack(): void; onSkip(): void }) {
  const [diag, setDiag] = useState<DiagnosticsResult | null>(null);
  const [setup, setSetup] = useState<SetupStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function runDiag() {
    setLoading(true);
    setError(null);
    try {
      const [d, s] = await Promise.all([
        setupFetch<DiagnosticsResult>('/api/diagnostics/status'),
        setupFetch<SetupStatusResult>('/api/setup/status'),
      ]);
      setDiag(d);
      setSetup(s);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runDiag(); }, []);

  const diagEntries = diag ? Object.entries(diag.status) : [];
  const okCount = diagEntries.filter(([, e]) => e.ok).length;

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">🔍 Diagnóstico del sistema</h2>
      <p className="text-zinc-500 mb-6">Verifica que todos los sistemas del TPV funcionan correctamente antes de la puesta en marcha.</p>

      {loading ? (
        <div className="flex items-center gap-3 text-zinc-500 py-8">
          <div className="animate-spin w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full" />
          Ejecutando diagnóstico…
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm mb-4">{error}</div>
      ) : (
        <>
          {/* Summary */}
          <div className={`rounded-xl p-4 mb-6 flex items-center gap-4 ${diag?.ok ? 'bg-emerald-500/10 border border-emerald-500/25' : 'bg-amber-500/10 border border-amber-500/25'}`}>
            <span className={`text-3xl ${diag?.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
              {diag?.ok ? '✓' : '⚠️'}
            </span>
            <div>
              <p className={`font-semibold ${diag?.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
                {diag?.ok ? 'Sistema operativo' : 'Hay elementos que revisar'}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {okCount} de {diagEntries.length} verificaciones correctas · Actualizado {diag ? new Date(diag.checkedAt).toLocaleTimeString('es-ES') : '—'}
              </p>
            </div>
            <button onClick={runDiag} className="ml-auto px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition-colors">
              ↻ Refrescar
            </button>
          </div>

          {/* System checks */}
          <h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Verificaciones técnicas</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {diagEntries.map(([id, entry]) => (
              <StatusCard key={id} id={id} entry={entry} />
            ))}
          </div>

          {/* Setup checklist */}
          {setup && (
            <>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Lista de configuración</h3>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                {setup.checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
                      item.status === 'configured' ? 'bg-emerald-500/20 text-emerald-400' :
                      item.status === 'partial' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-zinc-700 text-zinc-500'
                    }`}>
                      {item.status === 'configured' ? '✓' : item.status === 'partial' ? '~' : '○'}
                    </span>
                    <span className={`text-sm flex-1 ${item.status === 'configured' ? 'text-zinc-300' : 'text-zinc-500'}`}>
                      {item.label}
                    </span>
                    {item.required && item.status !== 'configured' && (
                      <span className="text-xs text-amber-500/70">requerido</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
        <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm">← Anterior</button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm">Omitir</button>
          <button onClick={onNext} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm">
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}
