import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import type { PriceComparisonEntry } from '@workspace/api-client-react';
import { ArrowLeft, BarChart3, Star, TrendingDown, TrendingUp, ChevronRight } from 'lucide-react';

interface IngredientSummary {
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  supplierCount: number;
}

interface PriceComparisonResult {
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  avgUnitPrice: string;
  minUnitPrice: string;
  suppliers: PriceComparisonEntry[];
}

export default function ComparacionPrecios() {
  const [, setLocation] = useLocation();
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null);

  const { data: ingredients = [], isLoading: loadingList } = useQuery<IngredientSummary[]>({
    queryKey: ['price-comparison-list'],
    queryFn: () => customFetch('/api/admin/price-comparison'),
  });

  const { data: comparison, isLoading: loadingComparison } = useQuery<PriceComparisonResult>({
    queryKey: ['price-comparison', selectedIngredientId],
    queryFn: () => customFetch(`/api/admin/price-comparison?ingredientId=${selectedIngredientId}`),
    enabled: !!selectedIngredientId,
  });

  const minPrice = comparison ? parseFloat(comparison.minUnitPrice) : 0;

  function priceDiffColor(pctVsMin: string) {
    const pct = parseFloat(pctVsMin);
    if (pct <= 0) return 'text-green-400';
    if (pct <= 5) return 'text-yellow-400';
    return 'text-red-400';
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 h-14 border-b border-border bg-card/80 backdrop-blur">
        <button onClick={() => setLocation('/admin')} className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Comparación de precios</h1>
      </header>

      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left: ingredient list */}
        <aside className="w-64 border-r border-border overflow-y-auto shrink-0">
          {loadingList ? (
            <p className="p-4 text-sm text-muted-foreground">Cargando...</p>
          ) : ingredients.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Sin ingredientes con múltiples proveedores</p>
          ) : ingredients.map(ing => (
            <button key={ing.ingredientId} onClick={() => setSelectedIngredientId(ing.ingredientId)}
              className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 flex items-center gap-3 ${selectedIngredientId === ing.ingredientId ? 'bg-muted' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ing.ingredientName}</p>
                <p className="text-xs text-muted-foreground">{ing.ingredientUnit} · {ing.supplierCount} prov.</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </aside>

        {/* Right: comparison table */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedIngredientId ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <BarChart3 className="w-12 h-12 opacity-20" />
              <p className="text-sm">Selecciona un ingrediente para comparar precios</p>
            </div>
          ) : loadingComparison ? (
            <p className="text-sm text-muted-foreground">Cargando comparación...</p>
          ) : !comparison ? null : (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold">{comparison.ingredientName}</h2>
                <div className="flex gap-6 mt-2 text-sm text-muted-foreground">
                  <span>Precio medio/ud: <strong className="text-foreground">{parseFloat(comparison.avgUnitPrice).toFixed(4)} €</strong></span>
                  <span>Precio mínimo/ud: <strong className="text-green-400">{parseFloat(comparison.minUnitPrice).toFixed(4)} €</strong></span>
                </div>
              </div>

              <div className="grid gap-4">
                {comparison.suppliers.map((entry, idx) => {
                  const pctNum = parseFloat(entry.pctVsMin);
                  return (
                    <div key={entry.catalogItemId}
                      className={`border rounded-xl p-4 ${idx === 0 ? 'border-green-800 bg-green-950/30' : 'border-border bg-card'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{entry.supplierName}</h3>
                            {entry.isPreferred && (
                              <span className="flex items-center gap-1 text-amber-400 text-xs"><Star className="w-3 h-3" fill="currentColor" /> Preferido</span>
                            )}
                            {idx === 0 && (
                              <span className="bg-green-800 text-green-300 text-xs px-2 py-0.5 rounded-full">Mejor precio</span>
                            )}
                          </div>
                          {entry.supplierRef && <p className="text-xs text-muted-foreground mt-0.5">Ref: {entry.supplierRef}</p>}
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">{parseFloat(entry.unitPrice).toFixed(4)} €<span className="text-sm font-normal text-muted-foreground">/ud</span></div>
                          <div className={`text-sm font-medium flex items-center justify-end gap-1 ${priceDiffColor(entry.pctVsMin)}`}>
                            {pctNum > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            {pctNum >= 0 ? '+' : ''}{entry.pctVsMin}% vs mínimo
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-sm text-muted-foreground">
                        <div><span className="text-xs block">Precio tarifa</span><span className="text-foreground">{parseFloat(entry.price).toFixed(4)} €</span></div>
                        <div><span className="text-xs block">Formato</span><span className="text-foreground">{entry.purchaseFormat ?? '-'}</span></div>
                        <div><span className="text-xs block">Uds/pack</span><span className="text-foreground">{entry.unitsPerPack ?? '1'}</span></div>
                        <div><span className="text-xs block">Dto / Transp.</span><span className="text-foreground">{entry.discount ?? 0}% / {entry.transportCost ?? 0} €</span></div>
                        <div><span className="text-xs block">IVA</span><span className="text-foreground">{entry.vatPct ?? 10}%</span></div>
                        <div><span className="text-xs block">Lead time</span><span className="text-foreground">{entry.leadTimeDays ?? '-'} días</span></div>
                        <div><span className="text-xs block">Pedido mín.</span><span className="text-foreground">{entry.minOrder ?? '-'} €</span></div>
                        <div><span className="text-xs block">vs. media</span><span className={`${priceDiffColor(entry.pctVsAvg)}`}>{parseFloat(entry.pctVsAvg) >= 0 ? '+' : ''}{entry.pctVsAvg}%</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
