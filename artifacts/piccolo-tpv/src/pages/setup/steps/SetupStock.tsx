import React, { useEffect, useState } from 'react';
import { StepProps, setupFetch, BASE } from '../setupUtils';

interface CountResult { total: number; }

export default function SetupStock({ onNext, onBack, onSkip }: StepProps) {
  const [counts, setCounts] = useState({ ingredients: 0, locations: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      setupFetch<CountResult>('/api/ingredients/count').catch(() => ({ total: 0 })),
      setupFetch<CountResult>('/api/storage-locations/count').catch(() => ({ total: 0 })),
    ]).then(([ing, loc]) => {
      setCounts({ ingredients: ing.total ?? 0, locations: loc.total ?? 0 });
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">📦 Stock e ingredientes</h2>
      <p className="text-zinc-500 mb-6">El módulo de stock te permite controlar el inventario y los costes de ingredientes.</p>

      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 mb-6 text-sm text-amber-200/80">
        <strong>Ayuda:</strong> No es obligatorio configurar el stock para empezar a usar el TPV. Puedes activarlo más adelante desde el panel de administración.
      </div>

      {/* Module overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {[
          { icon: '🥩', title: 'Ingredientes', desc: 'Materias primas con coste y unidad de medida', href: '/ingredientes' },
          { icon: '📊', title: 'Stock y niveles', desc: 'Inventario en tiempo real con alertas de mínimos', href: '/stock' },
          { icon: '🏭', title: 'Almacenes', desc: 'Organiza ingredientes por ubicación física', href: '/admin/almacenes' },
          { icon: '🧪', title: 'Escandallos', desc: 'Coste teórico por plato a partir de recetas', href: '/productos' },
        ].map((item) => (
          <a key={item.title} href={`${BASE}${item.href}`} target="_blank" rel="noreferrer"
            className="flex items-start gap-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 group transition-colors">
            <span className="text-2xl shrink-0">{item.icon}</span>
            <div>
              <h3 className="font-medium text-zinc-200 text-sm group-hover:text-amber-400 transition-colors">{item.title}</h3>
              <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
            </div>
          </a>
        ))}
      </div>

      {!loading && (counts.ingredients > 0 || counts.locations > 0) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 flex gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-400">{counts.ingredients}</div>
            <div className="text-xs text-zinc-500">ingrediente(s)</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-400">{counts.locations}</div>
            <div className="text-xs text-zinc-500">almacén(es)</div>
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-3">
        <span className="text-amber-400 text-lg">💡</span>
        <div>
          <p className="text-sm font-medium text-zinc-300">¿Cuándo activar el stock?</p>
          <p className="text-xs text-zinc-500 mt-1">El stock es útil una vez el restaurante está operativo y quieres controlar costes y mermas. No bloquea la puesta en marcha del TPV.</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
        <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm">← Anterior</button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm">Omitir este módulo</button>
          <button onClick={onNext} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm">
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}
