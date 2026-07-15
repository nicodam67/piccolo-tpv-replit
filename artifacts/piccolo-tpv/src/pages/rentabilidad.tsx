import { useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, TrendingUp, TrendingDown, AlertTriangle, Loader2, RefreshCw, Clock } from 'lucide-react';
import {
  useGetAdminProfitability,
  useGetAdminProfitabilityByCategory,
  useGetAdminProfitabilityReports,
  useGetAdminCostAlerts,
  useGetAdminCostHistory,
} from '@workspace/api-client-react';
import type { ProductProfitability, ProfitabilityByCategory, CostAlert, CostHistoryEntry } from '@workspace/api-client-react';

type Tab = 'productos' | 'categoria' | 'informes' | 'alertas';

function marginColor(pct: string | number) {
  const v = typeof pct === 'string' ? parseFloat(pct) : pct;
  if (v >= 60) return '#3caa78';
  if (v >= 30) return '#d2a032';
  return '#dc3c3c';
}

function fcColor(pct: string | number) {
  const v = typeof pct === 'string' ? parseFloat(pct) : pct;
  if (v <= 25) return '#3caa78';
  if (v <= 35) return '#d2a032';
  return '#dc3c3c';
}

export default function Rentabilidad() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>('productos');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'name' | 'margin' | 'foodcost'>('margin');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'productos', label: 'Productos' },
    { id: 'categoria', label: 'Categoría' },
    { id: 'informes', label: 'Informes' },
    { id: 'alertas', label: 'Alertas' },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-border bg-card">
        <button onClick={() => setLocation('/admin')}
          className="p-2 rounded-lg hover:bg-secondary transition-colors">
          <ChevronLeft size={18} />
        </button>
        <TrendingUp size={18} className="text-primary" />
        <h1 className="font-bold text-base flex-1">Rentabilidad</h1>
      </header>

      {/* Tab bar */}
      <div className="flex gap-0.5 px-4 pt-3 pb-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-bold transition-colors ${
              tab === t.id
                ? 'bg-card border border-b-0 border-border text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="border-t border-border" />

      <div className="flex-1 overflow-auto">
        {tab === 'productos' && (
          <ProductosTab search={search} setSearch={setSearch} sort={sort} setSort={setSort} />
        )}
        {tab === 'categoria' && <CategoriaTab />}
        {tab === 'informes' && <InformesTab />}
        {tab === 'alertas' && <AlertasTab />}
      </div>
    </div>
  );
}

