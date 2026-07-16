import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch, BASE } from '../setupUtils';

interface Product { id: string; name: string; price: number; categoryId?: string; }
interface Category { id: string; name: string; }

export default function SetupCarta({ sessionId, onNext, onBack, onSkip }: StepProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    Promise.all([
      setupFetch<{ data: Product[] }>('/api/products?limit=6').then((r) => r.data ?? []).catch(() => []),
      setupFetch<{ data: Category[] }>('/api/categories?limit=10').then((r) => r.data ?? []).catch(() => []),
    ]).then(([p, c]) => { setProducts(p); setCategories(c); })
      .finally(() => setLoading(false));
  }, []);

  async function startSimulation() {
    setSimulating(true);
    try {
      await setupFetch('/api/setup/simulation/start', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      });
      toast.success('Datos de demostración creados. Recuerda limpiarlos antes de la puesta en producción.');
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">🍽️ Carta y productos</h2>
      <p className="text-zinc-500 mb-6">Añade los productos de tu carta o importa tu menú existente.</p>

      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 mb-6 text-sm text-amber-200/80">
        <strong>Ayuda:</strong> Puedes importar tu carta actual desde una hoja de cálculo o empezar añadiendo productos manualmente. Los datos de demostración te permiten probar el sistema sin afectar a la producción.
      </div>

      {/* Current state */}
      {!loading && (products.length > 0 || categories.length > 0) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-amber-400">{products.length}</span>
              <span className="text-sm text-zinc-400">producto(s)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-amber-400">{categories.length}</span>
              <span className="text-sm text-zinc-400">categoría(s)</span>
            </div>
          </div>
          {products.length > 0 && (
            <div className="text-xs text-zinc-500 space-y-1">
              {products.slice(0, 4).map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span className="text-zinc-400">{p.name}</span>
                  <span>{p.price?.toFixed(2)} €</span>
                </div>
              ))}
              {products.length > 4 && <div className="text-zinc-600">…y {products.length - 4} más</div>}
            </div>
          )}
          <a href={`${BASE}/productos`} target="_blank" rel="noreferrer" className="inline-flex mt-3 text-amber-400 hover:text-amber-300 text-xs underline">
            Ver todos los productos →
          </a>
        </div>
      )}

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Option 1: Empty */}
        <div className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 text-center transition-colors">
          <div className="text-3xl mb-2">📝</div>
          <h3 className="font-semibold text-zinc-200 mb-1">Empezar vacío</h3>
          <p className="text-xs text-zinc-500 mb-4">Añade los productos manualmente en el gestor de productos</p>
          <a href={`${BASE}/productos`} target="_blank" rel="noreferrer"
            className="inline-block px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition-colors">
            Ir a productos →
          </a>
        </div>

        {/* Option 2: Import */}
        <div className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 text-center transition-colors">
          <div className="text-3xl mb-2">📊</div>
          <h3 className="font-semibold text-zinc-200 mb-1">Importar CSV/Excel</h3>
          <p className="text-xs text-zinc-500 mb-4">Importa tu carta desde una hoja de cálculo</p>
          <a href={`${BASE}/productos`} target="_blank" rel="noreferrer"
            className="inline-block px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition-colors">
            Ir a importar →
          </a>
        </div>

        {/* Option 3: Demo */}
        <div className="bg-zinc-900 border border-amber-500/25 rounded-xl p-5 text-center">
          <div className="text-3xl mb-2">🎮</div>
          <h3 className="font-semibold text-amber-300 mb-1">Datos de demo</h3>
          <p className="text-xs text-zinc-500 mb-4">Usa una carta de ejemplo para probar el sistema</p>
          <button onClick={startSimulation} disabled={simulating}
            className="px-4 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded-lg text-xs transition-colors disabled:opacity-60">
            {simulating ? 'Creando…' : 'Usar demo'}
          </button>
        </div>
      </div>

      {/* Categorias link */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-sm text-zinc-400 mb-2">Gestiona también las categorías de la carta:</p>
        <div className="flex gap-3">
          <a href={`${BASE}/categorias`} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300 text-sm underline">
            Categorías →
          </a>
          <a href={`${BASE}/modificadores`} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300 text-sm underline">
            Modificadores →
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
        <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">← Anterior</button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">Omitir</button>
          <button onClick={onNext} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors">
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}
