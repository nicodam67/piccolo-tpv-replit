/**
 * Módulo de Informes — Panel de análisis completo de Piccolo TPV.
 * Integra datos de: TPV, Caja, Reservas, Fichaje, Food Cost.
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, Users, Tag, Archive, Clock, Package,
  BarChart3, Download, Printer, ChevronDown, Nfc,
  Receipt, AlertTriangle, Star, Layers,
} from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';

// ─── API helper ───────────────────────────────────────────────────────────────
const api = (path: string) => customFetch(path) as Promise<unknown>;

// ─── Formatters ───────────────────────────────────────────────────────────────
const eur = (v: number) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const num = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 0 });
const fmtDate = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`;
const fmtDateTime = (s: string) => new Date(s).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// ─── Color palettes ───────────────────────────────────────────────────────────
const TEAL   = '#50b4a0';
const ORANGE = '#ed874c';
const BLUE   = '#32b9d2';
const VIOLET = '#a78bfa';
const ROSE   = '#fb7185';
const AMBER  = '#fbbf24';
const COLORS = [TEAL, ORANGE, BLUE, VIOLET, ROSE, AMBER, '#34d399', '#f472b6', '#60a5fa', '#c084fc'];

// ─── Date range helpers ───────────────────────────────────────────────────────
type Preset = 'hoy' | 'ayer' | 'semana' | 'mes' | 'ano' | 'custom';

function getPresetRange(p: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const pad = (d: Date) => d.toISOString().slice(0, 10);
  const today = pad(now);
  switch (p) {
    case 'hoy':    return { from: today, to: today };
    case 'ayer': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const s = pad(y); return { from: s, to: s };
    }
    case 'semana': {
      const mon = new Date(now); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
      return { from: pad(mon), to: today };
    }
    case 'mes': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: pad(first), to: today };
    }
    case 'ano': {
      const first = new Date(now.getFullYear(), 0, 1);
      return { from: pad(first), to: today };
    }
    case 'custom': return { from: customFrom, to: customTo };
  }
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color = TEAL }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-start gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '22', color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-black text-white leading-none">{value}</p>
        {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-3">{children}</h3>;
}

function DataTable({ headers, rows, colAlign }: {
  headers: string[];
  rows: (string | number | React.ReactNode)[][];
  colAlign?: ('left' | 'right')[];
}) {
  if (rows.length === 0)
    return <p className="text-zinc-600 text-sm text-center py-8">Sin datos para el período seleccionado</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-zinc-800/60">
            {headers.map((h, i) => (
              <th key={i} className={`px-4 py-3 font-semibold text-zinc-400 ${(colAlign?.[i] ?? 'left') === 'right' ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className={`px-4 py-3 text-zinc-200 ${(colAlign?.[ci] ?? 'left') === 'right' ? 'text-right tabular-nums' : ''}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-48 text-zinc-600 gap-3">
      <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-teal-500 animate-spin" />
      Cargando datos…
    </div>
  );
}

function Empty() {
  return <p className="text-zinc-600 text-center py-12 text-sm">Sin datos para el período seleccionado</p>;
}

function ChartError() {
  return <p className="text-red-500 text-center py-8 text-sm">Error al cargar datos</p>;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CurrencyTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-bold text-white">{eur(p.value)}</p>
      ))}
    </div>
  );
}

// ─── TAB: Resumen ─────────────────────────────────────────────────────────────
function ResumenTab({ from, to }: { from: string; to: string }) {
  type Summary = {
    gross: number; net: number; tax: number; ticketCount: number; avgTicket: number;
    tips: number; discountTotal: number; discountCount: number; voidTotal: number; voidCount: number;
  };
  type TrendPoint = { period: string; total: number; count: number };

  const { data: s, isLoading: sl, isError: se } = useQuery<Summary>({
    queryKey: ['reports', 'summary', from, to],
    queryFn: () => api(`/api/reports/summary?from=${from}&to=${to}`) as Promise<Summary>,
  });
  const { data: trend, isLoading: tl } = useQuery<TrendPoint[]>({
    queryKey: ['reports', 'trend', from, to, 'day'],
    queryFn: () => api(`/api/reports/sales-trend?from=${from}&to=${to}&group_by=day`) as Promise<TrendPoint[]>,
  });

  if (sl) return <Loading />;
  if (se || !s) return <ChartError />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <KpiCard icon={<TrendingUp size={20} />} label="Ventas brutas"     value={eur(s.gross)}       color={TEAL}   />
        <KpiCard icon={<Receipt    size={20} />} label="Base imponible"    value={eur(s.net)}         color={BLUE}   />
        <KpiCard icon={<Tag        size={20} />} label="IVA total"         value={eur(s.tax)}         color={ORANGE} />
        <KpiCard icon={<Layers     size={20} />} label="Tickets emitidos"  value={num(s.ticketCount)} color={VIOLET} />
        <KpiCard icon={<BarChart3  size={20} />} label="Ticket medio"      value={eur(s.avgTicket)}   color={AMBER}  />
        <KpiCard icon={<Star       size={20} />} label="Propinas"          value={eur(s.tips)}        color={ROSE}   />
        <KpiCard icon={<Tag        size={20} />} label="Dto total" sub={`${s.discountCount} descuentos`} value={eur(s.discountTotal)} color={ROSE}   />
        <KpiCard icon={<AlertTriangle size={20} />} label="Anulaciones" sub={`${s.voidCount} anulaciones`} value={eur(s.voidTotal)} color="#f87171" />
      </div>

      {trend && trend.length > 1 && (
        <div>
          <SectionTitle>Evolución de ventas</SectionTitle>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trend.map(t => ({ ...t, period: fmtDate(t.period) }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gTeal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={TEAL} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={TEAL} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="period" tick={{ fill: '#71717a', fontSize: 11 }} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={38} />
                <Tooltip content={<CurrencyTooltip />} />
                <Area type="monotone" dataKey="total" stroke={TEAL} fill="url(#gTeal)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB: Ventas ──────────────────────────────────────────────────────────────
function VentasTab({ from, to }: { from: string; to: string }) {
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  type Row = { period: string; total: number; net: number; count: number };
  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ['reports', 'trend', from, to, groupBy],
    queryFn: () => api(`/api/reports/sales-trend?from=${from}&to=${to}&group_by=${groupBy}`) as Promise<Row[]>,
  });

  const total = data?.reduce((s, r) => s + r.total, 0) ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(['day', 'week', 'month'] as const).map(g => (
          <button key={g} onClick={() => setGroupBy(g)}
            className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-colors ${groupBy === g ? 'bg-teal-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
            {g === 'day' ? 'Diario' : g === 'week' ? 'Semanal' : 'Mensual'}
          </button>
        ))}
        <span className="ml-auto text-zinc-400 text-sm self-center">Total período: <span className="font-bold text-white">{eur(total)}</span></span>
      </div>

      {isLoading ? <Loading /> : (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={(data ?? []).map(r => ({ ...r, period: fmtDate(r.period) }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gTeal2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={TEAL} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={TEAL} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="period" tick={{ fill: '#71717a', fontSize: 11 }} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={v => `${v.toFixed(0)}€`} width={52} />
                <Tooltip content={<CurrencyTooltip />} />
                <Area type="monotone" dataKey="total" stroke={TEAL} fill="url(#gTeal2)" strokeWidth={2.5} name="Ventas" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            headers={['Período', 'Total', 'Base', 'Tickets']}
            colAlign={['left', 'right', 'right', 'right']}
            rows={(data ?? []).map(r => [fmtDate(r.period), eur(r.total), eur(r.net), num(r.count)])}
          />
        </>
      )}
    </div>
  );
}

// ─── TAB: Camareros ───────────────────────────────────────────────────────────
function CamarerosTab({ from, to }: { from: string; to: string }) {
  type Row = { id: string; name: string; total: number; net: number; count: number; avgTicket: number };
  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ['reports', 'waiter', from, to],
    queryFn: () => api(`/api/reports/by-waiter?from=${from}&to=${to}`) as Promise<Row[]>,
  });
  const grandTotal = data?.reduce((s, r) => s + r.total, 0) ?? 0;

  return (
    <div className="space-y-5">
      {isLoading ? <Loading /> : !data?.length ? <Empty /> : (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <ResponsiveContainer width="100%" height={Math.max(200, (data.length) * 44)}>
              <BarChart data={data.map(r => ({ name: r.name.split(' ')[0], total: r.total }))} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={v => `${v.toFixed(0)}€`} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#e4e4e7', fontSize: 13 }} width={80} />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="total" fill={TEAL} radius={[0, 6, 6, 0]} name="Ventas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            headers={['Camarero', 'Ventas', '% Total', 'Tickets', 'Ticket medio']}
            colAlign={['left', 'right', 'right', 'right', 'right']}
            rows={data.map(r => [
              r.name,
              eur(r.total),
              grandTotal > 0 ? `${((r.total / grandTotal) * 100).toFixed(1)}%` : '—',
              num(r.count),
              eur(r.avgTicket),
            ])}
          />
        </>
      )}
    </div>
  );
}

// ─── TAB: Salas y Mesas ───────────────────────────────────────────────────────
function SalasTab({ from, to }: { from: string; to: string }) {
  type ZoneData = {
    zoneId: string; zoneName: string; total: number; count: number;
    tables: { id: string; name: string; total: number; count: number }[];
  };
  const [openZone, setOpenZone] = useState<string | null>(null);
  const { data, isLoading } = useQuery<ZoneData[]>({
    queryKey: ['reports', 'zone', from, to],
    queryFn: () => api(`/api/reports/by-zone?from=${from}&to=${to}`) as Promise<ZoneData[]>,
  });

  return (
    <div className="space-y-4">
      {isLoading ? <Loading /> : !data?.length ? <Empty /> : (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.map(z => ({ name: z.zoneName, total: z.total }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={v => `${v.toFixed(0)}€`} width={52} />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {data.map(zone => (
            <div key={zone.zoneId} className="border border-zinc-800 rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpenZone(openZone === zone.zoneId ? null : zone.zoneId)}
                className="w-full flex items-center justify-between px-5 py-4 bg-zinc-900 hover:bg-zinc-800/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white">{zone.zoneName}</span>
                  <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{zone.tables.length} mesas</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-black text-white">{eur(zone.total)}</span>
                  <ChevronDown size={16} className={`text-zinc-500 transition-transform ${openZone === zone.zoneId ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {openZone === zone.zoneId && (
                <div className="px-5 pb-4 pt-2 bg-zinc-900/50">
                  <DataTable
                    headers={['Mesa', 'Ventas', 'Tickets']}
                    colAlign={['left', 'right', 'right']}
                    rows={zone.tables.map(t => [t.name, eur(t.total), num(t.count)])}
                  />
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── TAB: Productos ───────────────────────────────────────────────────────────
function ProductosTab({ from, to }: { from: string; to: string }) {
  type ProductData = {
    products: { categoryId: string; categoryName: string; productId: string; productName: string; qty: number; revenue: number }[];
    categories: { id: string; name: string; revenue: number; qty: number }[];
  };
  const { data, isLoading } = useQuery<ProductData>({
    queryKey: ['reports', 'product', from, to],
    queryFn: () => api(`/api/reports/by-product?from=${from}&to=${to}&limit=100`) as Promise<ProductData>,
  });

  return (
    <div className="space-y-5">
      {isLoading ? <Loading /> : !data ? <Empty /> : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <SectionTitle>Por familia</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={data.categories} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {data.categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => eur(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <SectionTitle>Top familias por ventas</SectionTitle>
              <div className="space-y-2">
                {data.categories.slice(0, 8).map((c, i) => {
                  const maxRev = data.categories[0]?.revenue ?? 1;
                  return (
                    <div key={c.id} className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500 w-4">{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-xs text-zinc-300 font-medium">{c.name}</span>
                          <span className="text-xs text-zinc-400">{eur(c.revenue)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-800">
                          <div className="h-full rounded-full" style={{ width: `${(c.revenue / maxRev) * 100}%`, background: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DataTable
            headers={['Familia', 'Producto', 'Unidades', 'Ingresos']}
            colAlign={['left', 'left', 'right', 'right']}
            rows={data.products.map(p => [p.categoryName, p.productName, num(p.qty), eur(p.revenue)])}
          />
        </>
      )}
    </div>
  );
}

// ─── TAB: IVA ────────────────────────────────────────────────────────────────
function IvaTab({ from, to }: { from: string; to: string }) {
  type Row = { rate: number; base: number; cuota: number; total: number; qty: number };
  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ['reports', 'vat', from, to],
    queryFn: () => api(`/api/reports/vat?from=${from}&to=${to}`) as Promise<Row[]>,
  });
  const totalBase  = data?.reduce((s, r) => s + r.base, 0) ?? 0;
  const totalCuota = data?.reduce((s, r) => s + r.cuota, 0) ?? 0;

  return (
    <div className="space-y-5">
      {isLoading ? <Loading /> : !data?.length ? <Empty /> : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <SectionTitle>Distribución por tipo de IVA</SectionTitle>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data} dataKey="cuota" nameKey="rate" cx="50%" cy="50%" outerRadius={80}
                    label={({ rate, percent }) => `${rate}% (${(percent * 100).toFixed(0)}%)`}>
                    {data.map((_, i) => <Cell key={i} fill={[TEAL, ORANGE, BLUE][i % 3]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => eur(v)} labelFormatter={l => `IVA ${l}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {data.map((r, i) => (
                <div key={r.rate} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-lg">IVA {r.rate}%</span>
                    <span className="text-sm font-semibold px-2 py-0.5 rounded-lg" style={{ background: COLORS[i] + '22', color: COLORS[i] }}>{num(r.qty)} líneas</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-zinc-500 text-xs">Base</p><p className="font-semibold text-zinc-200">{eur(r.base)}</p></div>
                    <div><p className="text-zinc-500 text-xs">Cuota</p><p className="font-semibold text-zinc-200">{eur(r.cuota)}</p></div>
                    <div><p className="text-zinc-500 text-xs">Total</p><p className="font-black text-white">{eur(r.total)}</p></div>
                  </div>
                </div>
              ))}
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 flex justify-between">
                <div><p className="text-zinc-400 text-xs">Base total</p><p className="font-black text-white">{eur(totalBase)}</p></div>
                <div className="text-right"><p className="text-zinc-400 text-xs">IVA total</p><p className="font-black text-white">{eur(totalCuota)}</p></div>
              </div>
            </div>
          </div>
          <DataTable
            headers={['Tipo IVA', 'Base imponible', 'Cuota IVA', 'Total', 'Líneas']}
            colAlign={['left', 'right', 'right', 'right', 'right']}
            rows={[
              ...data.map(r => [`${r.rate}%`, eur(r.base), eur(r.cuota), eur(r.total), num(r.qty)]),
              ['TOTAL', eur(totalBase), eur(totalCuota), eur(totalBase + totalCuota), ''],
            ]}
          />
        </>
      )}
    </div>
  );
}

// ─── TAB: Pagos ───────────────────────────────────────────────────────────────
function PagosTab({ from, to }: { from: string; to: string }) {
  type Row = { methodId: string; name: string; code: string; total: number; count: number };
  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ['reports', 'payments', from, to],
    queryFn: () => api(`/api/reports/payments?from=${from}&to=${to}`) as Promise<Row[]>,
  });
  const grandTotal = data?.reduce((s, r) => s + r.total, 0) ?? 0;

  return (
    <div className="space-y-5">
      {isLoading ? <Loading /> : !data?.length ? <Empty /> : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={data} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine>
                    {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => eur(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <SectionTitle>Por método de pago</SectionTitle>
              <div className="space-y-3">
                {data.map((r, i) => (
                  <div key={r.methodId} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="flex-1 text-zinc-300 text-sm">{r.name}</span>
                    <span className="text-zinc-500 text-xs">{num(r.count)} op.</span>
                    <span className="font-bold text-white text-sm w-28 text-right">{eur(r.total)}</span>
                    <span className="text-xs text-zinc-500 w-12 text-right">{grandTotal > 0 ? `${((r.total / grandTotal) * 100).toFixed(0)}%` : '—'}</span>
                  </div>
                ))}
                <div className="border-t border-zinc-800 pt-3 flex justify-between">
                  <span className="font-bold text-zinc-400 text-sm">Total cobrado</span>
                  <span className="font-black text-white">{eur(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
          <DataTable
            headers={['Método de pago', 'Total', 'Operaciones', '% del total']}
            colAlign={['left', 'right', 'right', 'right']}
            rows={data.map(r => [r.name, eur(r.total), num(r.count), grandTotal > 0 ? `${((r.total / grandTotal) * 100).toFixed(1)}%` : '—'])}
          />
        </>
      )}
    </div>
  );
}

// ─── TAB: Caja ────────────────────────────────────────────────────────────────
function CajaTab({ from, to }: { from: string; to: string }) {
  type Session = {
    id: string; terminalName: string; employeeName: string; openedAt: string; closedAt: string | null;
    status: string; openingFloat: number; expectedCash: number | null; countedCash: number | null;
    difference: number | null; inMovements: number; outMovements: number;
  };
  const { data, isLoading } = useQuery<Session[]>({
    queryKey: ['reports', 'cash', from, to],
    queryFn: () => api(`/api/reports/cash?from=${from}&to=${to}`) as Promise<Session[]>,
  });

  return (
    <div className="space-y-4">
      {isLoading ? <Loading /> : !data?.length ? <Empty /> : (
        data.map(s => (
          <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="font-bold text-white">{s.terminalName}</h4>
                <p className="text-zinc-500 text-sm">{s.employeeName} · Apertura: {fmtDateTime(s.openedAt)}</p>
                {s.closedAt && <p className="text-zinc-500 text-sm">Cierre: {fmtDateTime(s.closedAt)}</p>}
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${s.status === 'open' ? 'bg-green-500/15 text-green-400' : 'bg-zinc-700 text-zinc-400'}`}>
                {s.status === 'open' ? 'Abierta' : 'Cerrada'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-800/50 rounded-xl p-3">
                <p className="text-xs text-zinc-500">Fondo inicial</p>
                <p className="font-bold text-white">{eur(s.openingFloat)}</p>
              </div>
              <div className="bg-zinc-800/50 rounded-xl p-3">
                <p className="text-xs text-zinc-500">Movs. entrada</p>
                <p className="font-bold text-green-400">{eur(s.inMovements)}</p>
              </div>
              <div className="bg-zinc-800/50 rounded-xl p-3">
                <p className="text-xs text-zinc-500">Movs. salida</p>
                <p className="font-bold text-red-400">{eur(s.outMovements)}</p>
              </div>
              {s.difference != null && (
                <div className={`rounded-xl p-3 ${Math.abs(s.difference) < 0.01 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  <p className="text-xs text-zinc-500">Diferencia</p>
                  <p className={`font-black ${Math.abs(s.difference) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>{eur(s.difference)}</p>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── TAB: Descuentos y Anulaciones ───────────────────────────────────────────
function DescuentosTab({ from, to }: { from: string; to: string }) {
  type VoidsData = {
    discounts: { id: string; type: string; value: number; discountAmount: number; reason: string; authorizedBy: string | null; createdAt: string }[];
    voids: { id: string; amount: number; reason: string; authorizedBy: string | null; createdAt: string }[];
  };
  const [tab, setTab] = useState<'discounts' | 'voids'>('discounts');
  const { data, isLoading } = useQuery<VoidsData>({
    queryKey: ['reports', 'voids', from, to],
    queryFn: () => api(`/api/reports/voids?from=${from}&to=${to}`) as Promise<VoidsData>,
  });

  const TYPE_LABELS: Record<string, string> = { percentage: 'Porcentaje', fixed: 'Importe fijo', invitation: 'Invitación' };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['discounts', 'voids'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-colors ${tab === t ? 'bg-teal-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
            {t === 'discounts' ? `Descuentos (${data?.discounts.length ?? 0})` : `Anulaciones (${data?.voids.length ?? 0})`}
          </button>
        ))}
      </div>
      {isLoading ? <Loading /> : tab === 'discounts' ? (
        <DataTable
          headers={['Tipo', 'Importe', 'Descuento', 'Motivo', 'Autorizado por', 'Fecha']}
          colAlign={['left', 'right', 'right', 'left', 'left', 'left']}
          rows={(data?.discounts ?? []).map(d => [
            TYPE_LABELS[d.type] ?? d.type,
            d.type === 'percentage' ? `${d.value}%` : eur(d.value),
            eur(d.discountAmount),
            d.reason,
            d.authorizedBy ?? '—',
            fmtDateTime(d.createdAt),
          ])}
        />
      ) : (
        <DataTable
          headers={['Importe anulado', 'Motivo', 'Autorizado por', 'Fecha']}
          colAlign={['right', 'left', 'left', 'left']}
          rows={(data?.voids ?? []).map(v => [eur(v.amount), v.reason, v.authorizedBy ?? '—', fmtDateTime(v.createdAt)])}
        />
      )}
    </div>
  );
}

// ─── TAB: Horas Punta ────────────────────────────────────────────────────────
function HorasTab({ from, to }: { from: string; to: string }) {
  type Row = { hour: number; total: number; count: number };
  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ['reports', 'hours', from, to],
    queryFn: () => api(`/api/reports/peak-hours?from=${from}&to=${to}`) as Promise<Row[]>,
  });

  const peakHour = data?.reduce((best, r) => r.count > best.count ? r : best, { hour: 0, count: 0, total: 0 });

  return (
    <div className="space-y-5">
      {isLoading ? <Loading /> : !data ? <Empty /> : (
        <>
          {peakHour && peakHour.count > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <Clock size={22} />
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Hora punta</p>
                <p className="text-xl font-black text-white">{fmtHour(peakHour.hour)} — {num(peakHour.count)} tickets · {eur(peakHour.total)}</p>
              </div>
            </div>
          )}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.filter(r => r.count > 0 || r.total > 0).map(r => ({ hora: fmtHour(r.hour), tickets: r.count, ventas: r.total }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="hora" tick={{ fill: '#71717a', fontSize: 10 }} />
                <YAxis yAxisId="left"  tick={{ fill: '#71717a', fontSize: 11 }} width={30} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#71717a', fontSize: 11 }} width={52} tickFormatter={v => `${v.toFixed(0)}€`} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 shadow-xl">
                      <p className="text-xs text-zinc-400 mb-1">{label}</p>
                      <p className="text-sm text-white">{payload[0]?.value} tickets</p>
                      <p className="text-sm text-teal-400 font-bold">{eur((payload[1]?.value as number) ?? 0)}</p>
                    </div>
                  );
                }} />
                <Bar yAxisId="left"  dataKey="tickets" fill={AMBER}  radius={[4, 4, 0, 0]} name="Tickets" />
                <Bar yAxisId="right" dataKey="ventas"  fill={TEAL}   radius={[4, 4, 0, 0]} name="Ventas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            headers={['Hora', 'Tickets', 'Ventas totales']}
            colAlign={['left', 'right', 'right']}
            rows={data.filter(r => r.count > 0).map(r => [fmtHour(r.hour), num(r.count), eur(r.total)])}
          />
        </>
      )}
    </div>
  );
}

// ─── TAB: Top Productos ───────────────────────────────────────────────────────
function TopProductosTab({ from, to }: { from: string; to: string }) {
  type Row = { rank: number; productId: string; productName: string; categoryName: string; qty: number; revenue: number };
  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ['reports', 'top-products', from, to],
    queryFn: () => api(`/api/reports/top-products?from=${from}&to=${to}&limit=20`) as Promise<Row[]>,
  });
  const maxRevenue = data?.[0]?.revenue ?? 1;

  return (
    <div className="space-y-4">
      {isLoading ? <Loading /> : !data?.length ? <Empty /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.slice(0, 3).map((p, i) => (
              <div key={p.productId} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg"
                  style={{ background: [TEAL, ORANGE, BLUE][i] + '22', color: [TEAL, ORANGE, BLUE][i] }}>
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm truncate">{p.productName}</p>
                  <p className="text-xs text-zinc-500">{p.categoryName}</p>
                  <p className="text-sm font-semibold text-teal-400 mt-1">{eur(p.revenue)} · {num(p.qty)} ud.</p>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {data.map((p) => (
              <div key={p.productId} className="flex items-center gap-3 bg-zinc-900/50 rounded-xl px-4 py-2.5">
                <span className="text-zinc-600 font-bold w-6 text-right text-sm">{p.rank}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-zinc-200 font-medium truncate">{p.productName}</span>
                    <span className="text-sm font-bold text-white ml-2 shrink-0">{eur(p.revenue)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-zinc-800">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${(p.revenue / maxRevenue) * 100}%` }} />
                    </div>
                    <span className="text-xs text-zinc-500 shrink-0">{num(p.qty)} ud.</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── TABS configuration ───────────────────────────────────────────────────────
const TABS = [
  { id: 'resumen',     label: 'Resumen',       icon: <BarChart3    size={15} /> },
  { id: 'ventas',      label: 'Ventas',         icon: <TrendingUp   size={15} /> },
  { id: 'camareros',   label: 'Camareros',      icon: <Users        size={15} /> },
  { id: 'salas',       label: 'Salas y mesas',  icon: <Archive      size={15} /> },
  { id: 'productos',   label: 'Productos',      icon: <Package      size={15} /> },
  { id: 'iva',         label: 'IVA',            icon: <Tag          size={15} /> },
  { id: 'pagos',       label: 'Pagos',          icon: <Receipt      size={15} /> },
  { id: 'caja',        label: 'Caja',           icon: <Archive      size={15} /> },
  { id: 'descuentos',  label: 'Descuentos',     icon: <AlertTriangle size={15} /> },
  { id: 'horas',       label: 'Horas punta',    icon: <Clock        size={15} /> },
  { id: 'top',         label: 'Top productos',  icon: <Star         size={15} /> },
] as const;

type TabId = typeof TABS[number]['id'];

const PRESET_LABELS: { id: Preset; label: string }[] = [
  { id: 'hoy',    label: 'Hoy'        },
  { id: 'ayer',   label: 'Ayer'       },
  { id: 'semana', label: 'Semana'     },
  { id: 'mes',    label: 'Mes'        },
  { id: 'ano',    label: 'Año'        },
  { id: 'custom', label: 'Personaliz.'},
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Informes() {
  const today = new Date().toISOString().slice(0, 10);
  const [activeTab, setActiveTab] = useState<TabId>('resumen');
  const [preset, setPreset]       = useState<Preset>('hoy');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo,   setCustomTo]   = useState(today);

  const { from, to } = useMemo(
    () => getPresetRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const handleExcelDownload = useCallback(() => {
    window.open(`/api/reports/export/excel?from=${from}&to=${to}`, '_blank');
  }, [from, to]);

  const handlePrint = () => window.print();

  const tabProps = { from, to };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Print CSS */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area { background: white !important; color: black !important; }
          body { background: white; }
        }
      `}</style>

      {/* Header */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur border-b border-zinc-800/60 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 mr-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: TEAL + '22', color: TEAL }}>
              <BarChart3 size={18} />
            </div>
            <div>
              <h1 className="text-lg font-black leading-none">Informes</h1>
              <p className="text-xs text-zinc-500">Piccolo TPV — Análisis de negocio</p>
            </div>
          </div>

          {/* Preset buttons */}
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 flex-wrap">
            {PRESET_LABELS.map(p => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${preset === p.id ? 'bg-teal-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} max={customTo}
                className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              <span className="text-zinc-600">→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} min={customFrom}
                className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500" />
            </div>
          )}

          {/* Period label */}
          {preset !== 'custom' && (
            <span className="text-xs text-zinc-500">
              {from === to ? from : `${from} → ${to}`}
            </span>
          )}

          {/* Export buttons */}
          <div className="ml-auto flex gap-2">
            <button onClick={handleExcelDownload}
              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white rounded-xl px-3 py-2 text-xs font-semibold transition-colors">
              <Download size={14} /> Excel
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white rounded-xl px-3 py-2 text-xs font-semibold transition-colors">
              <Printer size={14} /> Imprimir
            </button>
          </div>
        </div>

        {/* Tab nav */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-0">
          <div className="flex gap-0.5 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === t.id
                    ? 'border-teal-500 text-teal-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 print-area">
        {activeTab === 'resumen'    && <ResumenTab     {...tabProps} />}
        {activeTab === 'ventas'     && <VentasTab      {...tabProps} />}
        {activeTab === 'camareros'  && <CamarerosTab   {...tabProps} />}
        {activeTab === 'salas'      && <SalasTab       {...tabProps} />}
        {activeTab === 'productos'  && <ProductosTab   {...tabProps} />}
        {activeTab === 'iva'        && <IvaTab         {...tabProps} />}
        {activeTab === 'pagos'      && <PagosTab       {...tabProps} />}
        {activeTab === 'caja'       && <CajaTab        {...tabProps} />}
        {activeTab === 'descuentos' && <DescuentosTab  {...tabProps} />}
        {activeTab === 'horas'      && <HorasTab       {...tabProps} />}
        {activeTab === 'top'        && <TopProductosTab {...tabProps} />}
      </div>
    </div>
  );
}
