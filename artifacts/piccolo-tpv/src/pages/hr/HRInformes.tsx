import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, TrendingUp, TrendingDown, Download, RefreshCw } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };
}

type HoursReport = {
  period: string;
  employees: Array<{
    employeeId: string; name: string;
    plannedHours: number; actualHours: number; deviation: number;
    estimatedCost: number; hourlyRate: number; employerCostRate: number;
  }>;
};

type CostReport = {
  period: string;
  totalCost: number; totalHours: number; avgCostPerHour: number;
  byEmployee: Array<{
    employeeId: string; name: string;
    hours: number; hourlyRate: number; employerCostRate: number; estimatedCost: number;
  }>;
};

type VsSalesReport = {
  from: string; to: string;
  totalSales: number; totalCost: number; totalHours: number;
  costPctOfSales: number | null; costPerHour: number;
};

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function downloadCsv(data: string, name: string) {
  const blob = new Blob(["\uFEFF" + data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

type Tab = "hours" | "costs" | "vs-sales";

export default function HRInformes() {
  const [activeTab, setActiveTab] = useState<Tab>("hours");
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [toDate, setToDate] = useState(() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  });

  const hoursQuery = useQuery<HoursReport>({
    queryKey: ["hr-report-hours", period],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/hr/reports/hours?period=${period}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: activeTab === "hours",
  });

  const costsQuery = useQuery<CostReport>({
    queryKey: ["hr-report-costs", period],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/hr/reports/costs?period=${period}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: activeTab === "costs",
  });

  const vsSalesQuery = useQuery<VsSalesReport>({
    queryKey: ["hr-report-vs-sales", fromDate, toDate],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/hr/reports/vs-sales?from=${fromDate}&to=${toDate}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: activeTab === "vs-sales",
  });

  const exportHoursCsv = () => {
    if (!hoursQuery.data) return;
    const rows = [
      "Empleado,Horas planificadas,Horas reales,Desviación,Coste estimado (€)",
      ...hoursQuery.data.employees.map((e) =>
        `"${e.name}",${e.plannedHours},${e.actualHours},${e.deviation},${e.estimatedCost}`
      ),
    ].join("\n");
    downloadCsv(rows, `horas-${period}.csv`);
  };

  const exportCostsCsv = () => {
    if (!costsQuery.data) return;
    const rows = [
      "Empleado,Horas,Tarifa/h (€),Coste estimado (€)",
      ...costsQuery.data.byEmployee.map((e) =>
        `"${e.name}",${e.hours},${e.hourlyRate},${e.estimatedCost}`
      ),
    ].join("\n");
    downloadCsv(rows, `costes-${period}.csv`);
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "hours", label: "Horas planificadas vs reales" },
    { id: "costs", label: "Coste de personal" },
    { id: "vs-sales", label: "Coste vs ventas" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 rounded-lg p-1 border border-gray-800">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
              activeTab === t.id ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Period selector */}
      {activeTab !== "vs-sales" && (
        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm text-gray-400">Periodo:</label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => activeTab === "hours" ? hoursQuery.refetch() : costsQuery.refetch()}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeTab === "vs-sales" && (
        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm text-gray-400">Desde:</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
          <label className="text-sm text-gray-400">Hasta:</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
          <button onClick={() => vsSalesQuery.refetch()} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── HOURS ─── */}
      {activeTab === "hours" && (
        <div>
          {hoursQuery.isLoading ? (
            <p className="text-center text-gray-500 py-10">Cargando informe...</p>
          ) : hoursQuery.data ? (
            <>
              <div className="flex justify-end mb-3">
                <button onClick={exportHoursCsv} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">
                  <Download className="w-4 h-4" /> Exportar CSV
                </button>
              </div>
              {/* Summary bar */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <SummaryCard
                  label="Total horas planificadas"
                  value={`${fmt(hoursQuery.data.employees.reduce((a, e) => a + e.plannedHours, 0))} h`}
                />
                <SummaryCard
                  label="Total horas reales"
                  value={`${fmt(hoursQuery.data.employees.reduce((a, e) => a + e.actualHours, 0))} h`}
                />
                <SummaryCard
                  label="Coste total estimado"
                  value={`${fmt(hoursQuery.data.employees.reduce((a, e) => a + e.estimatedCost, 0))} €`}
                />
              </div>
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50">
                    <tr>
                      <th className="text-left px-4 py-2 text-gray-400 font-medium">Empleado</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Planificadas</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Reales</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Desviación</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Coste est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hoursQuery.data.employees.filter((e) => e.plannedHours > 0 || e.actualHours > 0).map((e) => (
                      <tr key={e.employeeId} className="border-t border-gray-800 hover:bg-gray-800/30">
                        <td className="px-4 py-3 font-medium">{e.name}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{fmt(e.plannedHours)} h</td>
                        <td className="px-4 py-3 text-right text-gray-300">{fmt(e.actualHours)} h</td>
                        <td className={`px-4 py-3 text-right font-medium ${Math.abs(e.deviation) > 5 ? "text-yellow-400" : e.deviation >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {e.deviation >= 0 ? "+" : ""}{fmt(e.deviation)} h
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{fmt(e.estimatedCost)} €</td>
                      </tr>
                    ))}
                    {hoursQuery.data.employees.filter((e) => e.plannedHours > 0 || e.actualHours > 0).length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Sin datos para este periodo</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ─── COSTS ─── */}
      {activeTab === "costs" && (
        <div>
          {costsQuery.isLoading ? (
            <p className="text-center text-gray-500 py-10">Cargando informe...</p>
          ) : costsQuery.data ? (
            <>
              <div className="flex justify-end mb-3">
                <button onClick={exportCostsCsv} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">
                  <Download className="w-4 h-4" /> Exportar CSV
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <SummaryCard label="Coste total estimado" value={`${fmt(costsQuery.data.totalCost)} €`} />
                <SummaryCard label="Horas trabajadas" value={`${fmt(costsQuery.data.totalHours)} h`} />
                <SummaryCard label="Coste promedio/hora" value={`${fmt(costsQuery.data.avgCostPerHour)} €/h`} />
              </div>
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50">
                    <tr>
                      <th className="text-left px-4 py-2 text-gray-400 font-medium">Empleado</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Horas</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Tarifa/h</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Coef.</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Coste est.</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">% total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costsQuery.data.byEmployee.filter((e) => e.hours > 0).map((e) => (
                      <tr key={e.employeeId} className="border-t border-gray-800 hover:bg-gray-800/30">
                        <td className="px-4 py-3 font-medium">{e.name}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{fmt(e.hours)} h</td>
                        <td className="px-4 py-3 text-right text-gray-300">{fmt(e.hourlyRate)} €</td>
                        <td className="px-4 py-3 text-right text-gray-300">×{fmt(e.employerCostRate, 2)}</td>
                        <td className="px-4 py-3 text-right font-medium">{fmt(e.estimatedCost)} €</td>
                        <td className="px-4 py-3 text-right text-gray-400">
                          {costsQuery.data!.totalCost > 0 ? `${fmt(e.estimatedCost / costsQuery.data!.totalCost * 100, 1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                    {costsQuery.data.byEmployee.filter((e) => e.hours > 0).length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Sin datos para este periodo</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ─── VS SALES ─── */}
      {activeTab === "vs-sales" && (
        <div>
          {vsSalesQuery.isLoading ? (
            <p className="text-center text-gray-500 py-10">Cargando informe...</p>
          ) : vsSalesQuery.data ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <SummaryCard label="Ventas totales" value={`${fmt(vsSalesQuery.data.totalSales)} €`} />
                <SummaryCard label="Coste personal" value={`${fmt(vsSalesQuery.data.totalCost)} €`} />
                <SummaryCard label="Horas trabajadas" value={`${fmt(vsSalesQuery.data.totalHours)} h`} />
                <SummaryCard
                  label="% Coste / ventas"
                  value={vsSalesQuery.data.costPctOfSales !== null ? `${fmt(vsSalesQuery.data.costPctOfSales, 1)}%` : "—"}
                  color={
                    vsSalesQuery.data.costPctOfSales !== null
                      ? vsSalesQuery.data.costPctOfSales > 35
                        ? "text-red-400"
                        : vsSalesQuery.data.costPctOfSales > 28
                        ? "text-yellow-400"
                        : "text-green-400"
                      : "text-gray-400"
                  }
                />
                <SummaryCard label="Coste promedio/hora" value={`${fmt(vsSalesQuery.data.costPerHour)} €/h`} />
              </div>

              {vsSalesQuery.data.costPctOfSales !== null && (
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                  <p className="text-sm text-gray-400 mb-3">Benchmark de coste de personal sobre ventas</p>
                  <div className="relative h-8 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                        vsSalesQuery.data.costPctOfSales! > 35 ? "bg-red-600" :
                        vsSalesQuery.data.costPctOfSales! > 28 ? "bg-yellow-600" : "bg-green-600"
                      }`}
                      style={{ width: `${Math.min(vsSalesQuery.data.costPctOfSales!, 100)}%` }}
                    />
                    {/* Benchmark markers */}
                    <div className="absolute top-0 h-full border-l-2 border-white/30" style={{ left: "28%" }}>
                      <span className="absolute -top-5 -translate-x-1/2 text-xs text-gray-500">28%</span>
                    </div>
                    <div className="absolute top-0 h-full border-l-2 border-white/30" style={{ left: "35%" }}>
                      <span className="absolute -top-5 -translate-x-1/2 text-xs text-gray-500">35%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-600 inline-block" /> &lt;28% Óptimo</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-600 inline-block" /> 28-35% Aceptable</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-600 inline-block" /> &gt;35% Elevado</span>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
