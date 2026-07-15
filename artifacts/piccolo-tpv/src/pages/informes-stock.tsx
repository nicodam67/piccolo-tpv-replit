import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft,
  BarChart3,
  Package,
  TrendingDown,
  Warehouse,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface IngredientReport {
  id: string;
  name: string;
  unit: string;
  currentStock: string;
  minStock: string;
  optimalStock: string;
  purchaseCost: string;
  stockValue: number;
  dailyConsumption: number;
  wasteTotal: number;
  daysRemaining: number | null;
}

interface ReportsData {
  warehouseValue: number;
  currency: string;
  ingredients: IngredientReport[];
  periodDays: number;
  from: string;
  to: string;
}

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',');
}

function Panel({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-secondary/30 border-b border-border hover:bg-secondary/50 transition-colors"
      >
        <span className="text-amber-500">{icon}</span>
        <span className="font-black text-sm flex-1 text-left">{title}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

export default function InformesStock() {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  async function loadReports() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token') ?? '';
      const to = new Date();
      const from = new Date(Date.now() - days * 86400_000);
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const resp = await fetch(`/api/admin/stock/reports?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(await resp.text());
      setData(await resp.json());
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Load on mount and when `days` changes
  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 shrink-0 flex items-center px-4 gap-3 bg-card border-b border-border">
        <button
          onClick={() => setLocation('/admin')}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <BarChart3 size={18} className="text-amber-500" />
        <div className="flex-1">
          <p className="font-black text-sm leading-tight">Informes de stock</p>
          <p className="text-[11px] text-muted-foreground">
            Existencias · valor · consumo · mermas
          </p>
        </div>
        {/* Period picker */}
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-xs font-bold bg-secondary border border-border rounded-lg px-2 py-1.5 focus:outline-none"
        >
          <option value={7}>7 días</option>
          <option value={14}>14 días</option>
          <option value={30}>30 días</option>
          <option value={90}>90 días</option>
        </select>
        <button
          onClick={loadReports}
          disabled={loading}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </header>

      <div className="flex-1 overflow-auto px-4 pb-8 pt-4 flex flex-col gap-4">
        {loading && !data && (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
            <Loader2 size={20} className="animate-spin mr-2" /> Cargando informe…
          </div>
        )}

        {data && (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                  Valor almacén
                </p>
                <p className="text-2xl font-black mt-1 text-amber-400">
                  {fmt(data.warehouseValue)} €
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                  Ingredientes
                </p>
                <p className="text-2xl font-black mt-1">
                  {data.ingredients.length}
                </p>
              </div>
            </div>

            {/* 1. Existencias actuales */}
            <Panel title="Existencias actuales" icon={<Package size={16} />}>
              <div className="divide-y divide-border">
                {data.ingredients.map((ing) => {
                  const cur = parseFloat(ing.currentStock);
                  const min = parseFloat(ing.minStock);
                  const opt = parseFloat(ing.optimalStock);
                  const pct = opt > 0 ? Math.min((cur / opt) * 100, 100) : cur > 0 ? 100 : 0;
                  const isLow = cur <= min && cur > 0;
                  const isZero = cur <= 0;
                  return (
                    <div key={ing.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{ing.name}</p>
                        <div className="h-1.5 rounded-full bg-secondary mt-1.5 overflow-hidden w-full max-w-[120px]">
                          <div
                            className={`h-full rounded-full ${isZero ? 'bg-red-500' : isLow ? 'bg-orange-500' : 'bg-green-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-black text-sm ${isZero ? 'text-red-400' : isLow ? 'text-orange-400' : 'text-foreground'}`}>
                          {fmt(cur)} {ing.unit}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{fmt(ing.stockValue)} €</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* 2. Valor del almacén */}
            <Panel title="Valor del almacén" icon={<Warehouse size={16} />}>
              <div className="divide-y divide-border">
                {[...data.ingredients]
                  .sort((a, b) => b.stockValue - a.stockValue)
                  .filter((i) => i.stockValue > 0)
                  .map((ing) => (
                    <div key={ing.id} className="px-4 py-2.5 flex items-center gap-3">
                      <p className="flex-1 text-sm font-semibold truncate">{ing.name}</p>
                      <p className="text-sm font-black text-amber-400 shrink-0">
                        {fmt(ing.stockValue)} €
                      </p>
                    </div>
                  ))}
                <div className="px-4 py-3 flex items-center gap-3 bg-secondary/30">
                  <p className="flex-1 font-black text-sm">TOTAL</p>
                  <p className="font-black text-sm text-amber-400">{fmt(data.warehouseValue)} €</p>
                </div>
              </div>
            </Panel>

            {/* 3. Consumo diario */}
            <Panel title={`Consumo medio diario (${data.periodDays} días)`} icon={<TrendingDown size={16} />}>
              <div className="divide-y divide-border">
                {[...data.ingredients]
                  .filter((i) => i.dailyConsumption > 0)
                  .sort((a, b) => b.dailyConsumption - a.dailyConsumption)
                  .map((ing) => (
                    <div key={ing.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{ing.name}</p>
                        {ing.daysRemaining !== null && (
                          <p className="text-[10px] text-muted-foreground">
                            {ing.daysRemaining > 0
                              ? `Agota en ~${ing.daysRemaining} días`
                              : 'Sin stock'}
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-black shrink-0">
                        {fmt(ing.dailyConsumption)} {ing.unit}/día
                      </p>
                    </div>
                  ))}
                {data.ingredients.every((i) => i.dailyConsumption === 0) && (
                  <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                    Sin movimientos de venta en el período seleccionado.
                  </div>
                )}
              </div>
            </Panel>

            {/* 4. Mermas */}
            <Panel title="Mermas" icon={<TrendingDown size={16} />} defaultOpen={false}>
              <div className="divide-y divide-border">
                {[...data.ingredients]
                  .filter((i) => i.wasteTotal > 0)
                  .sort((a, b) => b.wasteTotal - a.wasteTotal)
                  .map((ing) => (
                    <div key={ing.id} className="px-4 py-2.5 flex items-center gap-3">
                      <p className="flex-1 text-sm font-semibold truncate">{ing.name}</p>
                      <p className="text-sm font-black text-red-400 shrink-0">
                        -{fmt(ing.wasteTotal)} {ing.unit}
                      </p>
                    </div>
                  ))}
                {data.ingredients.every((i) => i.wasteTotal === 0) && (
                  <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                    Sin mermas registradas en el período seleccionado.
                  </div>
                )}
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
