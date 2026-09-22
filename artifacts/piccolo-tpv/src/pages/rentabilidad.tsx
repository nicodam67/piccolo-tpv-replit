import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, TrendingUp, TrendingDown, AlertTriangle, Loader2, RefreshCw, Clock, X, Calculator } from 'lucide-react';
import {
  useGetAdminProfitabilityByCategory,
  useGetAdminCostAlerts,
  useGetAdminCostHistory,
} from '@workspace/api-client-react';
import type { ProductProfitability, ProfitabilityByCategory, CostAlert, CostHistoryEntry } from '@workspace/api-client-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

type Tab = 'productos' | 'categoria' | 'informes' | 'equilibrio' | 'alertas' | 'configuracion';

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
  const [channel, setChannel] = useState('tpv');

  // Re-fetch when returning to foreground so cost data stays fresh
  useEffect(() => {
    // refetch is handled by each sub-tab component — invalidating the cache
    // forces them to reload on next render
    const onVisibility = () => {
      if (!document.hidden) {
        // Dispatch a custom event that sub-components can pick up if needed;
        // tanstack-query refetchOnWindowFocus does not work inside iframes,
        // so we trigger manual invalidation via a storage ping
        window.dispatchEvent(new Event('focus'));
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'productos', label: 'Productos' },
    { id: 'categoria', label: 'Categoría' },
    { id: 'informes', label: 'Dashboard' },
    { id: 'equilibrio', label: 'Punto de equilibrio' },
    { id: 'alertas', label: 'Alertas' },
    { id: 'configuracion', label: 'Configuración' },
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
      <div className="flex gap-0.5 px-4 pt-3 pb-0 overflow-x-auto">
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
          <ProductosTab search={search} setSearch={setSearch} sort={sort} setSort={setSort} channel={channel} setChannel={setChannel} />
        )}
        {tab === 'categoria' && <CategoriaTab />}
        {tab === 'informes' && <InformesTab channel={channel} />}
        {tab === 'equilibrio' && <BreakEvenTab channel={channel} />}
        {tab === 'alertas' && <AlertasTab />}
        {tab === 'configuracion' && <ConfiguracionTab />}
      </div>
    </div>
  );
}