// ── Productos tab ─────────────────────────────────────────────────────────────
function ProductosTab({
  search, setSearch, sort, setSort,
}: {
  search: string;
  setSearch: (s: string) => void;
  sort: 'name' | 'margin' | 'foodcost';
  setSort: (s: 'name' | 'margin' | 'foodcost') => void;
}) {
  const { data, isLoading, refetch, isFetching } = useGetAdminProfitability();

  if (isLoading) return <LoadingState />;

  const all = (data as ProductProfitability[] ?? []);
  let list = all.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.categoryName.toLowerCase().includes(search.toLowerCase()),
  );

  if (sort === 'margin') list = [...list].sort((a, b) => parseFloat(b.marginPct) - parseFloat(a.marginPct));
  else if (sort === 'foodcost') list = [...list].sort((a, b) => parseFloat(a.foodCostPct) - parseFloat(b.foodCostPct));
  else list = [...list].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
      {/* Toolbar */}
      <div className="flex gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…"
          className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary/50" />
        <select value={sort} onChange={e => setSort(e.target.value as any)}
          className="px-2 py-2 rounded-lg bg-card border border-border text-xs text-muted-foreground focus:outline-none">
          <option value="margin">Margen ↓</option>
          <option value="foodcost">Food cost ↑</option>
          <option value="name">Nombre A-Z</option>
        </select>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors">
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary row */}
      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-3 text-center">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Productos</p>
            <p className="text-lg font-black">{list.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Margen medio</p>
            <p className="text-lg font-black" style={{ color: marginColor(list.reduce((s, p) => s + parseFloat(p.marginPct), 0) / list.length) }}>
              {(list.reduce((s, p) => s + parseFloat(p.marginPct), 0) / list.length).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Food cost medio</p>
            <p className="text-lg font-black" style={{ color: fcColor(list.reduce((s, p) => s + parseFloat(p.foodCostPct), 0) / list.length) }}>
              {(list.reduce((s, p) => s + parseFloat(p.foodCostPct), 0) / list.length).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-secondary/30 text-[10px] font-bold uppercase text-muted-foreground tracking-wide">
          <div className="col-span-4">Producto</div>
          <div className="col-span-2 text-right">PVP</div>
          <div className="col-span-2 text-right">Coste</div>
          <div className="col-span-2 text-right">Margen %</div>
          <div className="col-span-2 text-right">Food cost</div>
        </div>
        {list.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin resultados</div>
        )}
        {list.map(p => (
          <div key={p.id} className="grid grid-cols-12 gap-1 px-3 py-2.5 border-t border-border hover:bg-secondary/10 transition-colors items-center">
            <div className="col-span-4 min-w-0">
              <p className="text-sm font-semibold truncate">{p.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{p.categoryName}</p>
            </div>
            <div className="col-span-2 text-right text-sm font-mono">{parseFloat(p.pvp).toFixed(2)}€</div>
            <div className="col-span-2 text-right text-sm font-mono">{parseFloat(p.totalCost).toFixed(4)}€</div>
            <div className="col-span-2 text-right">
              <span className="text-sm font-bold font-mono" style={{ color: marginColor(p.marginPct) }}>
                {parseFloat(p.marginPct).toFixed(1)}%
              </span>
            </div>
            <div className="col-span-2 text-right">
              <span className="text-sm font-bold font-mono" style={{ color: fcColor(p.foodCostPct) }}>
                {parseFloat(p.foodCostPct).toFixed(1)}%
              </span>
              {p.alert && (
                <AlertTriangle size={10} className="inline ml-1 text-amber-400" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Categoría tab ─────────────────────────────────────────────────────────────
function CategoriaTab() {
  const { data, isLoading } = useGetAdminProfitabilityByCategory();
  const [openCat, setOpenCat] = useState<string | null>(null);

  if (isLoading) return <LoadingState />;

  const cats = (data as ProfitabilityByCategory[] ?? []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
      {cats.map(cat => (
        <div key={cat.categoryId} className="rounded-xl border border-border bg-card overflow-hidden">
          <button
            onClick={() => setOpenCat(openCat === cat.categoryId ? null : cat.categoryId)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/20 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{cat.categoryName}</p>
              <p className="text-[11px] text-muted-foreground">{cat.products.length} productos</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-muted-foreground">Food cost medio</p>
              <p className="text-sm font-bold" style={{ color: fcColor(cat.avgFoodCostPct) }}>
                {parseFloat(cat.avgFoodCostPct).toFixed(1)}%
              </p>
            </div>
          </button>
          {openCat === cat.categoryId && (
            <div className="border-t border-border">
              {cat.products.map(p => (
                <div key={p.id} className="grid grid-cols-10 gap-1 px-4 py-2 border-b border-border/50 last:border-0 items-center">
                  <div className="col-span-4 text-sm truncate">{p.name}</div>
                  <div className="col-span-2 text-right text-xs font-mono text-muted-foreground">{parseFloat(p.pvp).toFixed(2)}€</div>
                  <div className="col-span-2 text-right text-xs font-mono" style={{ color: marginColor(p.marginPct) }}>
                    {parseFloat(p.marginPct).toFixed(1)}%
                  </div>
                  <div className="col-span-2 text-right text-xs font-mono" style={{ color: fcColor(p.foodCostPct) }}>
                    {parseFloat(p.foodCostPct).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {cats.length === 0 && <EmptyState text="Sin datos de rentabilidad. Crea recetas para tus productos." />}
    </div>
  );
}

// ── Informes tab ──────────────────────────────────────────────────────────────
function InformesTab() {
  const { data, isLoading } = useGetAdminProfitabilityReports();
  const { data: costHistory = [] } = useGetAdminCostHistory({ limit: '20' });

  if (isLoading) return <LoadingState />;

  if (!data) return <EmptyState text="Sin datos de informes." />;

  const report = data as any;

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
      {/* Overview KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Margen medio (últimos 30 días)</p>
          <p className="text-2xl font-black" style={{ color: marginColor(report.avgMarginPct) }}>{parseFloat(report.avgMarginPct).toFixed(1)}%</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Food cost medio</p>
          <p className="text-2xl font-black" style={{ color: fcColor(report.avgFoodCostPct) }}>{parseFloat(report.avgFoodCostPct).toFixed(1)}%</p>
        </div>
      </div>

      {/* Most profitable */}
      {report.mostProfitable?.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-secondary/30 flex items-center gap-2">
            <TrendingUp size={13} className="text-green-400" />
            <p className="text-xs font-bold">Más rentables</p>
          </div>
          {report.mostProfitable.map((p: any, i: number) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-border">
              <span className="text-[10px] font-black text-muted-foreground w-4">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{p.name}</p>
                <p className="text-[10px] text-muted-foreground">{p.categoryName}</p>
              </div>
              <span className="text-sm font-bold" style={{ color: marginColor(p.marginPct) }}>{p.marginPct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Least profitable */}
      {report.leastProfitable?.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-secondary/30 flex items-center gap-2">
            <TrendingDown size={13} className="text-red-400" />
            <p className="text-xs font-bold">Menos rentables</p>
          </div>
          {report.leastProfitable.map((p: any, i: number) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-border">
              <span className="text-[10px] font-black text-muted-foreground w-4">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{p.name}</p>
                <p className="text-[10px] text-muted-foreground">{p.categoryName}</p>
              </div>
              <span className="text-sm font-bold" style={{ color: marginColor(p.marginPct) }}>{p.marginPct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Cost history */}
      {(costHistory as CostHistoryEntry[]).length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-secondary/30 flex items-center gap-2">
            <Clock size={13} className="text-muted-foreground" />
            <p className="text-xs font-bold">Historial de precios reciente</p>
          </div>
          {(costHistory as CostHistoryEntry[]).map(h => {
            const diff = parseFloat(h.newCost) - parseFloat(h.previousCost);
            const pct = parseFloat(h.previousCost) > 0 ? (diff / parseFloat(h.previousCost)) * 100 : 0;
            return (
              <div key={h.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{h.ingredientName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {parseFloat(h.previousCost).toFixed(4)}€ → {parseFloat(h.newCost).toFixed(4)}€
                    {h.reason && ` · ${h.reason}`}
                  </p>
                </div>
                <span className={`text-sm font-bold ${diff >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {diff >= 0 ? '+' : ''}{pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Alertas tab ───────────────────────────────────────────────────────────────
function AlertasTab() {
  const { data, isLoading } = useGetAdminCostAlerts();

  if (isLoading) return <LoadingState />;

  const alerts = (data as CostAlert[] ?? []);

  if (alerts.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
        <TrendingUp size={22} className="text-green-400" />
      </div>
      <p className="text-sm font-semibold">Sin alertas activas</p>
      <p className="text-xs text-center max-w-xs">Todos los productos tienen márgenes y food costs dentro de los rangos aceptables.</p>
    </div>
  );

  const foodCostAlerts = alerts.filter(a => a.type === 'food_cost_high');
  const marginAlerts = alerts.filter(a => a.type === 'margin_low');

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      {foodCostAlerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle size={12} /> Food cost elevado ({'>'}35%)
          </p>
          {foodCostAlerts.map(a => (
            <div key={a.productId} className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{a.productName}</p>
                  <p className="text-[11px] text-muted-foreground">{a.categoryName} · PVP {parseFloat(a.pvp).toFixed(2)}€ · Coste {parseFloat(a.totalCost).toFixed(4)}€</p>
                </div>
                <span className="text-base font-black text-amber-400">{parseFloat(a.value).toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {marginAlerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-red-400 uppercase tracking-wide flex items-center gap-1.5">
            <TrendingDown size={12} /> Margen bajo ({'<'}20%)
          </p>
          {marginAlerts.map(a => (
            <div key={a.productId} className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{a.productName}</p>
                  <p className="text-[11px] text-muted-foreground">{a.categoryName} · PVP {parseFloat(a.pvp).toFixed(2)}€ · Coste {parseFloat(a.totalCost).toFixed(4)}€</p>
                </div>
                <span className="text-base font-black text-red-400">{parseFloat(a.value).toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 size={22} className="animate-spin" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground px-6 text-center">
      <TrendingUp size={28} strokeWidth={1.2} />
      <p className="text-sm">{text}</p>
    </div>
  );
}
