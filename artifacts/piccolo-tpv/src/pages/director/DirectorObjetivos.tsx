import { useState, useEffect } from "react";

interface GoalProgress {
  id: string; type: string; label?: string; targetValue: string; period: string;
  actual: number; target: number; progress: number; deviation: number; deviationPct: number;
  favorable: boolean; active: boolean; periodFrom: string; periodTo: string;
}

const GOAL_TYPES = [
  { id: "sales_daily",   label: "Venta diaria",     unit: "€" },
  { id: "sales_weekly",  label: "Venta semanal",    unit: "€" },
  { id: "sales_monthly", label: "Venta mensual",    unit: "€" },
  { id: "avg_ticket",    label: "Ticket medio",     unit: "€" },
  { id: "avg_per_guest", label: "Venta por comensal", unit: "€" },
  { id: "gross_margin_pct", label: "Margen bruto %", unit: "%" },
  { id: "cogs_pct",      label: "Food cost %",      unit: "%" },
  { id: "labor_pct",     label: "Coste personal %", unit: "%" },
  { id: "occupancy_pct", label: "Ocupación %",      unit: "%" },
];
const PERIODS = [
  { id: "daily", label: "Diario" }, { id: "weekly", label: "Semanal" },
  { id: "monthly", label: "Mensual" }, { id: "yearly", label: "Anual" },
];

function fmtVal(v: number, type: string) {
  const unit = GOAL_TYPES.find(g => g.id === type)?.unit ?? "";
  if (unit === "€") return `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  return `${v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function ProgressBar({ pct, favorable }: { pct: number; favorable: boolean }) {
  const w = Math.min(pct, 100);
  const clr = pct >= 100 ? (favorable ? "bg-emerald-500" : "bg-red-500") : pct >= 70 ? "bg-blue-500" : "bg-gray-600";
  return (
    <div className="w-full bg-gray-800 rounded-full h-2.5">
      <div className={`h-full rounded-full transition-all duration-500 ${clr}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export default function DirectorObjetivos() {
  const [goals, setGoals]     = useState<GoalProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState({ type: "sales_monthly", label: "", targetValue: "", period: "monthly" });
  const [saving, setSaving]   = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/director/goals/progress", { credentials: "include" })
      .then(r => r.ok ? r.json() : []).then(setGoals).catch(() => setGoals([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSave = async () => {
    if (!form.targetValue) return;
    setSaving(true);
    try {
      const r = await fetch("/api/director/goals", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      });
      if (r.ok) { setShowForm(false); setForm({ type: "sales_monthly", label: "", targetValue: "", period: "monthly" }); load(); }
    } finally { setSaving(false); }
  };

  const handleToggle = async (id: string, active: boolean) => {
    await fetch(`/api/director/goals/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !active }),
    });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este objetivo?")) return;
    await fetch(`/api/director/goals/${id}`, { method: "DELETE", credentials: "include" });
    load();
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-white">Objetivos y seguimiento</h2>
          <p className="text-xs text-gray-400 mt-0.5">El progreso se calcula automáticamente sobre datos reales</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Nuevo objetivo
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-200 mb-4">Nuevo objetivo</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: (e.target as HTMLSelectElement).value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm">
                {GOAL_TYPES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Período</label>
              <select value={form.period} onChange={e => setForm(f => ({ ...f, period: (e.target as HTMLSelectElement).value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm">
                {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Valor objetivo ({GOAL_TYPES.find(g => g.id === form.type)?.unit ?? "€"}) *
              </label>
              <input type="number" step="0.01" value={form.targetValue} onInput={e => setForm(f => ({ ...f, targetValue: (e.target as HTMLInputElement).value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Etiqueta (opcional)</label>
              <input value={form.label} onInput={e => setForm(f => ({ ...f, label: (e.target as HTMLInputElement).value }))} placeholder="Ej: Meta julio 2026"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium">
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => setShowForm(false)} className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-lg text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {loading && <div className="flex justify-center items-center h-32 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"/></div>}

      {!loading && goals.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-sm">No hay objetivos configurados.</p>
          <p className="text-xs mt-1">Añade metas de venta, ticket medio o margen para hacer seguimiento.</p>
        </div>
      )}

      <div className="space-y-4">
        {goals.map(g => {
          const typeInfo = GOAL_TYPES.find(t => t.id === g.type);
          const isGood   = g.favorable ? g.progress >= 100 : g.progress <= 100;
          return (
            <div key={g.id} className={`bg-gray-900 border rounded-xl p-5 ${g.active ? "border-gray-800" : "border-gray-800 opacity-60"}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-200">{g.label || typeInfo?.label || g.type}</span>
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{PERIODS.find(p => p.id === g.period)?.label ?? g.period}</span>
                    {!g.active && <span className="text-xs bg-gray-800 text-gray-600 px-2 py-0.5 rounded-full">Inactivo</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{g.periodFrom} → {g.periodTo}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleToggle(g.id, g.active)} className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors">
                    {g.active ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => handleDelete(g.id)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </div>

              <div className="flex items-end justify-between mb-2">
                <div>
                  <span className="text-2xl font-bold tabular-nums text-white">{fmtVal(g.actual, g.type)}</span>
                  <span className="text-gray-500 text-sm ml-2">/ {fmtVal(g.target, g.type)}</span>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold ${isGood ? "text-emerald-400" : "text-red-400"}`}>{g.progress.toFixed(1)}%</div>
                  <div className={`text-xs ${g.favorable ? (g.deviation >= 0 ? "text-emerald-400" : "text-red-400") : (g.deviation <= 0 ? "text-emerald-400" : "text-red-400")}`}>
                    {g.deviation >= 0 ? "+" : ""}{fmtVal(g.deviation, g.type)} ({g.deviationPct >= 0 ? "+" : ""}{g.deviationPct.toFixed(1)}%)
                    {" "}{g.favorable ? (g.deviation >= 0 ? "✅" : "⚠️") : (g.deviation <= 0 ? "✅" : "⚠️")}
                  </div>
                </div>
              </div>

              <ProgressBar pct={g.progress} favorable={g.favorable} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