// ── Productos tab ─────────────────────────────────────────────────────────────
function ProductosTab({
  search, setSearch, sort, setSort, channel, setChannel,
}: {
  search: string;
  setSearch: (s: string) => void;
  sort: 'name' | 'margin' | 'foodcost';
  setSort: (s: 'name' | 'margin' | 'foodcost') => void;
  channel: string;
  setChannel: (channel: string) => void;
}) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['/api/admin/profitability', channel],
    queryFn: () => api.get<ProductProfitability[]>(`/api/admin/profitability?channel=${encodeURIComponent(channel)}`),
  });
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [department, setDepartment] = useState('all');

  if (isLoading) return <LoadingState />;

  const all = (data as ProductProfitability[] ?? []);
  let list = all.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.categoryName.toLowerCase().includes(search.toLowerCase()),
  ).filter(p => category === 'all' || p.categoryId === category)
    .filter(p => status === 'all' || p.status === status)
    .filter(p => department === 'all' || p.department === department);

  if (sort === 'margin') list = [...list].sort((a, b) => parseFloat(b.marginPct) - parseFloat(a.marginPct));
  else if (sort === 'foodcost') list = [...list].sort((a, b) => parseFloat(a.foodCostPct) - parseFloat(b.foodCostPct));
  else list = [...list].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
      {/* Toolbar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input value={search} autoFocus
            onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…"
            className="w-full px-3 py-2 pr-8 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary/50" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <select value={channel} onChange={e => setChannel(e.target.value)} className="px-2 py-2 rounded-lg bg-card border border-border text-xs">
          {['tpv', 'qr', 'web', 'phone', 'counter', 'takeaway', 'delivery', 'sala', 'terraza', 'plataforma', 'tarjeta', 'otros'].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={category} onChange={e => setCategory(e.target.value)} className="px-2 py-2 rounded-lg bg-card border border-border text-xs">
          <option value="all">Todas las categorías</option>
          {Array.from(new Map(all.map(p => [p.categoryId, p.categoryName]))).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={department} onChange={e => setDepartment(e.target.value)} className="px-2 py-2 rounded-lg bg-card border border-border text-xs">
          <option value="all">Todos los departamentos</option>
          {Array.from(new Set(all.map(p => p.department))).map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="px-2 py-2 rounded-lg bg-card border border-border text-xs">
          <option value="all">Todos los estados</option>
          <option value="green">🟢 Dentro del objetivo</option>
          <option value="orange">🟠 Revisar</option>
          <option value="red">🔴 Fuera / pérdida</option>
        </select>
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
          <div className="col-span-3">Producto</div>
          <div className="col-span-1 text-right">Coste</div>
          <div className="col-span-1 text-right">Precio</div>
          <div className="col-span-1 text-right">FC</div>
          <div className="col-span-2 text-right">Margen</div>
          <div className="col-span-2 text-right">Recomendado</div>
          <div className="col-span-2 text-right">Estado</div>
        </div>
        {list.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
            Sin resultados
            {search && (
              <button onClick={() => setSearch('')} className="block mx-auto mt-2 text-primary font-semibold hover:underline">
                Borrar búsqueda
              </button>
            )}
          </div>
        )}
        {list.map(p => (
          <div key={p.id} className="grid grid-cols-12 gap-1 px-3 py-2.5 border-t border-border hover:bg-secondary/10 transition-colors items-center">
            <div className="col-span-3 min-w-0">
              <p className="text-sm font-semibold truncate">{p.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{p.categoryName}</p>
            </div>
            <div className="col-span-1 text-right text-xs font-mono">{parseFloat(p.totalCost).toFixed(2)}€</div>
            <div className="col-span-1 text-right text-xs font-mono">{parseFloat(p.pvp).toFixed(2)}€</div>
            <div className="col-span-1 text-right text-xs font-bold" style={{ color: fcColor(p.foodCostPct) }}>{parseFloat(p.foodCostPct).toFixed(1)}%</div>
            <div className="col-span-2 text-right">
              <p className="text-xs font-bold" style={{ color: marginColor(p.marginPct) }}>{parseFloat(p.marginPct).toFixed(1)}%</p>
              <p className="text-[10px] text-muted-foreground">{parseFloat(p.contributionMargin).toFixed(2)}€</p>
            </div>
            <div className="col-span-2 text-right text-xs font-mono">{p.recommendedPrice ? `${parseFloat(p.recommendedPrice).toFixed(2)}€` : '—'}</div>
            <div className="col-span-2 text-right text-[10px] font-bold">
              {p.status === 'green' ? '🟢 Objetivo' : p.status === 'orange' ? '🟠 Revisar' : '🔴 Fuera'}
              <p className="text-muted-foreground font-normal">Obj. {parseFloat(p.targetMarginPct).toFixed(0)}%</p>
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
function InformesTab({ channel }: { channel: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/admin/profitability/reports', channel],
    queryFn: () => api.get<any>(`/api/admin/profitability/reports?channel=${encodeURIComponent(channel)}`),
  });
  const { data: costHistory = [] } = useGetAdminCostHistory({ limit: '20' });

  if (isLoading) return <LoadingState />;

  if (!data) return <EmptyState text="Sin datos de informes." />;

  const report = data as any;

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
      {/* Overview KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Ventas</p>
          <p className="text-xl font-black">{parseFloat(report.sales ?? '0').toFixed(2)}€</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Coste vendido</p>
          <p className="text-xl font-black">{parseFloat(report.costOfGoodsSold ?? '0').toFixed(2)}€</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Contribución</p>
          <p className="text-xl font-black">{parseFloat(report.contributionMargin ?? '0').toFixed(2)}€</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Vendidos con pérdida</p>
          <p className="text-xl font-black text-red-400">{report.soldAtLoss?.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Margen ponderado</p>
          <p className="text-2xl font-black" style={{ color: marginColor(report.avgMarginPct) }}>{parseFloat(report.avgMarginPct).toFixed(1)}%</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Food cost medio</p>
          <p className="text-2xl font-black" style={{ color: fcColor(report.avgFoodCostPct) }}>{parseFloat(report.avgFoodCostPct).toFixed(1)}%</p>
        </div>
        <div className="col-span-2 rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">Costes operativos estimados</p>
          <p className="text-xl font-black">{parseFloat(report.operatingCost ?? '0').toFixed(2)}€</p>
          <p className="text-[11px] text-muted-foreground">Reparto visible: {report.allocationMethod === 'none' ? 'sin asignar' : report.allocationMethod === 'revenue' ? 'por ventas' : 'por unidades'}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Ventas reconocidas por ticket fiscal; descuentos asignados proporcionalmente. Cobertura COGS histórico: {parseFloat(report.historicalCogsCoveragePct ?? '0').toFixed(1)}%.</p>
        </div>
      </div>

      {report.topContribution?.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-secondary/30"><p className="text-xs font-bold">Mayor contribución económica real</p></div>
          {report.topContribution.map((p: any) => (
            <div key={p.id} className="flex px-4 py-2 border-t border-border text-sm">
              <span className="flex-1">{p.name}</span>
              <strong>{p.contribution.toFixed(2)}€</strong>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-secondary/30"><p className="text-xs font-bold">Evolución de márgenes</p></div>
          {(report.marginEvolution ?? []).slice(-7).map((point: any) => (
            <div key={point.date} className="flex px-4 py-2 border-t border-border text-xs">
              <span className="flex-1">{point.date}</span>
              <span>{point.contribution.toFixed(2)}€ · <strong>{point.marginPct.toFixed(1)}%</strong></span>
            </div>
          ))}
          {!report.marginEvolution?.length && <p className="p-4 text-xs text-muted-foreground">Sin ventas pagadas en el periodo.</p>}
        </div>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-secondary/30"><p className="text-xs font-bold">Evolución de costes</p></div>
          {(report.costEvolution ?? []).slice(-7).map((point: any, index: number) => (
            <div key={`${point.ingredientId}-${point.createdAt}-${index}`} className="flex px-4 py-2 border-t border-border text-xs">
              <span className="flex-1">{new Date(point.createdAt).toLocaleDateString('es-ES')}</span>
              <span>{parseFloat(point.previousCost).toFixed(2)}€ → <strong>{parseFloat(point.newCost).toFixed(2)}€</strong></span>
            </div>
          ))}
          {!report.costEvolution?.length && <p className="p-4 text-xs text-muted-foreground">Sin cambios de coste en el periodo.</p>}
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

// ── Punto de equilibrio tab ──────────────────────────────────────────────────
type PeriodPreset = 'current' | 'previous' | 'custom';

function dateInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function periodDates(preset: PeriodPreset, customFrom: string, customTo: string) {
  const now = new Date();
  if (preset === 'previous') {
    return {
      from: dateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: dateInput(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (preset === 'custom') return { from: customFrom, to: customTo };
  return {
    from: dateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: dateInput(now),
  };
}

function euro(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? '—'
    : `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function qualityLabel(value: string) {
  return ({ REAL: 'REAL', CONFIGURED: 'CONFIGURADO', ESTIMATED: 'ESTIMADO', NO_DATA: 'SIN DATOS' } as Record<string, string>)[value] ?? value;
}

function QualityBadge({ value }: { value: string }) {
  const color = value === 'REAL'
    ? 'text-green-400 border-green-500/30 bg-green-500/10'
    : value === 'NO_DATA'
      ? 'text-red-400 border-red-500/30 bg-red-500/10'
      : 'text-amber-400 border-amber-500/30 bg-amber-500/10';
  return <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black ${color}`}>{qualityLabel(value)}</span>;
}

function BreakEvenTab({ channel }: { channel: string }) {
  const now = new Date();
  const [preset, setPreset] = useState<PeriodPreset>('current');
  const [customFrom, setCustomFrom] = useState(dateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customTo, setCustomTo] = useState(dateInput(now));
  const [targetProfit, setTargetProfit] = useState('0');
  const [scenario, setScenario] = useState({
    personnelPercent: '0',
    rawMaterialPercent: '0',
    electricityPercent: '0',
    averageTicketDelta: '0',
    openDaysDelta: '0',
    targetProfitDelta: '0',
    foodCostPct: '',
    commissionPercent: '0',
  });
  const dates = periodDates(preset, customFrom, customTo);
  const query = new URLSearchParams({
    from: `${dates.from}T00:00:00.000Z`,
    to: `${dates.to}T23:59:59.999Z`,
    targetProfit: targetProfit || '0',
    channel,
  });
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['/api/admin/profitability/break-even', dates.from, dates.to, targetProfit, channel],
    queryFn: () => api.get<any>(`/api/admin/profitability/break-even?${query.toString()}`),
    enabled: Boolean(dates.from && dates.to),
  });
  const simulation = useMutation({
    mutationFn: () => api.post<any>('/api/admin/profitability/break-even/scenario', {
      from: `${dates.from}T00:00:00.000Z`,
      to: `${dates.to}T23:59:59.999Z`,
      targetProfitMonthly: Number(targetProfit) || 0,
      channel,
      scenario: Object.fromEntries(
        Object.entries(scenario).map(([key, value]) => [key, value === '' ? undefined : Number(value)]),
      ),
    }),
  });

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState text="Sin datos para calcular el punto de equilibrio." />;
  const analysis = data as any;
  const metrics = analysis.metrics;
  const showTargets = analysis.complete;
  const monthlyPrimary = metrics.breakEvenMonthlyGross ?? metrics.breakEvenMonthlyNet;
  const dailyPrimary = metrics.minimumDailySalesGross ?? metrics.minimumDailySalesNet;
  const safetyPositive = (metrics.safetyMarginAmount ?? 0) >= 0;
  const progress = metrics.periodBreakEvenNet > 0
    ? Math.max(0, Math.min(100, analysis.actual.netSales / metrics.periodBreakEvenNet * 100))
    : 100;

  const metricCard = (label: string, value: string, subtext: string) => (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-black mt-1">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{subtext}</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
      <div className="flex flex-wrap gap-2 items-end rounded-xl border border-border bg-card p-3">
        <label className="text-[10px] font-bold text-muted-foreground uppercase">Periodo
          <select value={preset} onChange={e => setPreset(e.target.value as PeriodPreset)} className="block mt-1 p-2 rounded-lg bg-background border border-border text-xs text-foreground">
            <option value="current">Mes actual</option>
            <option value="previous">Mes anterior</option>
            <option value="custom">Rango personalizado</option>
          </select>
        </label>
        {preset === 'custom' && <>
          <label className="text-[10px] font-bold text-muted-foreground uppercase">Desde
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="block mt-1 p-2 rounded-lg bg-background border border-border text-xs" />
          </label>
          <label className="text-[10px] font-bold text-muted-foreground uppercase">Hasta
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="block mt-1 p-2 rounded-lg bg-background border border-border text-xs" />
          </label>
        </>}
        <label className="text-[10px] font-bold text-muted-foreground uppercase">Beneficio objetivo mensual
          <input type="number" min="0" value={targetProfit} onChange={e => setTargetProfit(e.target.value)} className="block mt-1 p-2 rounded-lg bg-background border border-border text-xs" />
        </label>
        <button onClick={() => refetch()} disabled={isFetching} className="p-2 rounded-lg bg-secondary text-xs font-bold flex gap-1.5 items-center">
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {!showTargets && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-bold text-red-400">Cálculo incompleto: no se muestra una cifra aparentemente exacta.</p>
          <p className="text-xs text-muted-foreground mt-1">Faltan: {(analysis.missingData ?? []).join(', ') || (metrics.issues ?? []).join(', ')}.</p>
        </div>
      )}
      {(analysis.warnings ?? []).map((warning: string) => (
        <div key={warning} className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">{warning}</div>
      ))}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metricCard('Punto de equilibrio mensual', showTargets ? euro(monthlyPrimary) : 'Sin datos', metrics.breakEvenMonthlyGross != null ? 'Facturación, IVA incluido' : 'Importe neto, sin IVA')}
        {metricCard('Venta mínima diaria', showTargets ? euro(dailyPrimary) : 'Sin datos', `${analysis.actual.configuredOpenDays || analysis.actual.actualOpenDays} días abiertos en el periodo`)}
        {metricCard('Tickets necesarios / día', showTargets && metrics.requiredDailyTickets != null ? Math.ceil(metrics.requiredDailyTickets).toString() : '—', 'Calculado con ticket medio neto')}
        {metricCard('Ticket medio actual', euro(metrics.averageTicketGross), `${analysis.actual.issuedTickets} tickets emitidos`)}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold">Ventas reales frente al equilibrio del periodo</p>
            <p className="text-[11px] text-muted-foreground">Importes netos de IVA · anulaciones y devoluciones incluidas</p>
          </div>
          <span className={`text-sm font-black ${safetyPositive ? 'text-green-400' : 'text-red-400'}`}>{euro(metrics.safetyMarginAmount)}</span>
        </div>
        <div className="h-3 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full ${safetyPositive ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${progress}%` }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><span className="text-muted-foreground">Ventas netas</span><strong className="block">{euro(analysis.actual.netSales)}</strong></div>
          <div><span className="text-muted-foreground">Equilibrio periodo</span><strong className="block">{euro(metrics.periodBreakEvenNet)}</strong></div>
          <div><span className="text-muted-foreground">Margen seguridad</span><strong className="block">{metrics.safetyMarginPct == null ? '—' : `${metrics.safetyMarginPct.toFixed(1)}%`}</strong></div>
          <div><span className="text-muted-foreground">Beneficio estimado</span><strong className="block">{euro(metrics.estimatedProfitPeriod)}</strong></div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h2 className="text-sm font-bold">Estructura económica</h2>
          {[
            ['Costes fijos mensuales', analysis.costs.fixedMonthly, analysis.sources.expenses],
            ['Personal mensual', analysis.costs.personnelMonthly, analysis.sources.personnel],
            ['COGS del periodo', analysis.actual.cogs, analysis.sources.cogs],
            ['Comisiones', analysis.actual.commissions, analysis.sources.commissions],
            ['Costes variables del periodo', analysis.costs.variablePeriod, analysis.sources.expenses],
          ].map(([label, value, source]) => (
            <div key={label as string} className="flex items-center gap-2 border-t border-border pt-2 text-xs">
              <span className="flex-1">{label as string}</span>
              <QualityBadge value={source as string} />
              <strong>{euro(value as number)}</strong>
            </div>
          ))}
          <div className="flex items-center gap-2 border-t border-border pt-2 text-xs">
            <span className="flex-1">Días de apertura</span><QualityBadge value={analysis.sources.openDays} />
            <strong>{analysis.actual.configuredOpenDays || analysis.actual.actualOpenDays}</strong>
          </div>
          <p className="text-[10px] text-muted-foreground">Ratio variable {(metrics.variableCostRatio * 100 || 0).toFixed(1)}% · margen de contribución {(metrics.contributionMarginRatio * 100 || 0).toFixed(1)}% · equilibrio semanal neto {euro(metrics.breakEvenWeeklyNet)}.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h2 className="text-sm font-bold">Objetivo de beneficio</h2>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-muted-foreground">Beneficio mensual</span><strong className="block text-lg">{euro(analysis.targetProfitMonthly)}</strong></div>
            <div><span className="text-muted-foreground">Facturación necesaria</span><strong className="block text-lg">{showTargets ? euro(metrics.targetRevenueMonthlyGross ?? metrics.targetRevenueMonthlyNet) : '—'}</strong></div>
            <div><span className="text-muted-foreground">Venta diaria necesaria</span><strong className="block">{showTargets ? euro(metrics.targetDailySalesGross ?? metrics.targetDailySalesNet) : '—'}</strong></div>
            <div><span className="text-muted-foreground">Tickets diarios</span><strong className="block">{showTargets && metrics.targetDailyTickets != null ? Math.ceil(metrics.targetDailyTickets) : '—'}</strong></div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2"><Calculator size={15} className="text-primary" /><h2 className="text-sm font-bold">Simulador sin persistencia</h2></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ['personnelPercent', 'Personal %'],
            ['rawMaterialPercent', 'Materia prima %'],
            ['electricityPercent', 'Electricidad %'],
            ['averageTicketDelta', 'Ticket medio +€'],
            ['openDaysDelta', 'Días apertura +/-'],
            ['targetProfitDelta', 'Beneficio objetivo +€'],
            ['foodCostPct', 'FoodCost objetivo %'],
            ['commissionPercent', 'Comisión delivery %'],
          ].map(([key, label]) => (
            <label key={key} className="text-[10px] text-muted-foreground">{label}
              <input type="number" value={scenario[key as keyof typeof scenario]} onChange={e => setScenario(current => ({ ...current, [key]: e.target.value }))} className="mt-1 w-full p-2 rounded-lg bg-background border border-border text-xs text-foreground" />
            </label>
          ))}
        </div>
        <button onClick={() => simulation.mutate()} disabled={simulation.isPending} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold">
          {simulation.isPending ? 'Calculando…' : 'Simular escenario'}
        </button>
        {simulation.data && (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-4 min-w-[560px] text-xs">
              <strong className="p-2">Métrica</strong><strong className="p-2 text-right">Actual</strong><strong className="p-2 text-right">Simulado</strong><strong className="p-2 text-right">Diferencia</strong>
              {[
                ['Punto equilibrio', 'breakEvenMonthlyNet'],
                ['Venta diaria', 'minimumDailySalesNet'],
                ['Tickets / día', 'requiredDailyTickets'],
                ['Beneficio estimado', 'estimatedProfitPeriod'],
              ].map(([label, key]) => (
                <div key={key} className="contents">
                  <span className="p-2 border-t border-border">{label}</span>
                  <span className="p-2 border-t border-border text-right">{key === 'requiredDailyTickets' ? simulation.data.actual.metrics[key]?.toFixed(1) ?? '—' : euro(simulation.data.actual.metrics[key])}</span>
                  <span className="p-2 border-t border-border text-right font-bold">{key === 'requiredDailyTickets' ? simulation.data.simulated.metrics[key]?.toFixed(1) ?? '—' : euro(simulation.data.simulated.metrics[key])}</span>
                  <span className="p-2 border-t border-border text-right">{key === 'requiredDailyTickets' ? simulation.data.difference[key]?.toFixed(1) : euro(simulation.data.difference[key])}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-green-400 mt-2">Escenario calculado en memoria; no se ha modificado ningún dato.</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 bg-secondary/30"><p className="text-xs font-bold">Evolución: venta neta vs. objetivo diario</p></div>
        {(analysis.evolution ?? []).slice(-14).map((point: any) => (
          <div key={point.date} className="flex px-4 py-2 border-t border-border text-xs">
            <span className="flex-1">{new Date(`${point.date}T12:00:00`).toLocaleDateString('es-ES')}</span>
            <span>{euro(point.netSales)} / <strong>{euro(point.targetNet)}</strong></span>
          </div>
        ))}
        {!analysis.evolution?.length && <p className="p-4 text-xs text-muted-foreground">Sin actividad económica en el periodo.</p>}
      </div>
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

function ConfiguracionTab() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/admin/profitability/config'],
    queryFn: () => api.get<any>('/api/admin/profitability/config'),
  });
  const { data: proposals = [], refetch: refetchProposals } = useQuery({
    queryKey: ['/api/admin/profitability/price-proposals'],
    queryFn: () => api.get<any[]>('/api/admin/profitability/price-proposals'),
  });
  const saveSettings = useMutation({
    mutationFn: (payload: unknown) => api.patch('/api/admin/profitability/config', payload),
    onSuccess: () => void refetch(),
  });
  const saveCommission = useMutation({
    mutationFn: ({ channel, ...payload }: any) => api.put(`/api/admin/profitability/commissions/${channel}`, payload),
    onSuccess: () => void refetch(),
  });
  const addExpense = useMutation({
    mutationFn: (payload: unknown) => api.post('/api/admin/profitability/expenses', payload),
    onSuccess: () => void refetch(),
  });
  const reviewProposal = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.post(`/api/admin/profitability/price-proposals/${id}/${action}`),
    onSuccess: () => void refetchProposals(),
  });
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('other');
  const [expenseCostType, setExpenseCostType] = useState('fixed');

  if (isLoading || !data) return <LoadingState />;
  const settings = data.settings;
  const channels = ['tpv', 'qr', 'web', 'phone', 'counter', 'takeaway', 'delivery', 'sala', 'terraza', 'plataforma', 'tarjeta', 'otros'];

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold">Objetivo y semáforo</h2>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-muted-foreground">Margen global %
            <input defaultValue={settings.defaultTargetMarginPct} onBlur={e => saveSettings.mutate({ defaultTargetMarginPct: Number(e.target.value) })} type="number" className="mt-1 w-full p-2 rounded-lg bg-background border border-border text-foreground" />
          </label>
          <label className="text-xs text-muted-foreground">Zona naranja (puntos)
            <input defaultValue={settings.warningGapPct} onBlur={e => saveSettings.mutate({ warningGapPct: Number(e.target.value) })} type="number" className="mt-1 w-full p-2 rounded-lg bg-background border border-border text-foreground" />
          </label>
          <label className="text-xs text-muted-foreground">Reparto indirectos
            <select value={settings.allocationMethod} onChange={e => saveSettings.mutate({ allocationMethod: e.target.value })} className="mt-1 w-full p-2 rounded-lg bg-background border border-border text-foreground">
              <option value="none">Sin asignar</option>
              <option value="revenue">Por ventas</option>
              <option value="units">Por unidades</option>
            </select>
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">Prioridad: producto+canal → producto → categoría+canal → categoría → global+canal → global.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold">Gastos operativos</h2>
        {data.expenses.map((expense: any) => (
          <div key={expense.id} className="flex text-xs border-b border-border pb-2">
            <span className="flex-1">{expense.name} · {expense.category} · {expense.costType}</span>
            <strong>{parseFloat(expense.amount).toFixed(2)}€ / {expense.periodMonths} mes(es)</strong>
          </div>
        ))}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <input value={expenseName} onChange={e => setExpenseName(e.target.value)} placeholder="Ej. Electricidad" className="p-2 rounded-lg bg-background border border-border text-sm" />
          <input value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} type="number" placeholder="Importe mensual" className="p-2 rounded-lg bg-background border border-border text-sm" />
          <select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)} className="p-2 rounded-lg bg-background border border-border text-xs">
            {['personal', 'rent', 'electricity', 'gas', 'water', 'software', 'insurance', 'maintenance', 'management', 'other'].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={expenseCostType} onChange={e => setExpenseCostType(e.target.value)} className="p-2 rounded-lg bg-background border border-border text-xs">
            <option value="fixed">Fijo</option>
            <option value="variable">Variable</option>
          </select>
          <button onClick={() => addExpense.mutate({ name: expenseName, amount: Number(expenseAmount), category: expenseCategory, costType: expenseCostType, frequency: 'monthly' })} className="rounded-lg bg-secondary text-xs font-bold">Añadir</button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold">Comisiones por canal</h2>
        {channels.map(channel => {
          const existing = data.commissions.find((row: any) => row.channel === channel);
          return (
            <div key={channel} className="grid grid-cols-4 gap-2 items-center text-xs">
              <strong>{channel}</strong>
              <input id={`${channel}-pct`} defaultValue={existing?.percent ?? '0'} type="number" placeholder="%" className="p-2 rounded-lg bg-background border border-border" />
              <input id={`${channel}-fixed`} defaultValue={existing?.fixedAmount ?? '0'} type="number" placeholder="Fijo €" className="p-2 rounded-lg bg-background border border-border" />
              <button onClick={() => saveCommission.mutate({
                channel,
                name: channel,
                percent: Number((document.getElementById(`${channel}-pct`) as HTMLInputElement).value),
                fixedAmount: Number((document.getElementById(`${channel}-fixed`) as HTMLInputElement).value),
              })} className="p-2 rounded-lg bg-secondary font-bold">Guardar</button>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold">Propuestas de precio</h2>
        {(proposals as any[]).filter(proposal => proposal.status === 'pending').map(proposal => (
          <div key={proposal.id} className="flex items-center gap-3 text-xs border-t border-border pt-2">
            <div className="flex-1">
              <strong>{proposal.productName}</strong>
              <p className="text-muted-foreground">{proposal.oldPrice}€ → {proposal.proposedPrice}€ · {proposal.reason}</p>
            </div>
            <button onClick={() => reviewProposal.mutate({ id: proposal.id, action: 'reject' })} className="px-2 py-1 rounded bg-secondary">Rechazar</button>
            <button onClick={() => reviewProposal.mutate({ id: proposal.id, action: 'approve' })} className="px-2 py-1 rounded bg-primary text-primary-foreground">Aprobar y aplicar</button>
          </div>
        ))}
        {(proposals as any[]).filter(proposal => proposal.status === 'pending').length === 0 && <p className="text-xs text-muted-foreground">No hay propuestas pendientes.</p>}
      </div>
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
