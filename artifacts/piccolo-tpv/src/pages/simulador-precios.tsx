import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, Calculator, RefreshCw, Loader2, Check, Search, X } from 'lucide-react';
import {
  useGetAdminProfitability,
  useSimulatePrice,
} from '@workspace/api-client-react';
import type { ProductProfitability, PriceSimulatorResult } from '@workspace/api-client-react';
import { toast } from 'sonner';

function marginColor(pct: number | string) {
  const v = typeof pct === 'string' ? parseFloat(pct) : pct;
  if (v >= 60) return '#3caa78';
  if (v >= 30) return '#d2a032';
  return '#dc3c3c';
}

function fcColor(pct: number | string) {
  const v = typeof pct === 'string' ? parseFloat(pct) : pct;
  if (v <= 25) return '#3caa78';
  if (v <= 35) return '#d2a032';
  return '#dc3c3c';
}

export default function SimuladorPrecios() {
  const [, setLocation] = useLocation();
  const { data: profitability = [], refetch: refetchProfitability } = useGetAdminProfitability();

  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) void refetchProfitability(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refetchProfitability]);
  const simulate = useSimulatePrice();

  const [productId, setProductId] = useState('');
  const [mode, setMode] = useState<'margin' | 'foodcost'>('margin');
  const [targetMargin, setTargetMargin] = useState('65');
  const [maxFoodCost, setMaxFoodCost] = useState('30');
  const [roundTo, setRoundTo] = useState('0.05');
  const [result, setResult] = useState<PriceSimulatorResult | null>(null);

  const [productSearch, setProductSearch] = useState('');

  const products = profitability as ProductProfitability[];
  const selectedProduct = products.find(p => p.id === productId);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return q ? products.filter(p => p.name.toLowerCase().includes(q) || p.categoryName.toLowerCase().includes(q)) : products;
  }, [products, productSearch]);

  const handleSimulate = async () => {
    if (!productId) { toast.error('Selecciona un producto'); return; }
    try {
      const payload: any = { productId, roundTo: parseFloat(roundTo) || 0.05 };
      if (mode === 'margin') payload.targetMarginPct = parseFloat(targetMargin);
      else payload.maxFoodCostPct = parseFloat(maxFoodCost);

      const res = await simulate.mutateAsync({ data: payload });
      setResult(res);
    } catch { toast.error('Error en el simulador'); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-border bg-card">
        <button onClick={() => setLocation('/admin')}
          className="p-2 rounded-lg hover:bg-secondary transition-colors">
          <ChevronLeft size={18} />
        </button>
        <Calculator size={18} className="text-primary" />
        <h1 className="font-bold text-base flex-1">Simulador de precios</h1>
      </header>

      <div className="flex-1 max-w-xl mx-auto w-full px-4 py-6 space-y-5">

        {/* Product selector */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">1. Selecciona un producto</p>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={productSearch}
              autoFocus
            onChange={e => setProductSearch(e.target.value)}
              placeholder="Filtrar productos…"
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50"
            />
            {productSearch && (
              <button onClick={() => setProductSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={13} />
              </button>
            )}
          </div>
          <select value={productId} onChange={e => { setProductId(e.target.value); setResult(null); }}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50">
            <option value="">-- Selecciona --</option>
            {filteredProducts.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.categoryName})</option>
            ))}
          </select>
          {filteredProducts.length === 0 && productSearch && (
            <p className="text-xs text-muted-foreground">Sin resultados — <button onClick={() => setProductSearch('')} className="text-primary hover:underline">Borrar búsqueda</button></p>
          )}

          {selectedProduct && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs rounded-lg bg-secondary/30 p-2">
              <div>
                <p className="text-muted-foreground">PVP actual</p>
                <p className="font-bold">{parseFloat(selectedProduct.pvp).toFixed(2)}€</p>
              </div>
              <div>
                <p className="text-muted-foreground">Coste receta</p>
                <p className="font-bold">{parseFloat(selectedProduct.totalCost).toFixed(4)}€</p>
              </div>
              <div>
                <p className="text-muted-foreground">Margen actual</p>
                <p className="font-bold" style={{ color: marginColor(selectedProduct.marginPct) }}>
                  {parseFloat(selectedProduct.marginPct).toFixed(1)}%
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Mode & target */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">2. Objetivo</p>

          <div className="flex gap-1 rounded-lg bg-secondary p-0.5">
            {([['margin', 'Por margen'], ['foodcost', 'Por food cost']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setMode(id)}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${mode === id ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>
                {label}
              </button>
            ))}
          </div>

          {mode === 'margin' ? (
            <div>
              <label className="text-[10px] font-bold text-muted-foreground block mb-1">Margen objetivo (%)</label>
              <input type="number" step="1" min="1" max="99" value={targetMargin} onChange={e => setTargetMargin(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50" />
              <p className="text-[11px] text-muted-foreground mt-1">El PVP recomendado para que el margen neto s/base IVA sea este porcentaje.</p>
            </div>
          ) : (
            <div>
              <label className="text-[10px] font-bold text-muted-foreground block mb-1">Food cost máximo (%)</label>
              <input type="number" step="1" min="1" max="99" value={maxFoodCost} onChange={e => setMaxFoodCost(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50" />
              <p className="text-[11px] text-muted-foreground mt-1">El PVP mínimo para que el coste no supere este porcentaje del precio base.</p>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-muted-foreground block mb-1">Redondear a</label>
            <select value={roundTo} onChange={e => setRoundTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50">
              <option value="0.01">€0.01</option>
              <option value="0.05">€0.05</option>
              <option value="0.10">€0.10</option>
              <option value="0.25">€0.25</option>
              <option value="0.50">€0.50</option>
              <option value="1.00">€1.00</option>
            </select>
          </div>

          <button onClick={handleSimulate} disabled={!productId || simulate.isPending}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2">
            {simulate.isPending ? <><Loader2 size={15} className="animate-spin" /> Calculando…</> : <><RefreshCw size={15} /> Simular</>}
          </button>
        </div>

        {/* Results */}
        {result && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4">
            <p className="text-xs font-bold text-primary uppercase tracking-wide">3. Resultado</p>

            {/* Current vs recommended */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-card p-3 text-center">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Precio actual</p>
                <p className="text-xl font-black">{parseFloat(result.currentPrice).toFixed(2)}€</p>
                <p className="text-[11px] text-muted-foreground">Margen {parseFloat(result.currentMarginPct).toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border border-primary/40 bg-card p-3 text-center">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Precio recomendado</p>
                <p className="text-xl font-black text-primary">
                  {result.recommendedPrice ? `${parseFloat(result.recommendedPrice).toFixed(2)}€` : '—'}
                </p>
                {result.recommendedPrice && (
                  <p className="text-[11px] text-muted-foreground">
                    Base s/IVA: {parseFloat(result.recommendedBase ?? '0').toFixed(4)}€
                  </p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-lg bg-card border border-border p-2">
                <p className="text-muted-foreground">Coste receta</p>
                <p className="font-bold">{parseFloat(result.currentTotalCost).toFixed(4)}€</p>
              </div>
              <div className="rounded-lg bg-card border border-border p-2">
                <p className="text-muted-foreground">Food cost actual</p>
                <p className="font-bold" style={{ color: fcColor(result.currentFoodCostPct) }}>
                  {parseFloat(result.currentFoodCostPct).toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Rounded options */}
            {result.roundedOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Opciones redondeadas</p>
                {result.roundedOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card">
                    {opt.price === result.recommendedPrice && (
                      <Check size={13} className="text-primary shrink-0" />
                    )}
                    <p className="text-sm font-bold flex-1">{parseFloat(opt.price).toFixed(2)}€</p>
                    <div className="text-right text-xs">
                      <span style={{ color: marginColor(opt.marginPct) }} className="font-bold">{parseFloat(opt.marginPct).toFixed(1)}% margen</span>
                      <span className="text-muted-foreground mx-1.5">·</span>
                      <span style={{ color: fcColor(opt.foodCostPct) }} className="font-bold">{parseFloat(opt.foodCostPct).toFixed(1)}% FC</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
