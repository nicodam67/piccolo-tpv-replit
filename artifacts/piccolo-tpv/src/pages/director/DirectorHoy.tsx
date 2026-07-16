import { useState, useEffect, useCallback } from "react";

interface KPIs {
  period: { from: string; to: string; days: number };
  sales: {
    gross: number; net: number; tax: number; invitations: number;
    count: number; avgTicket: number; guests: number; avgPerGuest: number;
    deliveryOrders: number; takeawayOrders: number;
  };
  costs: { cogs: number; labor: number; overhead: number; cogsEst: boolean; laborEst: boolean };
  margins: { grossMargin: number; grossMarginPct: number; operatingProfit: number; allEstimated: boolean };
  operations: { openTables: number; openAlerts: number; reservations: number };
  comparisons: {
    prevPeriod: { gross: number; count: number; guests: number; delta: { amount: number; pct: number } | null; deltaCount: { amount: number; pct: number } | null };
    prevWeek:   { gross: number; count: number; delta: { amount: number; pct: number } | null };
    prevYear:   { gross: number; count: number; delta: { amount: number; pct: number } | null; hasData: boolean };
  };
}

type Period = "today" | "yesterday" | "week" | "month" | "custom";

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtEur(n: number) { return `${fmt(n)} €`; }

function Delta({ delta }: { delta: { amount: number; pct: number } | null }) {
  if (!delta) return <span className="text-gray-500 text-xs">—</span>;
  const up  = delta.amount >= 0;
  const cls = up ? "text-emerald-400" : "text-red-400";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${cls}`}>
      {up ? "▲" : "▼"} {fmt(Math.abs(delta.pct), 1)}%
    </span>
  );
}

function KpiCard({ label, value, sub, delta, estimated, accent, wide }: {
  label: string; value: string; sub?: string;
  delta?: { amount: number; pct: number } | null;
  estimated?: boolean; accent?: string; wide?: boolean;
}) {
  return (
    <div className={`bg-gray-900 rounded-xl border border-gray-800 p-4 flex flex-col gap-1 ${wide ? "col-span-2" : ""}`}>
      <div className="flex items-start justify-between">
        <span className="text-xs text-gray-400 leading-tight">{label}</span>
        {estimated && <span className="text-xs text-amber-500/70 italic">est.</span>}
      </div>
      <div className={`text-xl font-bold tabular-nums ${accent ?? "text-white"}`}>{value}</div>
      {sub  && <div className="text-xs text-gray-500">{sub}</div>}
      {delta !== undefined && <Delta delta={delta ?? null} />}
    </div>
  );
}

function periodLabel(p: Period) {
  switch (p) {
    case "today":     return "Hoy";
    case "yesterday": return "Ayer";
    case "week":      return "Esta semana";
    case "month":     return "Este mes";
    case "custom":    return "Personalizado";
  }
}

function periodParams(p: Period, customFrom: string, customTo: string) {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const yday  = new Date(now); yday.setDate(now.getDate() - 1);
  const ydayStr = yday.toISOString().slice(0, 10);
  switch (p) {
    case "today":     return `from=${today}&to=${today}`;
    case "yesterday": return `from=${ydayStr}&to=${ydayStr}`;
    case "week": {
      const d = now.getDay(); const start = new Date(now); start.setDate(now.getDate() - d);
      return `from=${start.toISOString().slice(0, 10)}&to=${today}`;
    }
    case "month": {
      const ms = new Date(now.getFullYear(), now.getMonth(), 1);
      return `from=${ms.toISOString().slice(0, 10)}&to=${today}`;
    }
    case "custom":    return `from=${customFrom}&to=${customTo}`;
  }
}

const QUICK_LINKS = [
  { label: "Mesas", href: "/tables", icon: "🪑" },
  { label: "KDS",   href: "/kds",    icon: "🍳" },
  { label: "Reservas", href: "/reservations", icon: "📅" },
  { label: "Caja",  href: "/cash",   icon: "🏧" },
  { label: "Stock", href: "/stock",  icon: "📦" },
  { label: "RRHH",  href: "/admin/hr", icon: "👥" },
];

export default function DirectorHoy() {
  const [period, setPeriod]       = useState<Period>("today");
  const [customFrom, setFrom]     = useState(new Date().toISOString().slice(0, 10));
  const [customTo, setTo]         = useState(new Date().toISOString().slice(0, 10));
  const [kpis, setKpis]           = useState<KPIs | null>(null);
  const [loading, setLoading]     = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = periodParams(period, customFrom, customTo);
    fetch(`/api/director/kpis?${params}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setKpis(d); setLastUpdate(new Date()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 3 minutes when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(load, 180_000);
    return () => clearInterval(iv);
  }, [autoRefresh, load]);

  const s  = kpis?.sales;
  const c  = kpis?.costs;
  const m  = kpis?.margins;
  const op = kpis?.operations;
  const cmp = kpis?.comparisons;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(["today", "yesterday", "week", "month"] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === p ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {periodLabel(p)}
          </button>
        ))}
        <button
          onClick={() => setPeriod("custom")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            period === "custom" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Personalizado
        </button>
        {period === "custom" && (
          <>
            <input type="date" value={customFrom} onInput={(e) => setFrom((e.target as HTMLInputElement).value)}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-2 py-1.5 text-sm" />
            <span className="text-gray-500 text-sm">–</span>
            <input type="date" value={customTo} onInput={(e) => setTo((e.target as HTMLInputElement).value)}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-2 py-1.5 text-sm" />
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={load} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors" title="Actualizar">
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${autoRefresh ? "bg-green-900/50 text-green-400 border border-green-800" : "bg-gray-800 text-gray-400"}`}
          >
            Auto {autoRefresh ? "ON" : "OFF"}
          </button>
          {lastUpdate && (
            <span className="text-xs text-gray-500">
              Act. {lastUpdate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {/* Quick access */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {QUICK_LINKS.map(l => (
          <a key={l.href} href={l.href}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 whitespace-nowrap transition-colors border border-gray-700 flex-shrink-0">
            <span>{l.icon}</span>
            <span>{l.label}</span>
          </a>
        ))}
      </div>

      {loading && !kpis && (
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p>Cargando indicadores…</p>
          </div>
        </div>
      )}

      {kpis && (
        <div className="space-y-6">
          {/* Operations overview */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-900/30 border border-blue-800/50 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-blue-300">{op?.openTables ?? 0}</div>
              <div className="text-xs text-blue-400 mt-1">Mesas abiertas</div>
            </div>
            <div className="bg-purple-900/30 border border-purple-800/50 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-purple-300">{op?.reservations ?? 0}</div>
              <div className="text-xs text-purple-400 mt-1">Reservas del día</div>
            </div>
            <div className={`rounded-xl p-4 text-center border ${(op?.openAlerts ?? 0) > 0 ? "bg-red-900/30 border-red-800/50" : "bg-gray-900 border-gray-800"}`}>
              <div className={`text-3xl font-bold ${(op?.openAlerts ?? 0) > 0 ? "text-red-300" : "text-gray-400"}`}>{op?.openAlerts ?? 0}</div>
              <div className={`text-xs mt-1 ${(op?.openAlerts ?? 0) > 0 ? "text-red-400" : "text-gray-500"}`}>Alertas abiertas</div>
            </div>
          </div>

          {/* Sales KPIs */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">💶 Ventas — {periodLabel(period)}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="Venta bruta" value={fmtEur(s?.gross ?? 0)}
                delta={cmp?.prevPeriod.delta ?? null}
                sub={`Sem ant: ${fmtEur(cmp?.prevWeek.gross ?? 0)}`}
                accent="text-emerald-400" wide
              />
              <KpiCard label="Venta neta"   value={fmtEur(s?.net ?? 0)} />
              <KpiCard label="IVA"          value={fmtEur(s?.tax ?? 0)} />
              <KpiCard label="Invitaciones" value={fmtEur(s?.invitations ?? 0)} />
              <KpiCard
                label="Tickets" value={String(s?.count ?? 0)}
                delta={cmp?.prevPeriod.deltaCount ?? null}
              />
              <KpiCard label="Ticket medio" value={fmtEur(s?.avgTicket ?? 0)} />
              <KpiCard label="Comensales"   value={String(s?.guests ?? 0)} />
              <KpiCard label="Venta/comensal" value={fmtEur(s?.avgPerGuest ?? 0)} />
              <KpiCard label="Pedidos reparto"  value={String(s?.deliveryOrders ?? 0)} />
              <KpiCard label="Pedidos recogida" value={String(s?.takeawayOrders ?? 0)} />
            </div>
          </div>

          {/* Comparisons */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">📊 Comparativas</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-400 mb-2">Período anterior</div>
                <div className="text-lg font-bold text-white tabular-nums">{fmtEur(cmp?.prevPeriod.gross ?? 0)}</div>
                <Delta delta={cmp?.prevPeriod.delta ?? null} />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-400 mb-2">Mismos días semana anterior</div>
                <div className="text-lg font-bold text-white tabular-nums">{fmtEur(cmp?.prevWeek.gross ?? 0)}</div>
                <Delta delta={cmp?.prevWeek.delta ?? null} />
              </div>
              <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${!cmp?.prevYear.hasData ? "opacity-50" : ""}`}>
                <div className="text-xs text-gray-400 mb-2">Mismo período año anterior</div>
                <div className="text-lg font-bold text-white tabular-nums">
                  {cmp?.prevYear.hasData ? fmtEur(cmp?.prevYear.gross ?? 0) : "Sin datos"}
                </div>
                {cmp?.prevYear.hasData && <Delta delta={cmp?.prevYear.delta ?? null} />}
              </div>
            </div>
          </div>

          {/* Profitability estimates */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              📈 Rentabilidad estimada
              <span className="ml-2 font-normal normal-case text-amber-500/70 italic text-xs">Todos los valores son estimados</span>
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Coste MP (est.)" value={fmtEur(c?.cogs ?? 0)} estimated
                sub={s?.gross ? `${fmt((c?.cogs ?? 0) / s.gross * 100, 1)}% ventas` : undefined}
              />
              <KpiCard label="Coste personal (est.)" value={fmtEur(c?.labor ?? 0)} estimated
                sub={s?.gross ? `${fmt((c?.labor ?? 0) / s.gross * 100, 1)}% ventas` : undefined}
              />
              <KpiCard label="Overhead" value={fmtEur(c?.overhead ?? 0)}
                sub="Costes configurados" />
              <KpiCard label="Margen bruto (est.)" value={fmtEur(m?.grossMargin ?? 0)} estimated
                accent={(m?.grossMargin ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}
                sub={`${fmt(m?.grossMarginPct ?? 0, 1)}%`}
              />
              <KpiCard label="Beneficio operativo (est.)" value={fmtEur(m?.operatingProfit ?? 0)} estimated
                accent={(m?.operatingProfit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}
                wide
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
