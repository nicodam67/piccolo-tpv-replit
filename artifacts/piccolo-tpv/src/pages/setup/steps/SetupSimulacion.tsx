import React, { useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch, BASE } from '../setupUtils';

const SIM_STEPS = [
  { id: 'abrir_caja',    icon: '🔑', label: 'Abrir caja',         desc: 'Inicia la sesión de caja con el importe de apertura', href: '/caja' },
  { id: 'mesa',          icon: '🗺️', label: 'Seleccionar mesa',   desc: 'Elige una mesa en el plano de sala', href: '/tables' },
  { id: 'comanda',       icon: '📝', label: 'Crear comanda',       desc: 'Añade productos al pedido de la mesa', href: '/tables' },
  { id: 'kds',           icon: '📺', label: 'Ver en KDS',         desc: 'Comprueba que la comanda llega a cocina', href: '/kds/cocina' },
  { id: 'cobrar',        icon: '💳', label: 'Cobrar pedido',       desc: 'Procesa el pago del pedido', href: '/tables' },
  { id: 'cerrar_caja',   icon: '📊', label: 'Cerrar caja / Informe Z', desc: 'Cierra la caja y revisa el informe Z', href: '/caja' },
];

export default function SetupSimulacion({ sessionId, onNext, onBack, onSkip }: StepProps) {
  const [simStarted, setSimStarted] = useState(false);
  const [simCleared, setSimCleared] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [starting, setStarting] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function startSim() {
    setStarting(true);
    try {
      await setupFetch('/api/setup/simulation/start', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      });
      setSimStarted(true);
      toast.success('Simulación iniciada. Sigue los pasos en el orden indicado.');
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function clearSim() {
    if (!window.confirm('¿Eliminar todos los datos de simulación? Esta acción no se puede deshacer.')) return;
    setClearing(true);
    try {
      await setupFetch('/api/setup/simulation/cleanup', {
        method: 'DELETE',
        body: JSON.stringify({ sessionId }),
      });
      setSimCleared(true);
      toast.success('Datos de simulación eliminados');
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setClearing(false);
    }
  }

  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">🎮 Simulación de servicio</h2>
      <p className="text-zinc-500 mb-6">Prueba el flujo completo de un servicio antes de activar el modo producción.</p>

      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 mb-6 text-sm text-amber-200/80">
        <strong>Ayuda:</strong> La simulación te permite probar todos los módulos con datos de ejemplo sin afectar a la numeración fiscal ni a los datos reales. Puedes limpiar los datos de prueba al finalizar.
      </div>

      {!simStarted ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center mb-6">
          <p className="text-3xl mb-3">🎮</p>
          <h3 className="font-semibold text-zinc-200 mb-2">Prueba el sistema antes de usarlo en producción</h3>
          <p className="text-sm text-zinc-500 mb-4">Abre los módulos en pestañas separadas y sigue el flujo completo de un servicio.</p>
          <button onClick={startSim} disabled={starting}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors disabled:opacity-60">
            {starting ? 'Iniciando…' : '▶ Iniciar simulación'}
          </button>
        </div>
      ) : (
        <>
          {/* Progress */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-zinc-300">Pasos de la simulación</h3>
            <span className="text-sm text-zinc-500">{doneCount} / {SIM_STEPS.length} completados</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-zinc-800 rounded-full mb-5 overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${(doneCount / SIM_STEPS.length) * 100}%` }} />
          </div>

          {/* Steps */}
          <div className="space-y-2 mb-6">
            {SIM_STEPS.map((step, idx) => {
              const isDone = done[step.id];
              const isAvailable = idx === 0 || done[SIM_STEPS[idx - 1].id];
              return (
                <div key={step.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    isDone ? 'bg-emerald-500/5 border-emerald-500/20' :
                    isAvailable ? 'bg-zinc-900 border-zinc-700' :
                    'bg-zinc-900/50 border-zinc-800 opacity-60'
                  }`}>
                  <button
                    onClick={() => setDone((d) => ({ ...d, [step.id]: !d[step.id] }))}
                    className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                      isDone ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600 bg-zinc-800'
                    }`}
                  >
                    {isDone && <span className="text-white text-xs font-bold">✓</span>}
                  </button>
                  <span className="text-xl">{step.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-sm ${isDone ? 'text-emerald-400' : 'text-zinc-200'}`}>{idx + 1}. {step.label}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{step.desc}</p>
                  </div>
                  <a href={`${BASE}${step.href}`} target="_blank" rel="noreferrer"
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      isAvailable
                        ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30'
                        : 'bg-zinc-800 text-zinc-600 cursor-not-allowed pointer-events-none'
                    }`}>
                    Abrir →
                  </a>
                </div>
              );
            })}
          </div>

          {doneCount === SIM_STEPS.length && (
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4 mb-4 flex items-center gap-3">
              <span className="text-emerald-400 text-2xl">🎉</span>
              <p className="text-emerald-300 font-semibold">¡Simulación completada! El sistema funciona correctamente.</p>
            </div>
          )}

          {/* Cleanup */}
          {!simCleared ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-3">
              <span className="text-zinc-500 text-lg">🗑️</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-300">Limpiar datos de simulación</p>
                <p className="text-xs text-zinc-500 mt-0.5">Elimina los datos de prueba generados durante la simulación antes de activar producción.</p>
              </div>
              <button onClick={clearSim} disabled={clearing}
                className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-lg text-xs transition-colors whitespace-nowrap disabled:opacity-60">
                {clearing ? 'Limpiando…' : 'Limpiar datos'}
              </button>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
              <span className="text-emerald-400">✓</span>
              <p className="text-sm text-emerald-300">Datos de simulación eliminados.</p>
            </div>
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
