import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch, BASE } from '../setupUtils';

export default function SetupKDS({ sessionId, onNext, onBack, onSave, onSkip }: StepProps) {
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [departments, setDepartments] = useState<Array<{ code: string; name: string; showInKdsNav: boolean }>>([]);

  useEffect(() => {
    setupFetch<Array<{ code: string; name: string; showInKdsNav: boolean }>>('/api/production-departments')
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await setupFetch(`/api/setup/session/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: { kds: { confirmed: true } } }),
      });
      onSave({ kds: { confirmed: true } });
      toast.success('KDS configurado');
      onNext();
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">📺 Pantalla KDS (Kitchen Display System)</h2>
      <p className="text-zinc-500 mb-6">El KDS muestra las comandas en tiempo real en la cocina, eliminando los tickets impresos.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-3xl mb-2">📺</div>
          <h3 className="font-semibold text-zinc-200 mb-1">¿Cómo funciona el KDS?</h3>
          <ul className="text-sm text-zinc-500 space-y-1.5 mt-2">
            <li>• Los camareros añaden productos al pedido desde el TPV</li>
            <li>• Las comandas aparecen instantáneamente en la pantalla KDS</li>
            <li>• Los cocineros marcan los platos como listos</li>
            <li>• El camarero recibe la notificación para servir</li>
          </ul>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-3xl mb-2">⚙️</div>
          <h3 className="font-semibold text-zinc-200 mb-1">Partidas y zonas</h3>
          <p className="text-sm text-zinc-500 mt-2">
            El KDS filtra productos según su <strong className="text-zinc-400">partida</strong> (cocina, barra, plancha…). 
            Asigna la partida a cada producto en el gestor de productos para que aparezca en la pantalla correcta.
          </p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <h3 className="font-semibold text-zinc-300 mb-3">Pantallas KDS disponibles</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {departments.filter(department => department.showInKdsNav).map((department) => (
            <a key={department.code} href={`${BASE}/kds/${department.code}`} target="_blank" rel="noreferrer"
              className="flex items-center justify-between bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-4 py-3 group transition-colors">
              <span className="text-zinc-300 capitalize font-medium">KDS {department.name}</span>
              <span className="text-xs text-amber-400 group-hover:underline">Abrir →</span>
            </a>
          ))}
        </div>
        <p className="text-xs text-zinc-600 mt-3">Abre cada pantalla KDS en un dispositivo o navegador diferente de la cocina.</p>
      </div>

      <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
        <button
          onClick={() => setConfirmed((c) => !c)}
          className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${confirmed ? 'bg-amber-500 border-amber-500' : 'border-zinc-600'}`}
        >
          {confirmed && <span className="text-zinc-900 text-xs font-bold">✓</span>}
        </button>
        <span className="text-sm text-zinc-400">He revisado el KDS y entiendo cómo funciona</span>
      </div>

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
        <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm">← Anterior</button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm">Omitir</button>
          <button onClick={confirmed ? handleSave : onNext} disabled={saving}
            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm disabled:opacity-60">
            {saving ? 'Guardando…' : 'Continuar →'}
          </button>
        </div>
      </div>
    </div>
  );
}
