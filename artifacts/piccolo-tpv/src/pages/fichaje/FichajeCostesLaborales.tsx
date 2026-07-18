/**
 * FichajeCostesLaborales — coste por empleado y período.
 * Usa GET /api/fichaje/reports/summary para calcular horas trabajadas.
 */
import { useState, useEffect } from "react";
import { Coins, RefreshCw, TrendingUp } from "lucide-react";
import { api } from "../../lib/api-client";

interface SummaryRow {
  employeeId: string;
  employeeName: string;
  totalMinutes: number;
  totalHours: string;
  totalDays: number;
  totalRecords: number;
}

interface Employee {
  id: string;
  name: string;
  hourlyRate?: number;
}

function fmt(n: number, dec = 2) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export default function FichajeCostesLaborales() {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  // Hourly rates entered locally (not persisted in this version)
  const [rates, setRates] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    api.get<SummaryRow[]>(`/api/fichaje/reports/summary?from=${from}&to=${to}`)
      .then(d => setSummary(Array.isArray(d) ? d : []))
      .catch(() => setSummary([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get<Employee[]>("/api/employees").then(d => setEmployees(d)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [from, to]);

  const totalHours = summary.reduce((acc, r) => acc + r.totalMinutes / 60, 0);
  const totalCost = summary.reduce((acc, r) => {
    const rate = parseFloat(rates[r.employeeId] ?? "0") || 0;
    return acc + (r.totalMinutes / 60) * rate;
  }, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Costes laborales</h1>
          <p className="text-muted-foreground text-sm mt-1">Resumen de horas y coste estimado por empleado</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-secondary text-foreground" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-secondary text-foreground" />
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-2xl font-bold text-foreground">{fmt(totalHours, 1)}h</div>
          <div className="text-sm text-muted-foreground mt-1">Horas totales</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-2xl font-bold text-foreground">{summary.length}</div>
          <div className="text-sm text-muted-foreground mt-1">Empleados activos</div>
        </div>
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4">
          <div className="text-2xl font-bold text-teal-600">{fmt(totalCost)} €</div>
          <div className="text-sm text-teal-600/70 mt-1">Coste estimado total</div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Calculando…</div>
      ) : summary.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Coins className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Sin datos en el período seleccionado</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-6 gap-2 px-4 py-2 bg-secondary text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="col-span-2">Empleado</div>
            <div className="text-right">Días</div>
            <div className="text-right">Horas</div>
            <div className="text-right">Tarifa/h (€)</div>
            <div className="text-right">Coste (€)</div>
          </div>
          <div className="divide-y divide-border">
            {summary.map(row => {
              const rate = parseFloat(rates[row.employeeId] ?? "0") || 0;
              const cost = (row.totalMinutes / 60) * rate;
              return (
                <div key={row.employeeId} className="grid grid-cols-6 gap-2 px-4 py-3 items-center hover:bg-secondary/40">
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-teal-500/15 text-teal-600 flex items-center justify-center text-xs font-bold shrink-0">
                        {row.employeeName.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-foreground truncate">{row.employeeName}</span>
                    </div>
                  </div>
                  <div className="text-right text-sm text-foreground">{row.totalDays}</div>
                  <div className="text-right text-sm text-foreground font-medium">{parseFloat(row.totalHours).toFixed(1)}h</div>
                  <div className="text-right">
                    <input
                      type="number" min="0" step="0.5" placeholder="0.00"
                      value={rates[row.employeeId] ?? ""}
                      onChange={e => setRates(r => ({ ...r, [row.employeeId]: e.target.value }))}
                      className="w-20 text-right border border-border rounded-lg px-2 py-1 text-xs bg-background text-foreground"
                    />
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-semibold ${cost > 0 ? "text-teal-600" : "text-muted-foreground"}`}>
                      {cost > 0 ? fmt(cost) : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-6 gap-2 px-4 py-3 bg-secondary/60 border-t border-border">
            <div className="col-span-2 text-sm font-semibold text-foreground">Total</div>
            <div className="text-right text-sm font-semibold text-foreground">—</div>
            <div className="text-right text-sm font-semibold text-foreground">{fmt(totalHours, 1)}h</div>
            <div className="text-right" />
            <div className="text-right text-sm font-semibold text-teal-600">{totalCost > 0 ? fmt(totalCost) + " €" : "—"}</div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        * Las tarifas por hora se introducen manualmente y no se guardan entre sesiones. Para persistirlas, configúralas en el perfil de cada empleado.
      </p>
    </div>
  );
}
